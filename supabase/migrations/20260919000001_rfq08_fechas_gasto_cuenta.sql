-- =============================================================================
-- Migración: RFQ-08 (fechas de seguimiento y vencimiento de la cotización) y
-- OBS-28 (cuenta bancaria de salida en gastos).
-- ORCA MFG ERP — Pipeline / Gastos. La aplica el PO.
--
-- 1. `pipeline.fecha_seguimiento` y `pipeline.fecha_vencimiento_cotizacion`:
--    fechas editables en días calendario; la UI propone +3 y +10 días HÁBILES
--    (utilidad pura en la app) pero el dato es libre y consultable.
-- 2. `gastos.cuenta_bancaria_id`: permite identificar la cuenta de salida y
--    calcular flujo por cuenta (ingresos de pagos_ar vs egresos de gastos).
--    ON DELETE SET NULL conserva el histórico si la cuenta se retira.
-- 3. `registrar_gasto` gana `p_cuenta_bancaria_id uuid DEFAULT NULL` (firma
--    nueva: se hace DROP de la anterior y se re-otorgan permisos). Vuelve a
--    declarar el cuerpo íntegro de 20260909224643 con la validación de la
--    cuenta y la columna nueva; el resto de reglas queda idéntico.
--
-- Aditivo e idempotente en columnas; la función se recrea en la misma
-- transacción. `CREATE FUNCTION` sin OR REPLACE es deliberado: la firma cambia
-- de 17 a 18 argumentos y el DROP previo evita ambigüedad.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fechas de seguimiento y vencimiento de la cotización (RFQ-08).
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS fecha_seguimiento date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_cotizacion date;

COMMENT ON COLUMN public.pipeline.fecha_seguimiento IS
  'RFQ-08: próximo seguimiento comercial; la UI propone +3 días hábiles desde el envío.';
COMMENT ON COLUMN public.pipeline.fecha_vencimiento_cotizacion IS
  'RFQ-08: vigencia de la cotización; la UI propone +10 días hábiles desde el envío.';

-- -----------------------------------------------------------------------------
-- 2. Cuenta bancaria de salida del gasto (OBS-28).
-- -----------------------------------------------------------------------------
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid
  REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.gastos.cuenta_bancaria_id IS
  'OBS-28: cuenta bancaria de salida; NULL en gastos históricos o sin cuenta.';

CREATE INDEX IF NOT EXISTS idx_gastos_cuenta_bancaria
  ON public.gastos (cuenta_bancaria_id);

-- -----------------------------------------------------------------------------
-- 3. RPC registrar_gasto con cuenta (DROP + CREATE por cambio de firma).
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_gasto(
  uuid, uuid, text, text, numeric, numeric, numeric, text, numeric,
  timestamptz, timestamptz, text, text, text, jsonb, text, uuid
);

CREATE FUNCTION public.registrar_gasto(
  p_orden_id uuid,
  p_proveedor_id uuid,
  p_categoria text,
  p_descripcion text,
  p_monto_subtotal numeric,
  p_monto_iva numeric,
  p_monto_total numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha_gasto timestamptz,
  p_fecha_vencimiento timestamptz,
  p_comprobante_url text,
  p_folio_comprobante text,
  p_metodo_pago text,
  p_datos_ocr_json jsonb,
  p_notas text,
  p_creado_por uuid,
  -- OBS-28: cuenta bancaria de salida (opcional; se valida si llega).
  p_cuenta_bancaria_id uuid DEFAULT NULL
)
RETURNS SETOF public.gastos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folio text;
BEGIN
  IF p_creado_por IS NULL THEN
    RAISE EXCEPTION 'usuario_requerido' USING ERRCODE = 'not_null_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
  WHERE usuario.id = p_creado_por
    AND usuario.activo = true
    AND permiso.permiso = 'registrar_gastos'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_gastos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_categoria IS NULL OR lower(trim(p_categoria)) NOT IN (
    'materia_prima', 'consumibles', 'herramentental', 'maquila_externa',
    'logistica', 'servicios_generales', 'nomina', 'mantenimiento', 'otros'
  ) THEN
    RAISE EXCEPTION 'categoria_gasto_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_descripcion IS NULL OR char_length(btrim(p_descripcion)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'descripcion_gasto_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_monto_subtotal IS NULL OR p_monto_iva IS NULL OR p_monto_total IS NULL
     OR p_monto_subtotal < 0 OR p_monto_iva < 0 OR p_monto_total < 0
     OR p_monto_subtotal IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_monto_iva IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_monto_total IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_monto_total <> round(p_monto_subtotal + p_monto_iva, 4) THEN
    RAISE EXCEPTION 'importes_gasto_incoherentes' USING ERRCODE = 'check_violation';
  END IF;

  IF upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR p_tipo_cambio IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR (upper(trim(p_moneda)) = 'MXN' AND p_tipo_cambio <> 1) THEN
    RAISE EXCEPTION 'moneda_tipo_cambio_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  IF p_fecha_gasto IS NULL
     OR (p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento < p_fecha_gasto) THEN
    RAISE EXCEPTION 'fechas_gasto_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  IF p_comprobante_url IS NOT NULL AND p_comprobante_url !~* '^https?://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'url_comprobante_insegura' USING ERRCODE = 'check_violation';
  END IF;

  IF p_orden_id IS NOT NULL THEN
    PERFORM 1 FROM public.ordenes_produccion WHERE id = p_orden_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  IF p_proveedor_id IS NOT NULL THEN
    PERFORM 1 FROM public.proveedores WHERE id = p_proveedor_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proveedor_inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_bancarias WHERE id = p_cuenta_bancaria_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  v_folio := public.generar_folio_gasto('GTO');

  RETURN QUERY
  INSERT INTO public.gastos (
    folio, orden_id, proveedor_id, categoria, descripcion,
    monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio,
    fecha_gasto, fecha_vencimiento, comprobante_url, folio_comprobante,
    metodo_pago, datos_ocr_json, notas, creado_por, cuenta_bancaria_id
  ) VALUES (
    v_folio, p_orden_id, p_proveedor_id, lower(trim(p_categoria)), btrim(p_descripcion),
    round(p_monto_subtotal, 4), round(p_monto_iva, 4), round(p_monto_total, 4),
    upper(trim(p_moneda)), round(p_tipo_cambio, 4), p_fecha_gasto, p_fecha_vencimiento,
    NULLIF(btrim(p_comprobante_url), ''), NULLIF(btrim(p_folio_comprobante), ''),
    NULLIF(lower(trim(p_metodo_pago)), ''), p_datos_ocr_json, NULLIF(btrim(p_notas), ''),
    p_creado_por,
    p_cuenta_bancaria_id
  )
  RETURNING gastos.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_gasto(
  uuid, uuid, text, text, numeric, numeric, numeric, text, numeric,
  timestamptz, timestamptz, text, text, text, jsonb, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_gasto(
  uuid, uuid, text, text, numeric, numeric, numeric, text, numeric,
  timestamptz, timestamptz, text, text, text, jsonb, text, uuid, uuid
) TO service_role;
