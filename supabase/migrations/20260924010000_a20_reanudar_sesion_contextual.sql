-- PRD-06: reanudar una programación bloqueada en la misma transacción que inicia la sesión.
-- El operador y el área se revalidan en iniciar_sesion_trabajo_operador; la
-- capacidad y ocupación del recurso se revalidan en activar_modo_preparacion.
CREATE OR REPLACE FUNCTION public.reanudar_sesion_trabajo_a20(
  p_orden_id uuid,
  p_partida_id uuid,
  p_programacion_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha_inicio timestamptz,
  estado_sesion text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_orden_estado text;
  v_programacion public.programacion_areas%ROWTYPE;
  v_ultima_sesion_estado text;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_programacion_id IS NULL
     OR p_actualizado_en_esperado IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reanudacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo orden de locks que el inicio normal: partida → orden → programación → recurso.
  PERFORM 1 FROM public.partidas_orden_produccion p
  WHERE p.id = p_partida_id AND p.orden_id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation'; END IF;
  SELECT o.estado INTO v_orden_estado FROM public.ordenes_produccion o
  WHERE o.id = p_orden_id FOR UPDATE;
  IF NOT FOUND OR v_orden_estado NOT IN ('en_proceso', 'pausada') THEN
    RAISE EXCEPTION 'orden_no_reanudable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_programacion FROM public.programacion_areas p
  WHERE p.id = p_programacion_id AND p.orden_id = p_orden_id
    AND p.partida_id = p_partida_id FOR UPDATE;
  IF NOT FOUND OR v_programacion.estado_planeacion <> 'bloqueada' THEN
    RAISE EXCEPTION 'programacion_no_bloqueada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_programacion.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.estado_sesion INTO v_ultima_sesion_estado
  FROM public.sesiones_trabajo s
  WHERE s.programacion_id = p_programacion_id
  ORDER BY s.creado_en DESC, s.id DESC LIMIT 1;
  IF v_ultima_sesion_estado IS DISTINCT FROM 'pausada' THEN
    RAISE EXCEPTION 'sesion_pausada_inexistente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.activar_modo_preparacion(
    p_programacion_id, p_actualizado_en_esperado
  );
  RETURN QUERY SELECT * FROM public.iniciar_sesion_trabajo_operador(
    p_orden_id, p_partida_id, p_programacion_id, p_operador_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reanudar_sesion_trabajo_a20(uuid,uuid,uuid,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reanudar_sesion_trabajo_a20(uuid,uuid,uuid,timestamptz,uuid)
  TO service_role;
