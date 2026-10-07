-- =============================================================================
-- SII-B8 F2 (ajuste) — emitir_factura respeta el plazo de crédito (45 días)
--
-- La recreación de F2 recalculaba el vencimiento con un CASE sin 'credito'
-- (caía a 30). La regla vigente (A16/OBS-21) es contado 0, 15/30 días y
-- credito 45 días tras la entrega total. Se alinea la emisión de facturas.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007210001).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.emitir_factura(
  p_factura_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_folio_fiscal text,
  p_rfc_receptor text,
  p_uuid_fiscal text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  folio_fiscal text,
  ar_id uuid,
  ar_folio text,
  ar_vencimiento timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_factura public.facturas%ROWTYPE;
  v_folio text := nullif(btrim(coalesce(p_folio_fiscal, '')), '');
  v_rfc text := nullif(btrim(coalesce(p_rfc_receptor, '')), '');
  v_uuid text := nullif(btrim(coalesce(p_uuid_fiscal, '')), '');
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_ar_folio text;
  v_ar_vencimiento timestamptz;
BEGIN
  IF p_factura_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_folio IS NULL OR length(v_folio) > 60
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_factura_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas AS factura
  WHERE factura.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_factura.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'factura_no_emitible' USING ERRCODE = 'check_violation', DETAIL = v_factura.estado;
  END IF;
  IF v_factura.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'factura_desactualizada' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.facturas AS otra
    WHERE otra.folio_fiscal = v_folio AND otra.id <> p_factura_id
  ) THEN
    RAISE EXCEPTION 'folio_fiscal_duplicado' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_cuenta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = v_factura.orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.factura_id IS NOT NULL AND v_cuenta.factura_id <> p_factura_id THEN
    RAISE EXCEPTION 'cuenta_ya_facturada' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    factura_id = v_factura.id,
    folio_factura_remision = v_folio,
    fecha_vencimiento = CASE
      WHEN cuenta.cobrable_desde IS NOT NULL THEN now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN 'credito' THEN 45
        ELSE 30
      END)
      ELSE NULL
    END
  FROM public.clientes AS cliente
  WHERE cuenta.id = v_cuenta.id
    AND cliente.id = cuenta.cliente_id
  RETURNING cuenta.id, cuenta.folio_factura_remision, cuenta.fecha_vencimiento
  INTO v_cuenta.id, v_ar_folio, v_ar_vencimiento;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET
    estado = 'EMITIDA',
    folio_fiscal = v_folio,
    rfc_receptor = v_rfc,
    uuid_fiscal = v_uuid,
    emitida_en = now()
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, factura.folio_fiscal, v_cuenta.id,
    v_ar_folio, v_ar_vencimiento, factura.actualizado_en;
END;
$function$;
COMMENT ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) IS
'SII-B8 F2: emite el borrador con folio fiscal capturado y vincula folio/vencimiento (contado 0, 15/30 días, credito 45) a la AR de la orden. Solo service_role.';

REVOKE ALL ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) TO service_role;
