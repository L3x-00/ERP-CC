-- A19: clasificación, comprobantes privados y edición atómica de gastos pendientes.
-- Los gastos históricos conservan tipo NULL: no se inventa una clasificación.
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS tipo_gasto text,
  ADD COLUMN IF NOT EXISTS comprobante_ruta text;

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_tipo_a19 CHECK (tipo_gasto IS NULL OR tipo_gasto IN ('fijo', 'variable')),
  ADD CONSTRAINT gastos_ruta_a19 CHECK (
    comprobante_ruta IS NULL OR comprobante_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$'
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes-gasto', 'comprobantes-gasto', false)
ON CONFLICT (id) DO UPDATE SET public = false;
-- Sin políticas de storage.objects: únicamente service_role sube y firma URLs.

CREATE TABLE IF NOT EXISTS public.comprobantes_gasto_historial (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gasto_id uuid NOT NULL REFERENCES public.gastos(id) ON DELETE RESTRICT,
  ruta text NOT NULL,
  reemplazado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  reemplazado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT
);
REVOKE ALL ON public.comprobantes_gasto_historial FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.comprobantes_gasto_historial TO service_role;
ALTER TABLE public.comprobantes_gasto_historial ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.registrar_gasto_a19(p_datos jsonb, p_usuario_id uuid)
RETURNS SETOF public.gastos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_gasto public.gastos%ROWTYPE;
  v_tipo text := p_datos->>'tipoGasto';
  v_ruta text := p_datos->>'comprobanteRuta';
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
  RETURN NEXT v_gasto;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_gasto_a19(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_gasto_a19(jsonb, uuid) TO service_role;

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
