-- C21: sesiones con tiempo real de proceso, corrección ordenada y tope de pausas.
ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS sesion_invalida boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sesiones_trabajo.sesion_invalida IS
  'C21: pausa marcada como no válida porque la producción ya se completó.';
GRANT SELECT (sesion_invalida) ON TABLE public.sesiones_trabajo TO authenticated;

-- C21: declara piezas y TIEMPO REAL DE PROCESO de una sesión pausada.
DROP FUNCTION IF EXISTS public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.actualizar_avance_sesion_pausada(
  p_sesion_id uuid,
  p_actor_id uuid,
  p_piezas_producidas numeric,
  p_horas_reales numeric,
  p_notas text DEFAULT NULL,
  p_material_id uuid DEFAULT NULL,
  p_cantidad_usada numeric DEFAULT 0,
  p_cantidad_scrap numeric DEFAULT 0,
  p_motivo_consumo text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  fecha_fin timestamptz,
  horas_netas numeric,
  piezas_producidas numeric,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_fecha_fin_real timestamptz;
  v_comida numeric;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_horas_actuales numeric;
  v_cantidad_metas integer;
  v_hecho_meta numeric := 0;
  v_es_meta_final boolean := false;
  v_piezas_previas numeric;
  v_cantidad_nueva numeric;
  v_completa boolean := false;
  v_estado_programacion text;
  v_estado_orden text;
  v_corrida_id uuid;
  v_corrida_completa boolean;
  v_avance_id uuid;
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0 OR p_horas_reales IS NULL OR p_horas_reales < 0 THEN
    RAISE EXCEPTION 'actualizacion_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_partida FROM public.partidas_orden_produccion p
  WHERE p.id = v_sesion.partida_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation'; END IF;

  PERFORM 1 FROM public.ordenes_produccion o
  WHERE o.id = v_sesion.orden_id AND o.estado IN ('en_proceso', 'pausada') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden_no_reanudable' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_programacion FROM public.programacion_areas p
  WHERE p.id = v_sesion.programacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found'; END IF;

  PERFORM 1 FROM public.recursos_planeacion r WHERE r.id = v_programacion.recurso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found'; END IF;

  SELECT * INTO v_sesion FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'pausada' OR v_sesion.sesion_invalida THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation';
  END IF;

  -- Orden cronológico: primero las sesiones antiguas.
  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo s
    WHERE s.programacion_id = v_sesion.programacion_id
      AND s.id <> v_sesion.id
      AND (s.creado_en, s.id) < (v_sesion.creado_en, v_sesion.id)
      AND s.estado_sesion = 'pausada'
      AND NOT s.sesion_invalida
      AND s.pendiente_actualizacion_avance
  ) THEN
    RAISE EXCEPTION 'sesion_antigua_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_actualizar_avance' USING ERRCODE = 'check_violation';
  END IF;

  IF p_horas_reales > (
    SELECT extract(epoch FROM (v_sesion.fecha_fin - v_sesion.fecha_inicio)) / 3600
  ) THEN
    RAISE EXCEPTION 'horas_reales_exceden_sesion' USING ERRCODE = 'check_violation';
  END IF;

  v_fecha_fin_real := v_sesion.fecha_inicio + (p_horas_reales || ' hours')::interval;
  SELECT calculo.horas_brutas - calculo.horas_netas INTO v_comida
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin_real) AS calculo;
  v_fecha_fin_real := v_fecha_fin_real + (coalesce(v_comida, 0) || ' hours')::interval;

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin_real) AS calculo;
  v_horas_netas := p_horas_reales;
  v_horas_actuales := coalesce(v_sesion.horas_netas, 0);

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida m WHERE m.partida_id = v_sesion.partida_id;
  IF v_cantidad_metas > 0 THEN
    SELECT m.* INTO v_meta FROM public.metas_proceso_partida m
    WHERE m.partida_id = v_sesion.partida_id AND m.id = v_programacion.meta_proceso_id;
    IF NOT FOUND THEN
      SELECT m.* INTO v_meta FROM public.metas_proceso_partida m
      WHERE m.partida_id = v_sesion.partida_id ORDER BY m.secuencia DESC LIMIT 1;
    END IF;
    v_es_meta_final := v_meta.secuencia = (
      SELECT max(m.secuencia) FROM public.metas_proceso_partida m WHERE m.partida_id = v_sesion.partida_id);
    SELECT coalesce(sum(a.cantidad_producida), 0) INTO v_hecho_meta
    FROM public.registros_avance_partida a WHERE a.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_piezas_producidas > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;
    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND p_piezas_producidas > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_nueva := v_partida.cantidad_producida + CASE WHEN v_es_meta_final THEN p_piezas_producidas ELSE 0 END;
    v_completa := v_hecho_meta + p_piezas_producidas >= v_meta.meta_piezas;
  ELSE
    IF v_partida.cantidad_producida + p_piezas_producidas > v_partida.cantidad_solicitada THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_nueva := v_partida.cantidad_producida + p_piezas_producidas;
    v_completa := v_cantidad_nueva >= v_partida.cantidad_solicitada;
  END IF;

  IF p_piezas_producidas > 0 AND v_sesion.corrida_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.corridas c JOIN public.catalogo_procesos pr ON pr.id = c.proceso_id
      WHERE c.id = v_sesion.corrida_id AND pr.requiere_primera_pieza
    ) AND NOT privado.primera_pieza_aprobada(v_sesion.corrida_id) THEN
      RAISE EXCEPTION 'primera_pieza_pendiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Opción 1: registrar consumo aquí para poder finalizar.
  IF p_material_id IS NOT NULL AND (coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0)) > 0 THEN
    PERFORM * FROM public.registrar_consumo_material_operador_op(
      v_sesion.partida_id, p_material_id,
      coalesce(p_cantidad_usada, 0), coalesce(p_cantidad_scrap, 0),
      coalesce(p_motivo_consumo, 'Consumo registrado al actualizar avance'),
      v_sesion.operador_id
    );
  END IF;

  UPDATE public.sesiones_trabajo s
  SET fecha_fin = v_fecha_fin_real,
      horas_brutas = v_horas_brutas,
      horas_netas = v_horas_netas,
      piezas_producidas = p_piezas_producidas,
      pendiente_actualizacion_avance = false,
      notas = CASE WHEN p_notas IS NULL THEN s.notas ELSE nullif(btrim(p_notas), '') END,
      estado_sesion = CASE
        WHEN v_completa AND (
          NOT privado.partida_requiere_consumo_material(v_sesion.partida_id)
          OR p_material_id IS NOT NULL
        ) THEN 'finalizada'
        ELSE 'pausada'
      END
  WHERE s.id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    SELECT avance.id INTO v_avance_id FROM public.registros_avance_partida avance
    WHERE avance.sesion_trabajo_id = p_sesion_id FOR UPDATE;
    IF v_avance_id IS NOT NULL THEN
      UPDATE public.registros_avance_partida avance
      SET cantidad_producida = p_piezas_producidas, meta_proceso_id = v_meta.id
      WHERE avance.id = v_avance_id;
    ELSE
      INSERT INTO public.registros_avance_partida (
        partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id, meta_proceso_id
      ) VALUES (
        v_sesion.partida_id, v_sesion.operador_id, p_piezas_producidas, 0, p_sesion_id, v_meta.id
      );
    END IF;
  END IF;

  UPDATE public.partidas_orden_produccion p
  SET cantidad_producida = v_cantidad_nueva,
      tiempo_real_minutos = p.tiempo_real_minutos + ((v_horas_netas - v_horas_actuales) * 60)
  WHERE p.id = v_sesion.partida_id;

  IF v_completa AND privado.partida_requiere_consumo_material(v_sesion.partida_id)
     AND p_material_id IS NULL THEN
    -- Opción 2: dejar el consumo para el cierre normal.
    UPDATE public.programacion_areas p SET estado_planeacion = 'bloqueada'
    WHERE p.id = v_sesion.programacion_id;
  ELSIF v_completa THEN
    IF v_cantidad_metas > 0 AND v_meta.id IS NOT NULL THEN
      UPDATE public.programacion_areas p SET estado_planeacion = 'completada'
      WHERE (p.partida_id = v_sesion.partida_id AND p.meta_proceso_id = v_meta.id
             OR p.id = v_sesion.programacion_id)
        AND p.estado_planeacion <> 'cancelada';
    ELSE
      UPDATE public.programacion_areas p SET estado_planeacion = 'completada'
      WHERE p.id = v_sesion.programacion_id;
    END IF;

    -- Las pausas posteriores ya no son necesarias: se marcan inválidas y se
    -- descuentan sus horas del total de la partida.
    UPDATE public.sesiones_trabajo s
    SET sesion_invalida = true,
        pendiente_actualizacion_avance = false,
        estado_sesion = 'finalizada'
    WHERE s.programacion_id = v_sesion.programacion_id
      AND s.id <> v_sesion.id
      AND s.estado_sesion = 'pausada'
      AND NOT s.sesion_invalida;

    UPDATE public.partidas_orden_produccion p
    SET tiempo_real_minutos = p.tiempo_real_minutos - coalesce((
      SELECT sum(s.horas_netas * 60) FROM public.sesiones_trabajo s
      WHERE s.programacion_id = v_sesion.programacion_id
        AND s.id <> v_sesion.id
        AND s.sesion_invalida
    ), 0)
    WHERE p.id = v_sesion.partida_id;
  ELSE
    UPDATE public.programacion_areas p SET estado_planeacion = 'bloqueada'
    WHERE p.id = v_sesion.programacion_id;
  END IF;

  v_corrida_id := v_sesion.corrida_id;
  IF v_corrida_id IS NOT NULL THEN
    v_corrida_completa := NOT EXISTS (
      SELECT 1 FROM public.corrida_items i
      WHERE i.corrida_id = v_corrida_id AND NOT privado.partida_produccion_completa(i.partida_id));
    IF v_corrida_completa THEN
      UPDATE public.corridas c SET estado = 'COMPLETADA'
      WHERE c.id = v_corrida_id AND c.estado <> 'CANCELADA';
    END IF;
  END IF;

  IF v_completa AND coalesce(privado.orden_produccion_completa(v_sesion.orden_id), false) THEN
    UPDATE public.ordenes_produccion o SET estado = 'completada', fecha_fin = v_fecha_fin_real
    WHERE o.id = v_sesion.orden_id;
  END IF;

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (v_sesion.partida_id, p_actor_id, 'pausa',
    nullif(btrim(coalesce(p_notas, 'Actualización de avance y tiempo real de la pausa')), ''));

  SELECT o.estado INTO v_estado_orden FROM public.ordenes_produccion o WHERE o.id = v_sesion.orden_id;
  SELECT p.estado_planeacion INTO v_estado_programacion FROM public.programacion_areas p WHERE p.id = v_sesion.programacion_id;

  RETURN QUERY
  SELECT s.id, s.estado_sesion, s.fecha_fin, s.horas_netas, s.piezas_producidas,
         v_estado_programacion, s.actualizado_en
  FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text, uuid, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text, uuid, numeric, numeric, text)
  TO service_role;

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
  IF v_programacion.es_continuacion THEN
    RAISE EXCEPTION 'programacion_continuacion_no_operable' USING ERRCODE = 'check_violation';
  END IF;

  -- C21: misma regla al querer abrir una sesión nueva desde el pool.
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

