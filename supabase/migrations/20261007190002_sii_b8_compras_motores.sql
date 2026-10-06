-- =============================================================================
-- SII-B8 F4 (motores) — Gastos con folio CG y ciclo de compras/CxP
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.3 F4; decisiones PO 2026-10-06.
-- Recrea registrar_gasto (asigna folio_sii CG de la serie compartida; conserva
-- el folio interno GTO) e incorpora el ciclo de la compra con pagos parciales.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007190001).
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
  v_folio_sii text;
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
  v_folio_sii := privado.siguiente_folio_cg();

  RETURN QUERY
  INSERT INTO public.gastos (
    folio, folio_sii, orden_id, proveedor_id, categoria, descripcion,
    monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio,
    fecha_gasto, fecha_vencimiento, comprobante_url, folio_comprobante,
    metodo_pago, datos_ocr_json, notas, creado_por, cuenta_bancaria_id
  ) VALUES (
    v_folio, v_folio_sii, p_orden_id, p_proveedor_id, lower(trim(p_categoria)), btrim(p_descripcion),
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

COMMENT ON FUNCTION public.registrar_gasto(uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, timestamptz, timestamptz, text, text, text, jsonb, text, uuid, uuid) IS
'SII-B8 F4: registra el gasto con folio CG-MMYY_#### de la serie compartida (GTO interno); solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_gasto(uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, timestamptz, timestamptz, text, text, text, jsonb, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_gasto(uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, timestamptz, timestamptz, text, text, text, jsonb, text, uuid, uuid)
  TO service_role;


-- -----------------------------------------------------------------------------
-- F4: ciclo de vida de la compra (BORRADOR→CONFIRMADA→RECIBIDA→PAGADA/CANCELADA).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_compra(
  p_proveedor_id uuid,
  p_orden_id uuid,
  p_monto_subtotal numeric,
  p_monto_iva numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha_vencimiento date,
  p_notas text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  folio_sii text,
  estado text,
  monto_total numeric,
  saldo_pendiente numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_total numeric(14, 4);
  v_folio text;
  v_compra public.compras%ROWTYPE;
BEGIN
  IF p_proveedor_id IS NULL OR p_actor_id IS NULL
     OR p_monto_subtotal IS NULL OR p_monto_subtotal < 0
     OR p_monto_iva IS NULL OR p_monto_iva < 0
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR (upper(trim(p_moneda)) = 'MXN' AND round(p_tipo_cambio, 4) <> 1)
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.proveedores AS proveedor
  WHERE proveedor.id = p_proveedor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proveedor_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_orden_id IS NOT NULL THEN
    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = p_orden_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento < current_date THEN
    RAISE EXCEPTION 'vencimiento_compra_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_total := round(p_monto_subtotal + p_monto_iva, 4);
  v_folio := privado.siguiente_folio_cg();

  INSERT INTO public.compras (
    folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
    moneda, tipo_cambio, saldo_pendiente, fecha_vencimiento, notas, creado_por
  ) VALUES (
    v_folio, p_proveedor_id, p_orden_id, 'BORRADOR', round(p_monto_subtotal, 4),
    round(p_monto_iva, 4), v_total, upper(trim(p_moneda)), round(p_tipo_cambio, 4),
    v_total, p_fecha_vencimiento, NULLIF(btrim(p_notas), ''), p_actor_id
  )
  RETURNING * INTO v_compra;

  RETURN QUERY SELECT v_compra.id, v_compra.folio_sii, v_compra.estado,
    v_compra.monto_total, v_compra.saldo_pendiente, v_compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.crear_compra(uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid) IS
'SII-B8 F4: crea la compra en BORRADOR con folio CG-MMYY_#### de la serie compartida; solo service_role.';

REVOKE ALL ON FUNCTION public.crear_compra(uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_compra(uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.actualizar_compra_borrador(
  p_compra_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_proveedor_id uuid,
  p_orden_id uuid,
  p_monto_subtotal numeric,
  p_monto_iva numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha_vencimiento date,
  p_notas text,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  proveedor_id uuid,
  orden_id uuid,
  monto_subtotal numeric,
  monto_iva numeric,
  monto_total numeric,
  moneda text,
  tipo_cambio numeric,
  saldo_pendiente numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_total numeric(14, 4);
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR p_proveedor_id IS NULL
     OR p_monto_subtotal IS NULL OR p_monto_subtotal < 0
     OR p_monto_iva IS NULL OR p_monto_iva < 0
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR (upper(trim(p_moneda)) = 'MXN' AND round(p_tipo_cambio, 4) <> 1)
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'compra_no_editable' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
  END IF;
  IF v_compra.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'compra_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.proveedores AS proveedor WHERE proveedor.id = p_proveedor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proveedor_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_orden_id IS NOT NULL THEN
    PERFORM 1 FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_total := round(p_monto_subtotal + p_monto_iva, 4);

  RETURN QUERY
  UPDATE public.compras AS compra
  SET
    proveedor_id = p_proveedor_id,
    orden_id = p_orden_id,
    monto_subtotal = round(p_monto_subtotal, 4),
    monto_iva = round(p_monto_iva, 4),
    monto_total = v_total,
    saldo_pendiente = v_total,
    moneda = upper(trim(p_moneda)),
    tipo_cambio = round(p_tipo_cambio, 4),
    fecha_vencimiento = p_fecha_vencimiento,
    notas = NULLIF(btrim(p_notas), '')
  WHERE compra.id = p_compra_id
  RETURNING compra.id, compra.proveedor_id, compra.orden_id, compra.monto_subtotal,
    compra.monto_iva, compra.monto_total, compra.moneda, compra.tipo_cambio,
    compra.saldo_pendiente, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.actualizar_compra_borrador(uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid) IS
'SII-B8 F4: edita una compra BORRADOR con compare-and-set; solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_compra_borrador(uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_compra_borrador(uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cambiar_estado_compra(
  p_compra_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_estado_destino text,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_destino text := upper(trim(coalesce(p_estado_destino, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_destino NOT IN ('CONFIRMADA', 'RECIBIDA', 'CANCELADA')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'compra_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_destino = 'CONFIRMADA' THEN
    IF v_compra.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
  ELSIF v_destino = 'RECIBIDA' THEN
    IF v_compra.estado <> 'CONFIRMADA' THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
  ELSE
    IF v_compra.estado NOT IN ('BORRADOR', 'CONFIRMADA') THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
    IF v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 300 THEN
      RAISE EXCEPTION 'motivo_cancelacion_invalido' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pagos_compra AS pago WHERE pago.compra_id = p_compra_id) THEN
      RAISE EXCEPTION 'compra_con_pagos' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.compras AS compra
  SET
    estado = v_destino,
    motivo_cancelacion = CASE WHEN v_destino = 'CANCELADA' THEN v_motivo ELSE compra.motivo_cancelacion END,
    cancelada_en = CASE WHEN v_destino = 'CANCELADA' THEN now() ELSE compra.cancelada_en END
  WHERE compra.id = p_compra_id
  RETURNING compra.id, compra.estado, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid) IS
'SII-B8 F4: confirma, recibe o cancela (con motivo y sin pagos) una compra; solo service_role.';

REVOKE ALL ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pagar_compra(
  p_compra_id uuid,
  p_monto numeric,
  p_metodo_pago text,
  p_referencia text,
  p_cuenta_bancaria_id uuid,
  p_notas text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pago_id uuid,
  compra_id uuid,
  estado text,
  saldo_pendiente numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_pago_id uuid;
  v_saldo numeric(14, 4);
  v_estado text;
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL
     OR p_monto IS NULL OR p_monto <= 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR lower(trim(coalesce(p_metodo_pago, ''))) NOT IN ('transferencia', 'efectivo', 'cheque', 'tarjeta')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_pago_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.estado NOT IN ('CONFIRMADA', 'RECIBIDA') THEN
    RAISE EXCEPTION 'compra_no_pagable' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
  END IF;
  IF round(p_monto, 4) > v_compra.saldo_pendiente THEN
    RAISE EXCEPTION 'monto_excede_saldo' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id AND usuario.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_bancarias AS banco
    WHERE banco.id = p_cuenta_bancaria_id AND banco.activa
      AND banco.moneda = v_compra.moneda
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_bancaria_no_disponible' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.pagos_compra (
    compra_id, monto, metodo_pago, referencia, cuenta_bancaria_id, notas, creado_por
  ) VALUES (
    p_compra_id, round(p_monto, 4), lower(trim(p_metodo_pago)),
    NULLIF(btrim(p_referencia), ''), p_cuenta_bancaria_id, NULLIF(btrim(p_notas), ''), p_actor_id
  ) RETURNING id INTO v_pago_id;

  v_saldo := round(v_compra.saldo_pendiente - round(p_monto, 4), 4);
  v_estado := CASE WHEN v_saldo <= 0 THEN 'PAGADA' ELSE v_compra.estado END;

  RETURN QUERY
  UPDATE public.compras AS compra
  SET saldo_pendiente = v_saldo, estado = v_estado
  WHERE compra.id = p_compra_id
  RETURNING v_pago_id, compra.id, compra.estado, compra.saldo_pendiente, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid) IS
'SII-B8 F4: registra un pago (parcial/total) de la compra en su moneda y deriva PAGADA al saldar; solo service_role.';

REVOKE ALL ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid)
  TO service_role;
