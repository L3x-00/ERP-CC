-- Egreso vinculado a material: una compra de material actualiza el costo
-- unitario del catálogo para consumos y cotizaciones futuros, sin tocar lo ya
-- cotizado, aceptado o en proceso. El precio se calcula desde el subtotal (sin
-- IVA) entre la cantidad comprada, en la unidad base del material.
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.catalogo_materiales(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cantidad_material numeric(12,4),
  ADD COLUMN IF NOT EXISTS costo_unitario_material numeric(12,4);

-- El contador registra egresos y, en empresas pequeñas, también fija el costo
-- del material. Se añade el permiso sin quitar ninguno de los existentes.
INSERT INTO public.permisos_rol (rol, permiso)
VALUES ('contador', 'gestionar_inventario')
ON CONFLICT (rol, permiso) DO NOTHING;

-- Alta de gasto con vinculación opcional a material. Se reutilizan las RPC
-- existentes de propuesta/confirmación de costo: historial append-only y CAS.
CREATE OR REPLACE FUNCTION public.registrar_gasto_a19(p_datos jsonb, p_usuario_id uuid)
RETURNS SETOF public.gastos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_gasto public.gastos%ROWTYPE;
  v_tipo text := p_datos->>'tipoGasto';
  v_ruta text := p_datos->>'comprobanteRuta';
  v_material_id uuid := (p_datos->>'materialId')::uuid;
  v_cantidad numeric := (p_datos->>'cantidadMaterial')::numeric;
  v_material public.catalogo_materiales%ROWTYPE;
  v_propuesta_id uuid;
  v_unitario numeric;
  v_moneda text := upper(btrim(coalesce(p_datos->>'moneda', '')));
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR v_tipo IS NULL OR v_tipo NOT IN ('fijo', 'variable') THEN
    RAISE EXCEPTION 'tipo_gasto_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF v_ruta IS NOT NULL AND v_ruta !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$' THEN
    RAISE EXCEPTION 'ruta_comprobante_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO STRICT v_gasto FROM public.registrar_gasto(
    (p_datos->>'ordenId')::uuid,
    (p_datos->>'proveedorId')::uuid,
    p_datos->>'categoria', p_datos->>'descripcion',
    (p_datos->>'montoSubtotal')::numeric,
    (p_datos->>'montoIva')::numeric,
    (p_datos->>'montoTotal')::numeric,
    p_datos->>'moneda', (p_datos->>'tipoCambio')::numeric,
    (p_datos->>'fechaGasto')::timestamptz,
    (p_datos->>'fechaVencimiento')::timestamptz,
    p_datos->>'comprobanteUrl', p_datos->>'folioComprobante',
    p_datos->>'metodoPago', p_datos->'datosOcrJson',
    p_datos->>'notas', p_usuario_id,
    (p_datos->>'cuentaBancariaId')::uuid
  );
  UPDATE public.gastos SET tipo_gasto = v_tipo, comprobante_ruta = v_ruta
  WHERE id = v_gasto.id RETURNING * INTO v_gasto;

  IF v_material_id IS NOT NULL THEN
    IF NOT privado.actor_con_permiso(p_usuario_id, 'gestionar_inventario') THEN
      RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501',
        DETAIL = 'Tu usuario puede registrar gastos pero no fijar el costo del material. Pide a administración el permiso «gestionar inventario» o registra el gasto sin vincular a material.';
    END IF;
    IF v_cantidad IS NULL OR v_cantidad <= 0
       OR v_cantidad IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'cantidad_material_invalida' USING ERRCODE = '22023',
        DETAIL = 'Indica la cantidad comprada en la unidad base del material (mayor que cero) para calcular el costo unitario.';
    END IF;

    SELECT * INTO v_material
    FROM public.catalogo_materiales AS material
    WHERE material.id = v_material_id AND material.activo = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_inexistente_o_inactivo' USING ERRCODE = 'P0002';
    END IF;
    IF v_moneda IS DISTINCT FROM v_material.moneda_costo THEN
      RAISE EXCEPTION 'moneda_gasto_material_distinta: La moneda del gasto es %, pero el material % está en %. Registra el gasto en % o cambia la moneda del material antes de vincularlo.',
        v_moneda, v_material.codigo, v_material.moneda_costo, v_material.moneda_costo
        USING ERRCODE = 'check_violation';
    END IF;

    v_unitario := round((p_datos->>'montoSubtotal')::numeric / v_cantidad, 4);
    IF v_unitario IS NULL OR v_unitario <= 0 THEN
      RAISE EXCEPTION 'costo_unitario_invalido' USING ERRCODE = '22023',
        DETAIL = 'El subtotal del gasto debe ser mayor que cero para calcular el costo unitario del material.';
    END IF;

    v_propuesta_id := public.proponer_costo_material(
      v_material_id, v_unitario, v_moneda,
      (p_datos->>'fechaGasto')::date, 'GASTO', v_gasto.folio, p_usuario_id
    );
    PERFORM 1 FROM public.confirmar_costo_material(
      v_material_id, v_unitario, v_moneda,
      (p_datos->>'fechaGasto')::date, 'GASTO', v_gasto.folio,
      p_usuario_id, v_material.actualizado_en, v_propuesta_id
    );

    UPDATE public.gastos
    SET material_id = v_material_id,
        cantidad_material = v_cantidad,
        costo_unitario_material = v_unitario
    WHERE id = v_gasto.id RETURNING * INTO v_gasto;
  END IF;

  RETURN NEXT v_gasto;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_gasto_a19(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_gasto_a19(jsonb, uuid) TO service_role;

-- La edición conserva el vínculo y recalcula el unitario informativo, pero no
-- vuelve a fijar el precio del catálogo: ese efecto pertenece al alta.
CREATE OR REPLACE FUNCTION public.editar_gasto_a19(
  p_gasto_id uuid, p_actualizado_en timestamptz, p_datos jsonb, p_usuario_id uuid
)
RETURNS SETOF public.gastos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_gasto public.gastos%ROWTYPE;
  v_ruta text;
  v_tipo text;
  v_cantidad numeric := (p_datos->>'cantidadMaterial')::numeric;
BEGIN
  PERFORM 1 FROM public.usuarios u
  JOIN public.permisos_rol p ON p.rol = u.rol
  WHERE u.id = p_usuario_id AND u.activo AND p.permiso = 'registrar_gastos'
  FOR KEY SHARE OF u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_gastos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_gasto FROM public.gastos WHERE id = p_gasto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gasto_inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF v_gasto.estado_pago <> 'pendiente' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_actualizado_en IS NULL OR v_gasto.actualizado_en <> p_actualizado_en THEN
    RAISE EXCEPTION 'version_obsoleta' USING ERRCODE = 'serialization_failure';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'datos_gasto_invalidos' USING ERRCODE = 'check_violation';
  END IF;
  v_tipo := p_datos->>'tipoGasto';
  v_ruta := COALESCE(p_datos->>'comprobanteRuta', v_gasto.comprobante_ruta);
  IF v_tipo IS NULL OR v_tipo NOT IN ('fijo', 'variable') THEN
    RAISE EXCEPTION 'tipo_gasto_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF v_ruta IS NOT NULL AND v_ruta !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$' THEN
    RAISE EXCEPTION 'ruta_comprobante_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_gasto.comprobante_ruta IS NOT NULL AND v_ruta IS DISTINCT FROM v_gasto.comprobante_ruta THEN
    INSERT INTO public.comprobantes_gasto_historial (gasto_id, ruta, reemplazado_por)
    VALUES (v_gasto.id, v_gasto.comprobante_ruta, p_usuario_id);
  END IF;

  UPDATE public.gastos SET
    orden_id = (p_datos->>'ordenId')::uuid,
    proveedor_id = (p_datos->>'proveedorId')::uuid,
    cuenta_bancaria_id = (p_datos->>'cuentaBancariaId')::uuid,
    categoria = p_datos->>'categoria',
    descripcion = btrim(p_datos->>'descripcion'),
    tipo_gasto = v_tipo,
    monto_subtotal = (p_datos->>'montoSubtotal')::numeric,
    monto_iva = (p_datos->>'montoIva')::numeric,
    monto_total = (p_datos->>'montoTotal')::numeric,
    moneda = p_datos->>'moneda',
    tipo_cambio = (p_datos->>'tipoCambio')::numeric,
    fecha_gasto = (p_datos->>'fechaGasto')::timestamptz,
    fecha_vencimiento = (p_datos->>'fechaVencimiento')::timestamptz,
    folio_comprobante = p_datos->>'folioComprobante',
    metodo_pago = p_datos->>'metodoPago',
    material_id = (p_datos->>'materialId')::uuid,
    cantidad_material = v_cantidad,
    costo_unitario_material = CASE
      WHEN v_cantidad > 0 THEN round((p_datos->>'montoSubtotal')::numeric / v_cantidad, 4)
      ELSE NULL
    END,
    datos_ocr_json = CASE
      WHEN p_datos ? 'datosOcrJson' THEN p_datos->'datosOcrJson'
      WHEN v_ruta IS DISTINCT FROM v_gasto.comprobante_ruta THEN NULL
      ELSE v_gasto.datos_ocr_json
    END,
    notas = p_datos->>'notas',
    comprobante_ruta = v_ruta
  WHERE id = p_gasto_id RETURNING * INTO v_gasto;
  RETURN NEXT v_gasto;
END;
$$;
REVOKE ALL ON FUNCTION public.editar_gasto_a19(uuid, timestamptz, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_gasto_a19(uuid, timestamptz, jsonb, uuid) TO service_role;
