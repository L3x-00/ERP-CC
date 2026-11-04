-- C11: liberar una preparación atrasada que nunca inició sesión.
--
-- Las operaciones que quedaron en `en_preparacion` de días anteriores bloquean
-- tanto la reprogramación como una nueva preparación del recurso. Esta RPC
-- devuelve la operación a `programada` solo cuando no existe una sesión activa
-- o pausada; nunca libera trabajo que un operador esté ejecutando.
--
-- Orden de locks: programación → sesión (solo lectura con KEY SHARE). El lock de
-- la programación serializa contra el inicio de sesión, que también la bloquea.
-- Requiere actor activo con `gestionar_planeacion` y CAS por `actualizado_en`.

CREATE OR REPLACE FUNCTION public.liberar_preparacion_planeacion_auditada(
  p_programacion_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_planeacion text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_programacion public.programacion_areas%ROWTYPE;
  v_resultado public.programacion_areas%ROWTYPE;
BEGIN
  IF p_programacion_id IS NULL OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'preparacion_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
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
  IF v_programacion.estado_planeacion <> 'en_preparacion' THEN
    RAISE EXCEPTION 'transicion_preparacion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.programacion_id = p_programacion_id
    AND sesion.estado_sesion IN ('activa', 'pausada')
  FOR KEY SHARE;

  IF FOUND THEN
    RAISE EXCEPTION 'sesion_activa_en_programacion' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'programada'
  WHERE programacion.id = p_programacion_id
  RETURNING * INTO v_resultado;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_programacion.orden_id,
    'liberacion_preparacion',
    jsonb_build_object(
      'programacion_id', p_programacion_id,
      'partida_id', v_programacion.partida_id,
      'recurso_id', v_programacion.recurso_id,
      'fecha_programada', v_programacion.fecha_programada,
      'turno', v_programacion.turno,
      'estado_anterior', 'en_preparacion',
      'estado_nuevo', 'programada'
    ),
    'Liberación de preparación atrasada sin sesión iniciada',
    p_actor_id,
    p_correlation_id
  );

  RETURN QUERY
  SELECT v_resultado.id, v_resultado.estado_planeacion, v_resultado.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.liberar_preparacion_planeacion_auditada(uuid, timestamptz, uuid, uuid) IS
  'C11: devuelve a programada una operación en preparación sin sesión activa, con CAS, permiso y auditoría.';

REVOKE ALL ON FUNCTION public.liberar_preparacion_planeacion_auditada(uuid, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_preparacion_planeacion_auditada(uuid, timestamptz, uuid, uuid)
  TO service_role;
