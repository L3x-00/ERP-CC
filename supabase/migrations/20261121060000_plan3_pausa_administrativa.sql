-- PLAN-3: pausa administrativa identificable y reanudación supeditada a
-- aprobación de Planeación. Se conserva el cuerpo vigente de reanudar y solo se
-- añade la comprobación del motivo de la última pausa.
INSERT INTO public.catalogo_motivos_pausa (codigo, nombre, requiere_nota, libera_maquina, orden)
VALUES ('PAUSA_ADMIN', 'Pausa administrativa', true, false, 7)
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    requiere_nota = EXCLUDED.requiere_nota,
    libera_maquina = EXCLUDED.libera_maquina;

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

  -- PLAN-3: una pausa administrativa no se reanuda sin aprobación de Planeación.
  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS s
    WHERE s.programacion_id = p_programacion_id
      AND s.estado_sesion = 'pausada'
      AND s.motivo_pausa_codigo = 'PAUSA_ADMIN'
      AND s.id = (
        SELECT s2.id FROM public.sesiones_trabajo AS s2
        WHERE s2.programacion_id = p_programacion_id
        ORDER BY s2.creado_en DESC, s2.id DESC LIMIT 1
      )
  ) THEN
    RAISE EXCEPTION 'pausa_administrativa_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  -- C21: no se pueden encadenar más de 3 pausas sin avance declarado.
  IF (
    SELECT count(*) FROM public.sesiones_trabajo AS s
    WHERE s.programacion_id = p_programacion_id
      AND s.estado_sesion = 'pausada'
      AND NOT s.sesion_invalida
      AND s.piezas_producidas = 0
      AND NOT s.pendiente_actualizacion_avance
  ) >= 3 THEN
    RAISE EXCEPTION 'sesiones_pausadas_excedidas' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.activar_modo_preparacion(
    p_programacion_id, p_actualizado_en_esperado
  );
  RETURN QUERY SELECT * FROM public.iniciar_sesion_trabajo_operador(
    p_orden_id, p_partida_id, p_programacion_id, p_operador_id
  );
END;
$$;
COMMENT ON FUNCTION public.reanudar_sesion_trabajo_a20(uuid, uuid, uuid, timestamptz, uuid) IS
  'C21/PLAN-3: reanuda la última pausa, salvo que sea administrativa y esté pendiente de aprobación.';

CREATE OR REPLACE FUNCTION public.aprobar_pausa_administrativa(
  p_programacion_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sesiones_trabajo AS s
  SET motivo_pausa_codigo = NULL,
      notas = concat_ws(' · ', nullif(btrim(s.notas), ''), 'Pausa administrativa aprobada')
  WHERE s.id = (
    SELECT s2.id FROM public.sesiones_trabajo AS s2
    WHERE s2.programacion_id = p_programacion_id AND s2.estado_sesion = 'pausada'
    ORDER BY s2.creado_en DESC, s2.id DESC LIMIT 1
  )
  AND s.motivo_pausa_codigo = 'PAUSA_ADMIN';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_pausa_administrativa(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_pausa_administrativa(uuid, uuid) TO service_role;
