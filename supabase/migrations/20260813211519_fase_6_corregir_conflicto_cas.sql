-- Evita que PostgREST trate una versión obsoleta como fallo serializable y la
-- reintente. El compare-and-set es un conflicto de negocio, no de aislamiento.
CREATE OR REPLACE FUNCTION public.reprogramar_partida_recurso(
  p_programacion_id uuid,
  p_recurso_id uuid,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
  p_actualizado_en_esperado timestamptz
)
RETURNS TABLE (
  id uuid,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_nuevo_activo boolean;
  v_capacidad numeric;
  v_horas_programadas numeric;
BEGIN
  IF p_programacion_id IS NULL
     OR p_recurso_id IS NULL
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999
     OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'reprogramacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'check_violation';
  END IF;
  IF v_programacion.estado_planeacion IN ('cancelada', 'completada') THEN
    RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id IN (v_programacion.recurso_id, p_recurso_id)
  ORDER BY recurso.id
  FOR UPDATE;

  SELECT recurso.activo
  INTO v_recurso_nuevo_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_nuevo_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    p_recurso_id,
    p_fecha_programada,
    p_turno
  );
  IF v_capacidad <= 0 THEN
    RAISE EXCEPTION 'capacidad_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.fecha_programada = p_fecha_programada
    AND programacion.turno = p_turno
    AND programacion.id <> p_programacion_id
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.programacion_areas AS programacion
  SET
    recurso_id = p_recurso_id,
    fecha_programada = p_fecha_programada,
    turno = p_turno,
    horas_estimadas = p_horas_estimadas,
    orden_prioridad = p_orden_prioridad
  WHERE programacion.id = p_programacion_id
  RETURNING
    programacion.id,
    programacion.estado_planeacion,
    programacion.actualizado_en;
END;
$$;

CREATE OR REPLACE FUNCTION public.activar_modo_preparacion(
  p_programacion_id uuid,
  p_actualizado_en_esperado timestamptz
)
RETURNS TABLE (
  id uuid,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_activo boolean;
  v_capacidad numeric;
  v_horas_programadas numeric;
BEGIN
  IF p_programacion_id IS NULL OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'preparacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'check_violation';
  END IF;
  IF v_programacion.estado_planeacion = 'en_preparacion' THEN
    RETURN QUERY
    SELECT v_programacion.id, v_programacion.estado_planeacion, v_programacion.actualizado_en;
    RETURN;
  END IF;
  IF v_programacion.estado_planeacion NOT IN ('programada', 'bloqueada') THEN
    RAISE EXCEPTION 'transicion_preparacion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT recurso.activo
  INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    v_programacion.recurso_id,
    v_programacion.fecha_programada,
    v_programacion.turno
  );
  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = v_programacion.recurso_id
    AND programacion.fecha_programada = v_programacion.fecha_programada
    AND programacion.turno = v_programacion.turno
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_capacidad <= 0 OR v_horas_programadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = v_programacion.recurso_id
    AND programacion.id <> p_programacion_id
    AND programacion.estado_planeacion IN ('en_preparacion', 'en_proceso')
  FOR KEY SHARE;

  IF FOUND THEN
    RAISE EXCEPTION 'recurso_ocupado' USING ERRCODE = 'unique_violation';
  END IF;

  RETURN QUERY
  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'en_preparacion'
  WHERE programacion.id = p_programacion_id
  RETURNING
    programacion.id,
    programacion.estado_planeacion,
    programacion.actualizado_en;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'recurso_ocupado' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz)
  TO service_role;
