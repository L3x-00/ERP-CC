-- A20/AR-02: excepción para una orden manual/histórica entregada sin AR.
-- La ruta ordinaria comercial conserva la AR creada al aprobar (D-04).
CREATE OR REPLACE FUNCTION public.abrir_ar_excepcion_entregada(
  p_orden_id uuid,
  p_monto_total numeric,
  p_moneda text,
  p_tipo_cambio_origen numeric,
  p_fecha_vencimiento timestamptz,
  p_folio_factura text,
  p_actor_id uuid
)
RETURNS TABLE (cuenta_id uuid, cliente_id uuid, referencia_interna text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_folio text := nullif(btrim(p_folio_factura), '');
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL
     OR p_monto_total IS NULL OR p_monto_total <= 0 OR p_monto_total > 99999999.9999
     OR p_monto_total IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0 OR p_tipo_cambio_origen > 999999.9999
     OR p_tipo_cambio_origen IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_moneda NOT IN ('MXN', 'USD')
     OR (v_moneda = 'MXN' AND p_tipo_cambio_origen <> 1)
     OR p_fecha_vencimiento IS NULL
     OR v_folio IS NULL OR length(v_folio) > 60 THEN
    RAISE EXCEPTION 'datos_ar_excepcion_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_ar_excepcion' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion orden
  WHERE orden.id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden.es_interna OR v_orden.estado <> 'completada' OR v_orden.archivada_en IS NULL THEN
    RAISE EXCEPTION 'orden_no_entregada_para_ar' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cuentas_por_cobrar WHERE orden_id = p_orden_id) THEN
    RAISE EXCEPTION 'cuenta_por_cobrar_ya_existe' USING ERRCODE = 'unique_violation';
  END IF;
  PERFORM 1 FROM public.clientes cliente
  WHERE cliente.id = v_orden.cliente_id AND cliente.estado = 'activo'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.cuentas_por_cobrar AS cuenta (
    orden_id, cliente_id, folio_factura_remision, monto_total, saldo_pendiente,
    moneda, tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
  ) VALUES (
    p_orden_id, v_orden.cliente_id, v_folio, round(p_monto_total, 4), round(p_monto_total, 4),
    v_moneda, round(p_tipo_cambio_origen, 4), 'pendiente', p_fecha_vencimiento,
    v_orden.archivada_en
  )
  RETURNING cuenta.id, cuenta.cliente_id, cuenta.referencia_interna;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'cuenta_por_cobrar_ya_existe' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.abrir_ar_excepcion_entregada(uuid,numeric,text,numeric,timestamptz,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_ar_excepcion_entregada(uuid,numeric,text,numeric,timestamptz,text,uuid)
  TO service_role;
