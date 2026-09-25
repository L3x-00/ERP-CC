-- A20/CLI-08: repetir un trabajo desde una orden histórica o completada.
-- Reutiliza solo datos comerciales/técnicos, nunca la ejecución anterior:
-- sin avances, sesiones, pagos, documentos ni notas. El alta usa el mismo canal
-- administrativo de ORD-06 (excepción D-01/OBS-15) y crea su propia AR borrador.
-- -----------------------------------------------------------------------------

ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS orden_origen_id uuid
    REFERENCES public.ordenes_produccion (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_origen
  ON public.ordenes_produccion (orden_origen_id)
  WHERE orden_origen_id IS NOT NULL;

COMMENT ON COLUMN public.ordenes_produccion.orden_origen_id IS
  'CLI-08: orden de la que este trabajo reutilizó datos comerciales/técnicos.';

CREATE OR REPLACE FUNCTION public.repetir_orden_op(
  p_orden_origen_id uuid,
  p_actor_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, cuenta_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen public.ordenes_produccion%ROWTYPE;
  v_partidas jsonb;
  v_orden_id uuid;
  v_folio text;
  v_cuenta_id uuid;
  v_ar_monto numeric;
  v_ar_subtotal numeric;
  v_ar_iva numeric;
  v_ar_moneda text;
  v_ar_tc numeric;
BEGIN
  IF p_orden_origen_id IS NULL OR p_actor_id IS NULL OR p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'repeticion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_repetir_orden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_origen
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_origen_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Solo tiene sentido repetir un trabajo terminado o uno heredado; una orden
  -- activa, cancelada o en borrador no es historial.
  IF v_origen.estado = 'cancelada'
     OR NOT (v_origen.id_historico IS NOT NULL OR v_origen.estado = 'completada') THEN
    RAISE EXCEPTION 'orden_no_repetible' USING ERRCODE = 'check_violation';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'codigo_pieza', partida.codigo_pieza,
      'descripcion', partida.descripcion,
      'cantidad_solicitada', partida.cantidad_solicitada,
      'unidad_medida', partida.unidad_medida,
      'material_id', partida.material_id,
      'tiempo_estimado_minutos', partida.tiempo_estimado_minutos,
      'maquina_asignada', partida.maquina_asignada,
      'area_trabajo_codigo', partida.area_trabajo_codigo,
      'procesos', partida.procesos,
      'es_externo', partida.es_externo,
      'proveedor_externo', partida.proveedor_externo
    )
    ORDER BY partida.creado_en, partida.id
  )
  INTO v_partidas
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_origen_id;

  IF v_partidas IS NULL OR jsonb_array_length(v_partidas) = 0 THEN
    RAISE EXCEPTION 'orden_sin_partidas' USING ERRCODE = 'check_violation';
  END IF;

  -- La repetición crea una OP nueva con folio propio y metas inicializadas por
  -- el trigger de ORD-07; las cantidades producidas parten de cero.
  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    v_origen.cliente_id, NULL, p_fecha_compromiso, v_origen.prioridad, v_partidas
  ) AS creada;

  UPDATE public.ordenes_produccion AS orden
  SET
    estado = 'programada',
    orden_origen_id = p_orden_origen_id,
    referencia_externa = v_origen.referencia_externa,
    condicion_pago = v_origen.condicion_pago,
    horas_estimadas = v_origen.horas_estimadas,
    monto_sin_iva = v_origen.monto_sin_iva,
    monto_iva = v_origen.monto_iva
  WHERE orden.id = v_orden_id;

  -- Precio comercial: se copia del desglose de la AR de origen si existe; si no,
  -- de los montos capturados. Nunca se copian pagos ni saldos.
  SELECT cuenta.monto_total, cuenta.monto_subtotal, cuenta.monto_iva,
         cuenta.moneda, cuenta.tipo_cambio_origen
  INTO v_ar_monto, v_ar_subtotal, v_ar_iva, v_ar_moneda, v_ar_tc
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_origen_id
  FOR KEY SHARE;

  IF FOUND THEN
    INSERT INTO public.cuentas_por_cobrar (
      orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
      tipo_cambio_origen, estado, monto_subtotal, monto_iva
    ) VALUES (
      v_orden_id, v_origen.cliente_id, v_ar_monto, v_ar_monto, v_ar_moneda,
      v_ar_tc, 'pendiente', v_ar_subtotal, v_ar_iva
    )
    RETURNING cuentas_por_cobrar.id INTO v_cuenta_id;
  ELSIF v_origen.monto_sin_iva IS NOT NULL THEN
    INSERT INTO public.cuentas_por_cobrar (
      orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
      tipo_cambio_origen, estado, monto_subtotal, monto_iva
    ) VALUES (
      v_orden_id, v_origen.cliente_id, v_origen.monto_sin_iva + v_origen.monto_iva,
      v_origen.monto_sin_iva + v_origen.monto_iva, 'MXN', 1, 'pendiente',
      v_origen.monto_sin_iva, v_origen.monto_iva
    )
    RETURNING cuentas_por_cobrar.id INTO v_cuenta_id;
  END IF;

  RETURN QUERY SELECT v_orden_id, v_folio, v_cuenta_id;
END;
$$;

COMMENT ON FUNCTION public.repetir_orden_op(uuid, uuid, timestamptz) IS
  'CLI-08: clona datos comerciales/técnicos en una OP nueva sin copiar la ejecución; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.repetir_orden_op(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repetir_orden_op(uuid, uuid, timestamptz)
  TO service_role;
