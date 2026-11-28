-- Bug 2026-11-28 (O-1126_15 IT01): el operador inició con reclamo activo y la
-- RPC de cierre CRIT-2 lo acepta, pero el registro de consumo previo al cierre
-- comparaba solo `partida.operador_asignado_id` y rechazaba el cierre con un
-- mensaje engañoso («ya no está asignada a tu operador»).
--
-- Se alinea con la regla ya aprobada para el cierre: se admite al operador con
-- reclamo ACTIVO de la misma operación (meta) de su sesión activa. No se
-- reasigna la partida: el modelo permite varios responsables por operación.

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_operador_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo text,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_sesion_id uuid;
BEGIN
  SELECT partida.orden_id, partida.operador_asignado_id
  INTO v_orden_id, v_operador_asignado_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.reclamos_proceso_operador AS reclamo
       JOIN public.sesiones_trabajo AS sesion
         ON sesion.partida_id = reclamo.partida_id
        AND sesion.operador_id = p_operador_id
        AND sesion.estado_sesion = 'activa'
       JOIN public.programacion_areas AS programacion
         ON programacion.id = sesion.programacion_id
       WHERE reclamo.partida_id = p_partida_id
         AND reclamo.operador_id = p_operador_id
         AND reclamo.estado = 'activo'
         AND reclamo.meta_proceso_id IS NOT DISTINCT FROM programacion.meta_proceso_id
     ) THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id AND orden.estado = 'en_proceso' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.rol = 'operador' AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = '23514';
  END IF;

  SELECT sesion.id INTO v_sesion_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = p_partida_id
    AND sesion.operador_id = p_operador_id
    AND sesion.estado_sesion = 'activa'
  ORDER BY sesion.fecha_inicio DESC
  LIMIT 1;

  RETURN QUERY SELECT * FROM privado.registrar_consumo_material_c6(
    p_partida_id, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    p_motivo, v_sesion_id, p_operador_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, text, uuid) IS
  'Consumo de piso: admite al responsable de la partida o al operador con reclamo activo de su operación, igual que el cierre CRIT-2.';
