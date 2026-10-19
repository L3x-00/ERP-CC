-- =============================================================================
-- C10.2b/F-03 A — Factura por entrega sobre una sola CxC.
--
-- El cliente factura cada entrega de una Orden; la CxC es una por Orden y se
-- factura parcialmente (la consolidación fiscal queda para después).
--   * `facturas.cuenta_id` es el vínculo autoritativo factura -> CxC;
--   * `cuentas_por_cobrar.factura_id` queda como puntero a la última factura
--     activa (compatibilidad con Cobranza), no como candado de una sola;
--   * se elimina `cuenta_ya_facturada`;
--   * se guarda el vencimiento por factura para poder recalcular el puntero al
--     cancelar la última;
--   * se impide facturar más que el total de la CxC.
--
-- Aplicar SOLO local; el PO la aplica en remoto ANTES del despliegue.
-- =============================================================================

-- 1. Vínculo autoritativo y vencimiento por factura.
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS cuenta_id uuid
    REFERENCES public.cuentas_por_cobrar (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;

COMMENT ON COLUMN public.facturas.cuenta_id IS
  'C10.2b/F-03 A: CxC de la Orden a la que pertenece esta factura. Varias facturas activas pueden compartir la misma CxC.';
COMMENT ON COLUMN public.facturas.fecha_vencimiento IS
  'C10.2b: vencimiento calculado al emitir; permite restaurar el puntero de la CxC al cancelar la última factura.';

-- Backfill: la CxC es única por Orden. Las facturas históricas sin vínculo se
-- enlazan por orden_id; el vencimiento solo se copia para la factura que hoy
-- apunta la CxC (las demás no tienen ese dato histórico).
UPDATE public.facturas AS factura
SET cuenta_id = cuenta.id
FROM public.cuentas_por_cobrar AS cuenta
WHERE cuenta.orden_id = factura.orden_id
  AND factura.cuenta_id IS NULL;

UPDATE public.facturas AS factura
SET fecha_vencimiento = cuenta.fecha_vencimiento
FROM public.cuentas_por_cobrar AS cuenta
WHERE cuenta.factura_id = factura.id
  AND factura.fecha_vencimiento IS NULL;

CREATE INDEX IF NOT EXISTS ix_facturas_cuenta_estado
  ON public.facturas (cuenta_id, estado, emitida_en DESC);

-- 2. El puntero de la CxC ya no es la única factura: se relaja el índice único.
DROP INDEX IF EXISTS public.ux_cuentas_factura;
CREATE INDEX IF NOT EXISTS ix_cuentas_factura
  ON public.cuentas_por_cobrar (factura_id)
  WHERE factura_id IS NOT NULL;

-- 3. Crear borrador: guarda el vínculo desde el inicio (si la CxC ya existe).
CREATE OR REPLACE FUNCTION public.crear_factura_borrador(
  p_entrega_id uuid,
  p_datos jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  cliente_id uuid,
  orden_id uuid,
  entrega_id uuid,
  subtotal numeric,
  iva numeric,
  total numeric,
  rfc_receptor text,
  actualizado_en timestamptz,
  ya_existia boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_nota public.notas_entrega%ROWTYPE;
  v_existente public.facturas%ROWTYPE;
  v_subtotal numeric(14, 4);
  v_iva numeric(14, 4);
  v_total numeric(14, 4);
  v_rfc text;
  v_factura public.facturas%ROWTYPE;
BEGIN
  IF p_entrega_id IS NULL OR p_actor_id IS NULL
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'sin_permiso_factura' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT nota.* INTO v_nota
  FROM public.notas_entrega AS nota
  WHERE nota.id = p_entrega_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT factura.* INTO v_existente
  FROM public.facturas AS factura
  WHERE factura.entrega_id = p_entrega_id
    AND factura.estado <> 'CANCELADA'
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.estado, v_existente.cliente_id,
      v_existente.orden_id, v_existente.entrega_id, v_existente.subtotal,
      v_existente.iva, v_existente.total, v_existente.rfc_receptor,
      v_existente.actualizado_en, true;
    RETURN;
  END IF;

  v_subtotal := nullif(p_datos ->> 'subtotal', '')::numeric(14, 4);
  v_iva := nullif(p_datos ->> 'iva', '')::numeric(14, 4);
  v_total := nullif(p_datos ->> 'total', '')::numeric(14, 4);
  v_rfc := nullif(btrim(coalesce(p_datos ->> 'rfc_receptor', '')), '');

  INSERT INTO public.facturas (
    cliente_id, orden_id, entrega_id, cuenta_id, estado, subtotal, iva, total,
    rfc_receptor, creado_por
  )
  SELECT orden.cliente_id, orden.id, v_nota.id,
    (SELECT cuenta.id FROM public.cuentas_por_cobrar AS cuenta
     WHERE cuenta.orden_id = orden.id LIMIT 1),
    'BORRADOR', v_subtotal, v_iva, v_total, v_rfc, p_actor_id
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_nota.orden_id
  RETURNING * INTO v_factura;

  RETURN QUERY SELECT v_factura.id, v_factura.estado, v_factura.cliente_id,
    v_factura.orden_id, v_factura.entrega_id, v_factura.subtotal, v_factura.iva,
    v_factura.total, v_factura.rfc_receptor, v_factura.actualizado_en, false;
END;
$function$;

COMMENT ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid) IS
  'SII-B8 F2 + C10.2b: crea (o devuelve) el borrador de factura de una entrega y lo vincula a la CxC de la Orden. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid)
  TO service_role;

-- 4. Emitir: sin cuenta_ya_facturada; guarda cuenta_id/vencimiento y valida
--    que la suma de facturas activas no exceda la CxC.
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
  v_vencimiento timestamptz;
  v_facturado numeric(14, 4);
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

  -- D4-B: crédito exige días configurados en el cliente; nunca un 45 fijo.
  IF EXISTS (
    SELECT 1
    FROM public.clientes AS cliente
    WHERE cliente.id = v_cuenta.cliente_id
      AND lower(trim(coalesce(cliente.condiciones_pago, ''))) = 'credito'
      AND (
        cliente.credito_habilitado IS NOT TRUE
        OR cliente.dias_credito IS NULL
        OR cliente.dias_credito NOT BETWEEN 1 AND 365
      )
  ) THEN
    RAISE EXCEPTION 'cliente_credito_sin_dias' USING ERRCODE = 'check_violation';
  END IF;

  -- F-03 A: varias facturas por CxC, pero la suma no puede excederla.
  SELECT COALESCE(SUM(factura.total), 0)
  INTO v_facturado
  FROM public.facturas AS factura
  WHERE factura.cuenta_id = v_cuenta.id
    AND factura.estado = 'EMITIDA'
    AND factura.id <> p_factura_id;
  IF v_factura.total IS NOT NULL
     AND v_facturado + v_factura.total > v_cuenta.monto_total + 0.01 THEN
    RAISE EXCEPTION 'factura_excede_cuenta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT CASE
    WHEN v_cuenta.cobrable_desde IS NOT NULL THEN now() + make_interval(days => CASE
      lower(trim(coalesce(cliente.condiciones_pago, '')))
      WHEN 'contado' THEN 0
      WHEN '15_dias' THEN 15
      WHEN '30_dias' THEN 30
      WHEN 'credito' THEN cliente.dias_credito
      ELSE 30
    END)
    ELSE NULL
  END
  INTO v_vencimiento
  FROM public.clientes AS cliente
  WHERE cliente.id = v_cuenta.cliente_id;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    factura_id = v_factura.id,
    folio_factura_remision = v_folio,
    fecha_vencimiento = v_vencimiento
  WHERE cuenta.id = v_cuenta.id
  RETURNING cuenta.id, cuenta.folio_factura_remision, cuenta.fecha_vencimiento
  INTO v_cuenta.id, v_ar_folio, v_ar_vencimiento;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET
    estado = 'EMITIDA',
    folio_fiscal = v_folio,
    rfc_receptor = v_rfc,
    uuid_fiscal = v_uuid,
    emitida_en = now(),
    cuenta_id = v_cuenta.id,
    fecha_vencimiento = v_ar_vencimiento
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, factura.folio_fiscal, v_cuenta.id,
    v_ar_folio, v_ar_vencimiento, factura.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) IS
  'SII-B8 F2/D4-B + C10.2b: emite una factura por entrega, la vincula a la CxC y limita la suma de facturas activas al total de la CxC. Solo service_role.';

REVOKE ALL ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid)
  TO service_role;

-- 5. Cancelar: recalcula el puntero de la CxC a la última factura activa.
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
  'SII-B8 F2 + C10.2b: cancela con motivo y recalcula la CxC a la última factura activa (o la deja sin vínculo). Solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid)
  TO service_role;
