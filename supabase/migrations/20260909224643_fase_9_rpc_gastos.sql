-- =============================================================================
-- Fase 9.3: mutaciones de Gastos detrás de RPCs service_role.
--
-- Las Server Actions validan sesión/permisos; estas funciones repiten las
-- invariantes contables y bloquean la fila de usuario/gasto para que un error
-- de cliente nunca pueda escribir importes o estados inconsistentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_gasto(
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
  p_creado_por uuid
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

  v_folio := public.generar_folio_gasto('GTO');

  RETURN QUERY
  INSERT INTO public.gastos (
    folio, orden_id, proveedor_id, categoria, descripcion,
    monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio,
    fecha_gasto, fecha_vencimiento, comprobante_url, folio_comprobante,
    metodo_pago, datos_ocr_json, notas, creado_por
  ) VALUES (
    v_folio, p_orden_id, p_proveedor_id, lower(trim(p_categoria)), btrim(p_descripcion),
    round(p_monto_subtotal, 4), round(p_monto_iva, 4), round(p_monto_total, 4),
    upper(trim(p_moneda)), round(p_tipo_cambio, 4), p_fecha_gasto, p_fecha_vencimiento,
    NULLIF(btrim(p_comprobante_url), ''), NULLIF(btrim(p_folio_comprobante), ''),
    NULLIF(lower(trim(p_metodo_pago)), ''), p_datos_ocr_json, NULLIF(btrim(p_notas), ''),
    p_creado_por
  )
  RETURNING gastos.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_gasto(
  uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, date, date,
  text, text, text, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_gasto(
  uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, date, date,
  text, text, text, jsonb, text, uuid
) TO service_role;

-- El usuario se coloca antes del parámetro opcional porque PostgreSQL no
-- permite parámetros obligatorios después de uno con DEFAULT.
DROP FUNCTION IF EXISTS public.cambiar_estado_gasto(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.cambiar_estado_gasto(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.cambiar_estado_gasto(
  p_gasto_id uuid,
  p_nuevo_estado text,
  p_usuario_id uuid,
  p_estado_esperado text DEFAULT NULL
)
RETURNS SETOF public.gastos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gasto public.gastos%ROWTYPE;
  v_nuevo_estado text := lower(trim(coalesce(p_nuevo_estado, '')));
BEGIN
  IF p_gasto_id IS NULL OR p_usuario_id IS NULL
     OR v_nuevo_estado NOT IN ('pendiente', 'pagado', 'cancelado') THEN
    RAISE EXCEPTION 'estado_gasto_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
    AND permiso.permiso = 'registrar_gastos'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_gastos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT gasto.* INTO v_gasto
  FROM public.gastos AS gasto
  WHERE gasto.id = p_gasto_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gasto_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_estado_esperado IS NOT NULL
     AND v_gasto.estado_pago <> lower(trim(p_estado_esperado)) THEN
    RAISE EXCEPTION 'gasto_version_obsoleta' USING ERRCODE = 'check_violation';
  END IF;

  IF v_gasto.estado_pago = v_nuevo_estado THEN
    RETURN QUERY SELECT v_gasto.*;
    RETURN;
  END IF;

  IF v_gasto.estado_pago <> 'pendiente' THEN
    RAISE EXCEPTION 'transicion_estado_gasto_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.gastos AS gasto
  SET estado_pago = v_nuevo_estado
  WHERE gasto.id = p_gasto_id
  RETURNING gasto.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cambiar_estado_gasto(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_gasto(uuid, text, uuid, text)
  TO service_role;
