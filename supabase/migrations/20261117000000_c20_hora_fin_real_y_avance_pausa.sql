-- =============================================================================
-- C20 (2026-11-17): hora real de finalización y actualización de avance.
--
-- 1. El cierre del operador puede consumir una hora real declarada, en vez de
--    asumir siempre now(). La ruta administrativa no cambia.
-- 2. La pausa automática por jornada deja la sesión marcada como pendiente de
--    actualizar avance y contabiliza su tiempo en la partida.
-- 3. Una RPC corrige piezas + hora real (fecha_fin de la pausa menos las horas
--    declaradas), ajusta el tiempo por delta y finaliza si la meta se completa.
-- =============================================================================

ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS fecha_fin_declarada timestamptz,
  ADD COLUMN IF NOT EXISTS pendiente_actualizacion_avance boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sesiones_trabajo.fecha_fin_declarada IS
  'C20: hora real de finalización declarada por el operador al cerrar; el cierre la usa en lugar de now().';
COMMENT ON COLUMN public.sesiones_trabajo.pendiente_actualizacion_avance IS
  'C20: la pausa automática por jornada dejó piezas y hora real pendientes de declarar.';

CREATE OR REPLACE FUNCTION public.cerrar_sesion_trabajo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_estado_destino text,
  p_motivo_pausa text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_meta_proceso_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  horas_brutas numeric,
  horas_netas numeric,
  piezas_producidas numeric,
  cantidad_producida_partida numeric,
  estado_orden text,
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
  v_orden_sesion_id uuid;
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
  v_programacion public.programacion_areas%ROWTYPE;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_cantidad_producida_nueva numeric;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_cantidad_metas integer;
  v_es_meta_final boolean := false;
  v_hecho_meta numeric := 0;
  v_piezas_previas numeric;
  v_partida_completa boolean;
  v_es_ultima_secuencia boolean;
  v_orden_completa boolean;
  v_estado_programacion text;
  v_estado_orden text;
  v_codigo_motivo text;
  v_legacy_motivo text;
  v_requiere_nota boolean;
  v_jornada numeric;
  v_autorizacion_id uuid;
  v_corrida_id uuid;
  v_corrida_completa boolean;
  v_fecha_fin timestamptz;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0 OR p_estado_destino NOT IN ('pausada', 'finalizada') THEN
    RAISE EXCEPTION 'cierre_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Pausa: motivo del catálogo (o legacy) + nota si el catálogo la exige.
  IF p_estado_destino = 'pausada' THEN
    v_codigo_motivo := upper(btrim(coalesce(p_motivo_pausa, '')));
    SELECT motivo.requiere_nota INTO v_requiere_nota
    FROM public.catalogo_motivos_pausa AS motivo
    WHERE motivo.codigo = v_codigo_motivo AND motivo.activo;
    IF NOT FOUND THEN
      v_codigo_motivo := CASE btrim(coalesce(p_motivo_pausa, ''))
        WHEN 'falta_informacion' THEN 'DUDA'
        WHEN 'material_pendiente' THEN 'MATERIAL'
        WHEN 'aprobacion_cliente' THEN 'DUDA'
        WHEN 'problema_tecnico' THEN 'FALLA'
        WHEN 'mantenimiento' THEN 'FALLA'
        WHEN 'otro' THEN 'OTRA'
        ELSE NULL
      END;
      IF v_codigo_motivo IS NULL THEN
        RAISE EXCEPTION 'motivo_pausa_invalido' USING ERRCODE = 'check_violation';
      END IF;
      SELECT motivo.requiere_nota INTO v_requiere_nota
      FROM public.catalogo_motivos_pausa AS motivo
      WHERE motivo.codigo = v_codigo_motivo;
    END IF;
    IF coalesce(v_requiere_nota, false) AND nullif(btrim(coalesce(p_notas, '')), '') IS NULL THEN
      RAISE EXCEPTION 'nota_pausa_requerida' USING ERRCODE = 'check_violation';
    END IF;
    v_legacy_motivo := privado.motivo_pausa_legacy(v_codigo_motivo);
  END IF;

  -- Lectura sin lock solo para descubrir la partida; el lock real de la sesión
  -- se toma al final, después de partida/orden/programación/recurso.
  SELECT sesion.partida_id, sesion.orden_id
  INTO v_partida_id, v_orden_sesion_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id, partida.cantidad_producida, partida.cantidad_solicitada
  INTO v_orden_id, v_operador_asignado_id, v_cantidad_producida_actual, v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id
  FOR UPDATE;
  IF NOT FOUND OR v_orden_id <> v_orden_sesion_id THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_sesion_id AND orden.estado = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
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
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_sesion_id
    AND programacion.estado_planeacion = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Recién aquí se bloquea la sesión; se revalida contra lo leído sin lock.
  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'activa'
     OR v_sesion.partida_id IS DISTINCT FROM v_partida_id
     OR v_sesion.orden_id IS DISTINCT FROM v_orden_sesion_id THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- C20: el cierre usa la hora real declarada por el operador cuando llega;
  -- sin declaración, mantiene el reloj del servidor como hasta ahora.
  v_fecha_fin := coalesce(v_sesion.fecha_fin_declarada, now());

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin) AS calculo;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.programacion_areas AS posterior
    WHERE posterior.partida_id = v_sesion.partida_id
      AND posterior.secuencia > v_programacion.secuencia
      AND posterior.estado_planeacion <> 'cancelada'
  ) INTO v_es_ultima_secuencia;

  -- Horas extra (D2-A): umbral = jornada del turno (estándar 8 h si no hay captura).
  IF p_estado_destino = 'finalizada' THEN
    v_jornada := privado.obtener_jornada_recurso_turno(
      v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);
    IF v_horas_netas > v_jornada THEN
      -- C15: una justificación del propio operador, atada a ESTA sesión, cubre
      -- el exceso sin esperar aprobación; queda registrada y auditada. La
      -- autorización de un responsable sigue siendo válida y debe cubrir el
      -- exceso calculado en este cierre.
      SELECT autorizacion.id INTO v_autorizacion_id
      FROM public.autorizaciones_hora_extra AS autorizacion
      WHERE autorizacion.orden_id = v_sesion.orden_id
        AND (
          (autorizacion.estado = 'JUSTIFICADA' AND autorizacion.sesion_id = p_sesion_id)
          OR (
            autorizacion.estado = 'VIGENTE'
            AND (autorizacion.sesion_id = p_sesion_id OR autorizacion.sesion_id IS NULL)
            AND autorizacion.horas_autorizadas >= (v_horas_netas - v_jornada)
          )
        )
      ORDER BY
        CASE WHEN autorizacion.estado = 'JUSTIFICADA' THEN 0 ELSE 1 END,
        (autorizacion.sesion_id = p_sesion_id) DESC,
        autorizacion.creado_en
      LIMIT 1
      FOR UPDATE;
      IF v_autorizacion_id IS NULL THEN
        RAISE EXCEPTION 'horas_extra_sin_autorizacion' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = v_sesion.partida_id;

  IF v_cantidad_metas > 0 THEN
    IF p_meta_proceso_id IS NOT NULL THEN
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.id = p_meta_proceso_id AND meta.partida_id = v_sesion.partida_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- C9.0/D-3: sin meta explícita, el avance ES de la operación programada
      -- en la fila de la sesión. Solo las filas heredadas (meta NULL) conservan
      -- el respaldo histórico: la última meta de la partida.
      IF v_programacion.meta_proceso_id IS NOT NULL THEN
        SELECT meta.* INTO v_meta
        FROM public.metas_proceso_partida AS meta
        WHERE meta.id = v_programacion.meta_proceso_id
          AND meta.partida_id = v_sesion.partida_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
        END IF;
      ELSE
        SELECT meta.* INTO v_meta
        FROM public.metas_proceso_partida AS meta
        WHERE meta.partida_id = v_sesion.partida_id
        ORDER BY meta.secuencia DESC
        LIMIT 1
        FOR UPDATE;
      END IF;
    END IF;

    v_es_meta_final := v_meta.secuencia = (
      SELECT max(meta.secuencia) FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
    );
    SELECT coalesce(sum(avance.cantidad_producida), 0)
    INTO v_hecho_meta
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_piezas_producidas > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;

    -- Tope de secuencia: solo se pueden declarar piezas que ya terminó el
    -- proceso inmediato anterior y que este proceso aún no consumió. Así una
    -- orden de 1000 puede doblar las primeras 100 cortadas sin esperar el lote
    -- completo, pero no puede adelantarse a un corte que aún no produce nada.
    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND p_piezas_producidas > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
    END IF;

    v_cantidad_producida_nueva := v_cantidad_producida_actual
      + CASE WHEN v_es_meta_final THEN p_piezas_producidas ELSE 0 END;
  ELSE
    IF v_cantidad_producida_actual + p_piezas_producidas > v_cantidad_solicitada THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    IF p_piezas_producidas > 0 AND v_es_ultima_secuencia = false THEN
      RAISE EXCEPTION 'produccion_solo_ultima_secuencia' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_producida_nueva := v_cantidad_producida_actual + p_piezas_producidas;
  END IF;

  -- Primera pieza (§6.3): si el proceso de la corrida la exige, no se pueden
  -- declarar piezas sin una inspección PRIMERA_PIEZA APROBADA.
  v_corrida_id := v_sesion.corrida_id;
  IF p_piezas_producidas > 0 AND v_corrida_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.corridas AS corrida
      JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
      WHERE corrida.id = v_corrida_id AND proceso.requiere_primera_pieza
    ) AND NOT privado.primera_pieza_aprobada(v_corrida_id) THEN
      RAISE EXCEPTION 'primera_pieza_pendiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET
    fecha_fin = v_fecha_fin, horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
    piezas_producidas = p_piezas_producidas,
    motivo_pausa = CASE WHEN p_estado_destino = 'pausada' THEN v_legacy_motivo ELSE NULL END,
    motivo_pausa_codigo = CASE WHEN p_estado_destino = 'pausada' THEN v_codigo_motivo ELSE NULL END,
    motivo_pausa_nota = CASE WHEN p_estado_destino = 'pausada' THEN nullif(btrim(p_notas), '') ELSE NULL END,
    recurso_liberado = CASE WHEN p_estado_destino = 'pausada' THEN false ELSE recurso_liberado END,
    notas = nullif(btrim(p_notas), ''), estado_sesion = p_estado_destino
  WHERE sesion.id = p_sesion_id;

  IF v_autorizacion_id IS NOT NULL THEN
    UPDATE public.autorizaciones_hora_extra AS autorizacion
    SET estado = 'USADA'
    WHERE autorizacion.id = v_autorizacion_id;
  END IF;

  IF p_piezas_producidas > 0 THEN
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id, meta_proceso_id
    ) VALUES (v_sesion.partida_id, p_operador_id, p_piezas_producidas, 0, p_sesion_id, v_meta.id);
  END IF;
  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_producida_nueva,
      tiempo_real_minutos = partida.tiempo_real_minutos + (v_horas_netas * 60)
  WHERE partida.id = v_sesion.partida_id;

  v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);

  IF p_estado_destino = 'pausada' THEN
    v_estado_programacion := 'bloqueada';
  ELSIF v_cantidad_metas > 0 THEN
    -- Con ruteo, cada operación se completa contra su propia meta. Un cierre
    -- con avance parcial vuelve a 'programada' en lugar de 'completada' para
    -- que el mismo proceso pueda retomarse sin esperar al proceso anterior.
    IF v_hecho_meta + p_piezas_producidas >= v_meta.meta_piezas THEN
      v_estado_programacion := 'completada';
    ELSE
      v_estado_programacion := 'programada';
    END IF;
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;
  -- Si la programación de la sesión pertenece a otra operación (planeación con
  -- la secuencia desfasada, o un cambio de proceso a mitad de la sesión), el
  -- estado se aplica a la operación realmente trabajada y la de la sesión vuelve
  -- al pool. Así no se completa una operación en la que no se produjo nada.
  IF p_estado_destino <> 'pausada'
     AND v_programacion.meta_proceso_id IS NOT NULL
     AND v_programacion.meta_proceso_id IS DISTINCT FROM v_meta.id THEN
    UPDATE public.programacion_areas AS trabajada
    SET estado_planeacion = v_estado_programacion
    WHERE trabajada.partida_id = v_sesion.partida_id
      AND trabajada.meta_proceso_id = v_meta.id
      AND trabajada.id <> v_sesion.programacion_id;

    UPDATE public.programacion_areas AS propia
    SET estado_planeacion = 'programada'
    WHERE propia.id = v_sesion.programacion_id
      AND propia.estado_planeacion = 'en_proceso';
  ELSIF v_cantidad_metas > 0 AND v_meta.id IS NOT NULL
        AND v_programacion.meta_proceso_id IS NOT NULL
        AND v_estado_programacion = 'completada' THEN
    -- C16: al completar la operación se completan también sus días adicionales;
    -- la producción siguió usando solo la fila principal.
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'completada'
    WHERE programacion.partida_id = v_sesion.partida_id
      AND programacion.meta_proceso_id = v_meta.id
      AND programacion.estado_planeacion <> 'cancelada';
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = v_estado_programacion
    WHERE programacion.id = v_sesion.programacion_id;
  END IF;
  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (
    v_sesion.partida_id, p_operador_id,
    CASE WHEN p_estado_destino = 'pausada' THEN 'pausa' ELSE 'fin' END,
    nullif(btrim(p_notas), '')
  );

  -- Estado de la corrida derivado de sus sesiones y metas.
  IF v_corrida_id IS NOT NULL THEN
    v_corrida_completa := NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = v_corrida_id
        AND NOT privado.partida_produccion_completa(item.partida_id)
    );
    IF v_corrida_completa THEN
      UPDATE public.corridas AS corrida SET estado = 'COMPLETADA'
      WHERE corrida.id = v_corrida_id AND corrida.estado <> 'CANCELADA';
    ELSIF EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.corrida_id = v_corrida_id AND sesion.estado_sesion = 'activa'
    ) THEN
      UPDATE public.corridas AS corrida SET estado = 'EN_PROCESO'
      WHERE corrida.id = v_corrida_id AND corrida.estado IN ('PLANIFICADA', 'PAUSADA');
    ELSE
      UPDATE public.corridas AS corrida SET estado = 'PAUSADA'
      WHERE corrida.id = v_corrida_id AND corrida.estado = 'EN_PROCESO';
    END IF;
  END IF;

  v_orden_completa := privado.orden_produccion_completa(v_sesion.orden_id);
  IF coalesce(v_orden_completa, false) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = v_fecha_fin
    WHERE orden.id = v_sesion.orden_id;
  END IF;
  SELECT orden.estado INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id;

  RETURN QUERY
  SELECT sesion.id, sesion.estado_sesion, sesion.horas_brutas, sesion.horas_netas,
    sesion.piezas_producidas, v_cantidad_producida_nueva, v_estado_orden,
    v_estado_programacion, sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;
END;
$$;


-- C20: el operador declara la hora real en que terminó la sesión.
-- El cierre la consume desde sesiones_trabajo.fecha_fin_declarada.
CREATE OR REPLACE FUNCTION public.registrar_hora_fin_sesion(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_fecha_fin timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL OR p_fecha_fin IS NULL THEN
    RAISE EXCEPTION 'hora_fin_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_fecha_fin > now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'fecha_fin_futura' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;
  IF p_fecha_fin < v_sesion.fecha_inicio THEN
    RAISE EXCEPTION 'fecha_fin_anterior_inicio' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET fecha_fin_declarada = p_fecha_fin
  WHERE sesion.id = p_sesion_id;
  RETURN p_fecha_fin;
END;
$$;

COMMENT ON FUNCTION public.registrar_hora_fin_sesion(uuid, uuid, timestamptz) IS
  'C20: guarda la hora real de finalización declarada por el operador; el cierre la usa en lugar de now(). Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_hora_fin_sesion(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_hora_fin_sesion(uuid, uuid, timestamptz) TO service_role;

-- C20: corrige el avance y la hora real de una pausa automática por jornada.
-- La hora real se obtiene restando las horas declaradas de la fecha_fin
-- capturada por la pausa. El avance y el delta de tiempo se registran una sola vez.
CREATE OR REPLACE FUNCTION public.actualizar_avance_sesion_pausada(
  p_sesion_id uuid,
  p_actor_id uuid,
  p_piezas_producidas numeric,
  p_horas_a_restar numeric,
  p_notas text DEFAULT NULL
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
     OR p_piezas_producidas < 0 OR p_horas_a_restar IS NULL OR p_horas_a_restar < 0 THEN
    RAISE EXCEPTION 'actualizacion_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo orden de locks que el motor de sesiones.
  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_sesion.partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id AND orden.estado IN ('en_proceso', 'pausada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_reanudable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
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
     OR v_sesion.estado_sesion <> 'pausada'
     OR NOT v_sesion.pendiente_actualizacion_avance THEN
    RAISE EXCEPTION 'sesion_no_pendiente_avance' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS posterior
    WHERE posterior.programacion_id = v_sesion.programacion_id
      AND posterior.id <> v_sesion.id
      AND (posterior.creado_en, posterior.id) > (v_sesion.creado_en, v_sesion.id)
  ) THEN
    RAISE EXCEPTION 'pausa_ya_superada' USING ERRCODE = 'check_violation';
  END IF;

  -- Dueño con PIN (validado en la Server Action) o administrador con permiso.
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_actualizar_avance' USING ERRCODE = 'check_violation';
  END IF;

  v_fecha_fin_real := v_sesion.fecha_fin - (p_horas_a_restar || ' hours')::interval;
  IF v_fecha_fin_real < v_sesion.fecha_inicio THEN
    RAISE EXCEPTION 'horas_a_restar_exceden_sesion' USING ERRCODE = 'check_violation';
  END IF;

  SELECT calculo.horas_brutas, calculo.horas_netas
  INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin_real) AS calculo;
  v_horas_actuales := coalesce(v_sesion.horas_netas, 0);

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida AS meta WHERE meta.partida_id = v_sesion.partida_id;

  IF v_cantidad_metas > 0 THEN
    SELECT meta.* INTO v_meta
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = v_sesion.partida_id AND meta.id = v_programacion.meta_proceso_id;
    IF NOT FOUND THEN
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
      ORDER BY meta.secuencia DESC
      LIMIT 1;
    END IF;
    v_es_meta_final := v_meta.secuencia = (
      SELECT max(meta.secuencia) FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
    );
    SELECT coalesce(sum(avance.cantidad_producida), 0) INTO v_hecho_meta
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_piezas_producidas > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;
    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND p_piezas_producidas > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_nueva := v_partida.cantidad_producida
      + CASE WHEN v_es_meta_final THEN p_piezas_producidas ELSE 0 END;
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
      SELECT 1 FROM public.corridas AS corrida
      JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
      WHERE corrida.id = v_sesion.corrida_id AND proceso.requiere_primera_pieza
    ) AND NOT privado.primera_pieza_aprobada(v_sesion.corrida_id) THEN
      RAISE EXCEPTION 'primera_pieza_pendiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET fecha_fin = v_fecha_fin_real,
      horas_brutas = v_horas_brutas,
      horas_netas = v_horas_netas,
      piezas_producidas = p_piezas_producidas,
      pendiente_actualizacion_avance = false,
      notas = CASE WHEN p_notas IS NULL THEN sesion.notas ELSE nullif(btrim(p_notas), '') END,
      estado_sesion = CASE WHEN v_completa THEN 'finalizada' ELSE 'pausada' END
  WHERE sesion.id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    -- El índice único es parcial, así que no se puede usar ON CONFLICT simple.
    SELECT avance.id INTO v_avance_id
    FROM public.registros_avance_partida AS avance
    WHERE avance.sesion_trabajo_id = p_sesion_id
    FOR UPDATE;
    IF v_avance_id IS NOT NULL THEN
      UPDATE public.registros_avance_partida AS avance
      SET cantidad_producida = p_piezas_producidas,
          meta_proceso_id = v_meta.id
      WHERE avance.id = v_avance_id;
    ELSE
      INSERT INTO public.registros_avance_partida (
        partida_id, operador_id, cantidad_producida, cantidad_scrap,
        sesion_trabajo_id, meta_proceso_id
      ) VALUES (
        v_sesion.partida_id, v_sesion.operador_id, p_piezas_producidas, 0,
        p_sesion_id, v_meta.id
      );
    END IF;
  END IF;

  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_nueva,
      tiempo_real_minutos = partida.tiempo_real_minutos + ((v_horas_netas - v_horas_actuales) * 60)
  WHERE partida.id = v_sesion.partida_id;

  IF v_completa THEN
    IF v_cantidad_metas > 0 AND v_meta.id IS NOT NULL THEN
      UPDATE public.programacion_areas AS programacion
      SET estado_planeacion = 'completada'
      WHERE programacion.partida_id = v_sesion.partida_id
        AND programacion.meta_proceso_id = v_meta.id
        AND programacion.estado_planeacion <> 'cancelada';
    ELSE
      UPDATE public.programacion_areas AS programacion
      SET estado_planeacion = 'completada'
      WHERE programacion.id = v_sesion.programacion_id;
    END IF;
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'bloqueada'
    WHERE programacion.id = v_sesion.programacion_id;
  END IF;

  v_corrida_id := v_sesion.corrida_id;
  IF v_corrida_id IS NOT NULL THEN
    v_corrida_completa := NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = v_corrida_id
        AND NOT privado.partida_produccion_completa(item.partida_id)
    );
    IF v_corrida_completa THEN
      UPDATE public.corridas AS corrida SET estado = 'COMPLETADA'
      WHERE corrida.id = v_corrida_id AND corrida.estado <> 'CANCELADA';
    END IF;
  END IF;

  IF v_completa AND coalesce(privado.orden_produccion_completa(v_sesion.orden_id), false) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = v_fecha_fin_real
    WHERE orden.id = v_sesion.orden_id;
  END IF;

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (
    v_sesion.partida_id, p_actor_id, 'pausa',
    nullif(btrim(coalesce(p_notas, 'Actualización de avance y hora real de la pausa')), '')
  );

  SELECT orden.estado INTO v_estado_orden
  FROM public.ordenes_produccion AS orden WHERE orden.id = v_sesion.orden_id;
  SELECT programacion.estado_planeacion INTO v_estado_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id;

  RETURN QUERY
  SELECT sesion.id, sesion.estado_sesion, sesion.fecha_fin, sesion.horas_netas,
         sesion.piezas_producidas, v_estado_programacion, sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;
END;
$$;

COMMENT ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text) IS
  'C20: corrige piezas y hora real de una pausa automática; registra avance y delta de tiempo, y finaliza si completa la meta. Dueño con PIN o admin con gestionar_produccion.';

REVOKE ALL ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.pausar_sesiones_jornada_excedida(
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sesion_id uuid,
  orden_id uuid,
  programacion_id uuid,
  horas_netas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion record;
  v_jornada numeric;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_bajo timestamptz;
  v_alto timestamptz;
  v_medio timestamptz;
  v_iteracion integer;
  v_fin_jornada timestamptz;
BEGIN
  FOR v_sesion IN
    SELECT sesion.id, sesion.orden_id, sesion.partida_id, sesion.operador_id,
           sesion.programacion_id, sesion.fecha_inicio, sesion.notas,
           programacion.recurso_id, programacion.fecha_programada, programacion.turno
    FROM public.sesiones_trabajo AS sesion
    JOIN public.programacion_areas AS programacion
      ON programacion.id = sesion.programacion_id
    WHERE sesion.estado_sesion = 'activa'
      AND (p_operador_id IS NULL OR sesion.operador_id = p_operador_id)
    ORDER BY sesion.fecha_inicio
  LOOP
    v_jornada := privado.obtener_jornada_recurso_turno(
      v_sesion.recurso_id, v_sesion.fecha_programada, v_sesion.turno);

    SELECT calculo.horas_brutas, calculo.horas_netas
    INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;

    CONTINUE WHEN coalesce(v_horas_netas, 0) <= v_jornada;

    -- Instante exacto en que las horas netas alcanzan la jornada (bisección).
    v_bajo := v_sesion.fecha_inicio;
    v_alto := now();
    FOR v_iteracion IN 1..40 LOOP
      v_medio := v_bajo + (v_alto - v_bajo) / 2;
      SELECT calculo.horas_netas INTO v_horas_netas
      FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_medio) AS calculo;
      IF v_horas_netas >= v_jornada THEN
        v_alto := v_medio;
      ELSE
        v_bajo := v_medio;
      END IF;
    END LOOP;
    v_fin_jornada := v_alto;

    SELECT calculo.horas_brutas, calculo.horas_netas
    INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fin_jornada) AS calculo;

    -- Mismo orden de locks que el resto del motor de sesiones:
    -- partida -> orden -> programación -> sesión.
    PERFORM 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_sesion.partida_id
    FOR UPDATE;
    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = v_sesion.orden_id
    FOR UPDATE;
    PERFORM 1 FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_sesion.programacion_id
    FOR UPDATE;
    PERFORM 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = v_sesion.id AND sesion.estado_sesion = 'activa'
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.sesiones_trabajo AS sesion
    SET fecha_fin = v_fin_jornada,
        horas_brutas = v_horas_brutas,
        horas_netas = v_horas_netas,
        piezas_producidas = 0,
        motivo_pausa = 'otro',
        motivo_pausa_codigo = 'FIN_JORNADA',
        motivo_pausa_nota = 'Pausa automática al cumplir la jornada del turno.',
        notas = nullif(concat_ws(' · ', nullif(btrim(sesion.notas), ''),
          'Pausa automática por jornada'), ''),
        pendiente_actualizacion_avance = true,
        fecha_fin_declarada = NULL,
        estado_sesion = 'pausada'
    WHERE sesion.id = v_sesion.id;

    -- C20: el tiempo de este bloque se contabiliza aquí para que la
    -- corrección de avance pueda ajustar la diferencia exacta, sin duplicarlo.
    UPDATE public.partidas_orden_produccion AS partida
    SET tiempo_real_minutos = partida.tiempo_real_minutos + (v_horas_netas * 60)
    WHERE partida.id = v_sesion.partida_id;

    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'bloqueada'
    WHERE programacion.id = v_sesion.programacion_id
      AND programacion.estado_planeacion = 'en_proceso';

    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (v_sesion.partida_id, v_sesion.operador_id, 'pausa',
      'Pausa automática al cumplir la jornada del turno');

    sesion_id := v_sesion.id;
    orden_id := v_sesion.orden_id;
    programacion_id := v_sesion.programacion_id;
    horas_netas := v_horas_netas;
    RETURN NEXT;
  END LOOP;
END;
$$;

