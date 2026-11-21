-- PLAN-1: «Quien sea reclame» deja operador_asignado_id en null.
-- La firma, permisos y el resto de validaciones quedan intactos.
CREATE OR REPLACE FUNCTION public.asignar_operador_a_partida_op(
  p_partida_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  operador_asignado_id uuid,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_area_codigo text;
BEGIN
  SELECT partida.orden_id, partida.area_trabajo_codigo
  INTO v_orden_id, v_area_codigo
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_asignable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = p_partida_id
    AND sesion.estado_sesion = 'activa'
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'partida_con_sesion_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- PLAN-1: null significa «quien sea reclame»; no se valida operador ni área.
  IF p_operador_id IS NOT NULL THEN
    PERFORM 1
    FROM public.usuarios AS operador
    WHERE operador.id = p_operador_id
      AND operador.rol = 'operador'
      AND operador.activo = true
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
    END IF;

    -- OBS-09: el operador debe tener habilitada el área del trabajo.
    IF NOT privado.operador_habilitado_area(p_operador_id, v_area_codigo) THEN
      RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET operador_asignado_id = p_operador_id
  WHERE partida.id = p_partida_id
  RETURNING partida.id, partida.operador_asignado_id, partida.actualizado_en;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
