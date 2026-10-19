-- =============================================================================
-- C10.3/F-12 — No cancelar una factura con cobros aplicados.
--
-- La ficha C10.3 conservaba el default D8=A («cancelar con cobros conserva el
-- comportamiento»), pero la respuesta registrada del cliente manda impedirlo.
-- Se redefinine `cancelar_factura` desde la versión de C10.2b y se añade la
-- guarda antes de tocar la CxC/factura.
--
-- Un pago cuenta como aplicado si tiene una fila en `aplicaciones_pago` para la
-- CxC, o si es un pago legacy con `ar_id` y sin aplicaciones, y NO está en
-- `reversos_pago_ar`. Un cobro reversado no bloquea.
--
-- Aplicar SOLO local; el PO la aplica en remoto ANTES del despliegue.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_factura(
  p_factura_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  ar_id uuid,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_factura public.facturas%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ar_id uuid;
  v_siguiente_id uuid;
  v_siguiente_folio text;
  v_siguiente_vencimiento timestamptz;
BEGIN
  IF p_factura_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 500
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_cancelacion_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas AS factura
  WHERE factura.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_factura.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'factura_ya_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_factura.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'factura_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  v_ar_id := v_factura.cuenta_id;
  IF v_ar_id IS NULL THEN
    SELECT cuenta.id INTO v_ar_id
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.factura_id = p_factura_id
    LIMIT 1;
  END IF;

  -- F-12: un cobro aplicado (no reversado) impide cancelar la factura.
  IF v_ar_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.aplicaciones_pago AS aplicacion
      WHERE aplicacion.cuenta_id = v_ar_id
        AND NOT EXISTS (
          SELECT 1 FROM public.reversos_pago_ar AS reverso
          WHERE reverso.pago_id = aplicacion.pago_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.pagos_ar AS pago
      WHERE pago.ar_id = v_ar_id
        AND NOT EXISTS (
          SELECT 1 FROM public.reversos_pago_ar AS reverso
          WHERE reverso.pago_id = pago.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.aplicaciones_pago AS aplicacion
          WHERE aplicacion.pago_id = pago.id
        )
    )
  ) THEN
    RAISE EXCEPTION 'factura_con_cobros' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET estado = 'CANCELADA', cancelada_en = now(), motivo_cancelacion = v_motivo
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, v_ar_id, factura.actualizado_en;

  IF v_ar_id IS NOT NULL THEN
    SELECT factura.id, factura.folio_fiscal, factura.fecha_vencimiento
    INTO v_siguiente_id, v_siguiente_folio, v_siguiente_vencimiento
    FROM public.facturas AS factura
    WHERE factura.cuenta_id = v_ar_id
      AND factura.estado = 'EMITIDA'
      AND factura.id <> p_factura_id
    ORDER BY factura.emitida_en DESC NULLS LAST, factura.creado_en DESC
    LIMIT 1;

    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      factura_id = v_siguiente_id,
      folio_factura_remision = v_siguiente_folio,
      fecha_vencimiento = COALESCE(v_siguiente_vencimiento, cuenta.fecha_vencimiento)
    WHERE cuenta.id = v_ar_id;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid) IS
  'SII-B8 F2 + C10.2b + C10.3/F-12: cancela con motivo, rechaza si hay cobros aplicados no reversados y recalcula la CxC a la última factura activa. Solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid)
  TO service_role;
