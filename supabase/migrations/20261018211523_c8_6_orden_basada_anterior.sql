-- =============================================================================
-- C8.6 / O-03 B — Nueva OP basada en una orden anterior
-- Solo toma la especificación técnica de una orden actual terminada. A diferencia
-- de repetir_orden_op, no admite legacy, no conserva campos comerciales y nunca
-- crea cuentas por cobrar.
-- Aplicar solo con `supabase migration up --local`; el PO la aplica en remoto.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crear_orden_basada_en_anterior(
  p_orden_origen_id uuid,
  p_actor_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen public.ordenes_produccion%ROWTYPE;
  v_partidas jsonb;
  v_orden_id uuid;
  v_folio text;
BEGIN
  IF p_orden_origen_id IS NULL OR p_actor_id IS NULL OR p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'orden_basada_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Mantiene el orden de bloqueo de la repetición histórica: actor, luego OP.
  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id
    AND actor.activo
    AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_crear_orden_basada' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_origen
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_origen_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- O-03 B: el MVP parte solo de órdenes actuales finalizadas. El alta legacy y
  -- la repetición comercial conservan su contrato independiente.
  IF v_origen.id_historico IS NOT NULL THEN
    RAISE EXCEPTION 'orden_origen_legacy_no_admitida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_origen.estado_sii NOT IN ('PRODUCCION_COMPLETADA', 'CERRADA') THEN
    RAISE EXCEPTION 'orden_origen_no_finalizada' USING ERRCODE = 'check_violation';
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

  -- La RPC base genera folio y partidas en una única transacción. Se entrega
  -- cotización nula y no se actualiza ningún campo comercial después de crearla.
  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    v_origen.cliente_id,
    NULL,
    p_fecha_compromiso,
    v_origen.prioridad,
    v_partidas
  ) AS creada;

  UPDATE public.ordenes_produccion AS orden
  SET orden_origen_id = p_orden_origen_id
  WHERE orden.id = v_orden_id;

  RETURN QUERY SELECT v_orden_id, v_folio;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_basada_en_anterior(uuid, uuid, timestamptz) IS
  'C8.6/O-03 B: crea una OP nueva desde una OP actual terminada; copia solo partidas técnicas, sin precios ni CxC. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_orden_basada_en_anterior(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_basada_en_anterior(uuid, uuid, timestamptz)
  TO service_role;
