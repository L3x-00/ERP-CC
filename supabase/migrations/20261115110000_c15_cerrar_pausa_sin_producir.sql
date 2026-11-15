-- C15: cerrar una pausa sin producir.
-- Una sesión pausada ya quedó cerrada en el tiempo: conserva fecha_fin, horas
-- netas, motivo y operador. Si el operador decide que no la retomará, esta RPC
-- la finaliza sin declarar piezas y devuelve la operación al pool (programada),
-- de forma independiente de otras sesiones y de otros procesos de la orden.
CREATE OR REPLACE FUNCTION public.cerrar_pausa_sin_producir(
  p_sesion_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_partida_id uuid;
  v_orden_id uuid;
  v_programacion public.programacion_areas%ROWTYPE;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'cierre_pausa_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Lectura sin lock solo para descubrir partida y orden; el lock real sigue el
  -- mismo orden que el resto del motor: partida → orden → programación → recurso
  -- → sesión.
  SELECT sesion.partida_id, sesion.orden_id
  INTO v_partida_id, v_orden_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id AND orden.estado IN ('en_proceso', 'pausada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_reanudable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.rol = 'operador' AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = (
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_id
    AND programacion.estado_planeacion = 'bloqueada'
  FOR UPDATE;
  IF NOT FOUND THEN
    -- Si la operación ya se retomó (en_proceso), produjo o se completó, la pausa
    -- es historial: no se debe tocar desde aquí.
    RAISE EXCEPTION 'programacion_no_bloqueada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'pausada'
     OR v_sesion.partida_id IS DISTINCT FROM v_partida_id
     OR v_sesion.orden_id IS DISTINCT FROM v_orden_id THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation';
  END IF;

  -- La pausa debe ser la última de la operación. Una pausa anterior con una
  -- sesión posterior es historial de un turno ya retomado y no se modifica.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_trabajo AS posterior
    WHERE posterior.programacion_id = v_sesion.programacion_id
      AND posterior.id <> v_sesion.id
      AND (posterior.creado_en, posterior.id) > (v_sesion.creado_en, v_sesion.id)
  ) THEN
    RAISE EXCEPTION 'pausa_ya_superada' USING ERRCODE = 'check_violation';
  END IF;

  -- No se recalcula el reloj ni las horas: la pausa ya fijó su corte. Solo se
  -- cambia el estado para que la operación deje de estar bloqueada.
  UPDATE public.sesiones_trabajo AS sesion
  SET estado_sesion = 'finalizada'
  WHERE sesion.id = p_sesion_id;

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'programada'
  WHERE programacion.id = v_sesion.programacion_id;

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (v_sesion.partida_id, p_operador_id, 'fin', 'Pausa cerrada sin producir');

  RETURN QUERY
  SELECT sesion.id, sesion.estado_sesion, programacion.estado_planeacion, sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  JOIN public.programacion_areas AS programacion
    ON programacion.id = sesion.programacion_id
  WHERE sesion.id = p_sesion_id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_pausa_sin_producir(uuid, uuid) IS
  'C15: finaliza una pausa vigente sin declarar producción; conserva horas, motivo y operador, y devuelve la operación al pool (programada). Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_pausa_sin_producir(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_pausa_sin_producir(uuid, uuid) TO service_role;
