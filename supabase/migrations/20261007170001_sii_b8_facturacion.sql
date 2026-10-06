-- =============================================================================
-- SII-B8 F2 — Facturación: borrador administrativo y vínculo entrega→factura→CxC
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.2/§8.3 F2; documento cliente §14.
-- Decisiones del PO (2026-10-06): montos precargados y editables; una factura
-- por entrega; emitir vincula a la AR (factura_id + folio + vencimiento por
-- términos); cancelar desvincula la AR y permite re-facturar. Sin timbrado
-- CFDI: el folio fiscal se captura del PAC.
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- 1. Tabla de facturas (una activa por entrega; folio fiscal único).
CREATE TABLE IF NOT EXISTS public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion(id),
  entrega_id uuid NOT NULL REFERENCES public.notas_entrega(id),
  estado text NOT NULL DEFAULT 'BORRADOR'
    CONSTRAINT facturas_estado_check CHECK (estado IN ('BORRADOR', 'EMITIDA', 'CANCELADA')),
  subtotal numeric(14, 4)
    CONSTRAINT facturas_subtotal_check CHECK (subtotal IS NULL OR subtotal >= 0),
  iva numeric(14, 4)
    CONSTRAINT facturas_iva_check CHECK (iva IS NULL OR iva >= 0),
  total numeric(14, 4)
    CONSTRAINT facturas_total_check CHECK (total IS NULL OR total >= 0),
  folio_fiscal text
    CONSTRAINT facturas_folio_longitud CHECK (folio_fiscal IS NULL OR length(folio_fiscal) BETWEEN 1 AND 60),
  rfc_receptor text
    CONSTRAINT facturas_rfc_longitud CHECK (rfc_receptor IS NULL OR length(rfc_receptor) BETWEEN 1 AND 13),
  uuid_fiscal text
    CONSTRAINT facturas_uuid_longitud CHECK (uuid_fiscal IS NULL OR length(uuid_fiscal) BETWEEN 1 AND 64),
  emitida_en timestamptz,
  cancelada_en timestamptz,
  motivo_cancelacion text,
  creado_por uuid REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facturas_emitida_completa CHECK (
    estado <> 'EMITIDA'
    OR (folio_fiscal IS NOT NULL AND emitida_en IS NOT NULL AND cancelada_en IS NULL)),
  CONSTRAINT facturas_borrador_limpio CHECK (
    estado <> 'BORRADOR'
    OR (folio_fiscal IS NULL AND emitida_en IS NULL AND cancelada_en IS NULL AND motivo_cancelacion IS NULL)),
  CONSTRAINT facturas_cancelada_completa CHECK (
    estado <> 'CANCELADA'
    OR (cancelada_en IS NOT NULL AND nullif(btrim(coalesce(motivo_cancelacion, '')), '') IS NOT NULL))
);

COMMENT ON TABLE public.facturas IS
'SII-B8 F2: factura administrativa (BORRADOR→EMITIDA→CANCELADA) ligada a una entrega y a la AR de su orden; el folio fiscal se captura del PAC (sin timbrado CFDI).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_entrega_activa
  ON public.facturas (entrega_id) WHERE estado <> 'CANCELADA';
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_folio_fiscal
  ON public.facturas (folio_fiscal) WHERE folio_fiscal IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_facturas_estado_creado
  ON public.facturas (estado, creado_en DESC);

-- 2. Vínculo con CxC (una AR puede quedar ligada a una factura a la vez).
ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS factura_id uuid REFERENCES public.facturas(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_factura
  ON public.cuentas_por_cobrar (factura_id) WHERE factura_id IS NOT NULL;
COMMENT ON COLUMN public.cuentas_por_cobrar.factura_id IS
'SII-B8 F2: factura emitida que documenta esta AR (NULL si aún no se factura o si la factura se canceló).';

-- 3. Timestamp de actualización.
DROP TRIGGER IF EXISTS trigger_facturas_actualizado_en ON public.facturas;
CREATE TRIGGER trigger_facturas_actualizado_en
  BEFORE UPDATE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- 4. RLS y privilegios (mismo patrón que cuentas_por_cobrar: lectura con
--    ver_finanzas; toda escritura pasa por RPC SECURITY DEFINER).
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturas_seleccionar ON public.facturas;
CREATE POLICY facturas_seleccionar ON public.facturas
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));

REVOKE ALL ON public.facturas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.facturas TO authenticated;
GRANT ALL ON public.facturas TO service_role;

-- 5. RPCs del ciclo de vida.

-- 5.1 Crear borrador desde una entrega (idempotente por entrega activa).
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
    cliente_id, orden_id, entrega_id, estado, subtotal, iva, total, rfc_receptor, creado_por
  )
  SELECT orden.cliente_id, orden.id, v_nota.id, 'BORRADOR', v_subtotal, v_iva, v_total, v_rfc, p_actor_id
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_nota.orden_id
  RETURNING * INTO v_factura;

  RETURN QUERY SELECT v_factura.id, v_factura.estado, v_factura.cliente_id,
    v_factura.orden_id, v_factura.entrega_id, v_factura.subtotal, v_factura.iva,
    v_factura.total, v_factura.rfc_receptor, v_factura.actualizado_en, false;
END;
$function$;

COMMENT ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid) IS
'SII-B8 F2: crea (o devuelve) el borrador de factura de una entrega con montos precargados/editables. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_factura_borrador(uuid, jsonb, uuid, uuid) TO service_role;

-- 5.2 Editar borrador (CAS).
CREATE OR REPLACE FUNCTION public.actualizar_factura_borrador(
  p_factura_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_datos jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  subtotal numeric,
  iva numeric,
  total numeric,
  rfc_receptor text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_factura public.facturas%ROWTYPE;
BEGIN
  IF p_factura_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'sin_permiso_factura' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas AS factura
  WHERE factura.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_factura.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'factura_no_editable' USING ERRCODE = 'check_violation', DETAIL = v_factura.estado;
  END IF;
  IF v_factura.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'factura_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET
    subtotal = nullif(p_datos ->> 'subtotal', '')::numeric(14, 4),
    iva = nullif(p_datos ->> 'iva', '')::numeric(14, 4),
    total = nullif(p_datos ->> 'total', '')::numeric(14, 4),
    rfc_receptor = nullif(btrim(coalesce(p_datos ->> 'rfc_receptor', '')), '')
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, factura.subtotal, factura.iva,
    factura.total, factura.rfc_receptor, factura.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.actualizar_factura_borrador(uuid, timestamptz, jsonb, uuid, uuid) IS
'SII-B8 F2: edita montos/RFC de un borrador con compare-and-set. Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_factura_borrador(uuid, timestamptz, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_factura_borrador(uuid, timestamptz, jsonb, uuid, uuid) TO service_role;

-- 5.3 Emitir: captura el folio fiscal y vincula la AR de la orden.
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
'SII-B8 F2: emite el borrador con folio fiscal capturado y vincula folio/vencimiento (términos del cliente) a la AR de la orden. Solo service_role.';

REVOKE ALL ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) TO service_role;

-- 5.4 Cancelar: conserva historial y desvincula la AR (permite re-facturar).
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

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET factura_id = NULL, folio_factura_remision = NULL
  WHERE cuenta.factura_id = p_factura_id
  RETURNING cuenta.id INTO v_ar_id;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET estado = 'CANCELADA', cancelada_en = now(), motivo_cancelacion = v_motivo
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, v_ar_id, factura.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid) IS
'SII-B8 F2: cancela una factura con motivo; si estaba emitida, desvincula la AR (conserva vencimiento) y permite re-facturar. Solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_factura(uuid, timestamptz, text, uuid, uuid) TO service_role;
