-- =============================================================================
-- C22 (2026-11-18): reprogramar una operación sin duplicarla.
--
-- Observación del cliente: al reprogramar en Planeación un proceso que estaba
-- "bloqueado" aparecían dos tarjetas de la misma operación, en dos fechas y con
-- estados distintos.
--
-- Causa: una operación repartida en varios días (C16) guarda su fila principal
-- (es_continuacion = false) y una reserva por cada día adicional
-- (es_continuacion = true). `reprogramar_partida_recurso` movía solo la fila
-- principal: las reservas de los días anteriores quedaban vigentes y el
-- calendario seguía mostrando la operación en la fecha vieja (además de la
-- nueva). Lo mismo pasaba al mover una operación pausada, que conserva su fila
-- en estado `bloqueada` hasta que Producción la libera.
--
-- Corrección: al reprogramar la fila principal se cancelan sus continuaciones
-- dentro de la misma transacción. Las filas `cancelada` no reservan capacidad
-- (el cálculo de horas ya las excluye) y dejan de pintarse en el calendario.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

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
  -- Una programación en preparación/ejecución ya tiene recurso y sesión
  -- comprometidos: moverla dejaría el histórico de capacidad inconsistente.
  IF v_programacion.estado_planeacion NOT IN ('programada', 'bloqueada') THEN
    RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
  END IF;
  -- Las reservas de días adicionales no se reprograman por sí solas: mover una
  -- continuación dejaría la fila principal y la reserva en desacuerdo.
  IF v_programacion.es_continuacion THEN
    RAISE EXCEPTION 'programacion_continuacion_no_operable' USING ERRCODE = 'check_violation';
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

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide reprogramar hacia
  -- un recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_operacion(v_programacion.partida_id, v_programacion.meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
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

  -- C22: el reparto multi-día anterior deja de ser válido al mover la fila
  -- principal. Se cancelan sus reservas para no mostrar dos fechas ni dos
  -- estados de la misma operación.
  IF v_programacion.meta_proceso_id IS NOT NULL THEN
    UPDATE public.programacion_areas AS continuacion
    SET estado_planeacion = 'cancelada'
    WHERE continuacion.partida_id = v_programacion.partida_id
      AND continuacion.meta_proceso_id = v_programacion.meta_proceso_id
      AND continuacion.es_continuacion = true
      AND continuacion.estado_planeacion <> 'cancelada';
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

COMMENT ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz) IS
  'C11/C22: mueve la fila principal de una programación en una sola transacción; cancela las reservas de días adicionales para no duplicar la operación.';

REVOKE ALL ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  TO service_role;
