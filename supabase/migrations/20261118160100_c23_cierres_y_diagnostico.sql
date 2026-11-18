-- =============================================================================
-- C23.2 (2026-11-18): cierres que ya no se atoran y diagnóstico de calidad.
--
--   * Una sesión activa se puede cerrar o pausar aunque otra sesión de la
--     misma operación la haya dejado en `bloqueada` o `completada`: el estado
--     se revalida y se recalcula con los hechos, sin reabrir una operación ya
--     completa.
--   * Las horas reales de la partida se derivan de las sesiones en todos los
--     caminos (cierre manual y pausa automática por jornada).
--   * Se permite ajustar SOLO las horas estimadas de una operación `en_proceso`
--     desde Planeación (bug: 2.8 h programadas frente a 3.92 h de ruteo sin
--     forma de corregirlo).
--   * Se agrega `diagnostico_consistencia_orden` para que el administrador vea
--     conteos y horas desincronizados, pausas huérfanas y entregas pendientes.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cierre de sesión: acepta el estado real de la operación y deriva horas.
-- -----------------------------------------------------------------------------
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
  v_dia date;
  v_horas_dia numeric;
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

  -- C23: la operación pudo quedar completada o bloqueada por otra sesión de la
  -- misma partida. Se bloquea igual y se decide el estado con los hechos, en
  -- vez de rechazar el cierre de una sesión que sí está activa.
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = (
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_programacion.estado_planeacion = 'cancelada' THEN
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

  -- C20: la jornada se controla por DÍA laboral del operador, no por sesión.
  -- Reanudar el mismo día no reinicia el contador de horas extra.
  IF p_estado_destino = 'finalizada' THEN
    v_jornada := privado.obtener_jornada_recurso_turno(
      v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);
    v_dia := (v_sesion.fecha_inicio AT TIME ZONE 'America/Tijuana')::date;
    v_horas_dia := v_horas_netas
      + coalesce(privado.horas_netas_operador_dia(v_sesion.operador_id, v_dia), 0);
    IF v_horas_dia > v_jornada THEN
      -- Una justificación del propio operador, atada a ESTA sesión, cubre el
      -- exceso del día; la autorización de un responsable debe cubrir el total.
      SELECT autorizacion.id INTO v_autorizacion_id
      FROM public.autorizaciones_hora_extra AS autorizacion
      WHERE autorizacion.orden_id = v_sesion.orden_id
        AND (
          (autorizacion.estado = 'JUSTIFICADA' AND autorizacion.sesion_id = p_sesion_id)
          OR (
            autorizacion.estado = 'VIGENTE'
            AND (autorizacion.sesion_id = p_sesion_id OR autorizacion.sesion_id IS NULL)
            AND autorizacion.horas_autorizadas >= (v_horas_dia - v_jornada)
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
  SET cantidad_producida = v_cantidad_producida_nueva
  WHERE partida.id = v_sesion.partida_id;

  -- C23: invariante única; no se acumulan minutos a mano.
  PERFORM privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

  v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);

  IF p_estado_destino = 'pausada' THEN
    -- C23: pausar una sesión no reabre una operación que otra sesión ya cerró.
    v_estado_programacion := CASE
      WHEN v_programacion.estado_planeacion IN ('completada', 'cancelada')
        THEN v_programacion.estado_planeacion
      WHEN EXISTS (
        SELECT 1 FROM public.sesiones_trabajo AS otra
        WHERE otra.programacion_id = v_sesion.programacion_id
          AND otra.id <> v_sesion.id
          AND otra.estado_sesion = 'activa'
      ) THEN 'en_proceso'
      ELSE 'bloqueada'
    END;
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

  -- Nunca degradar una operación ya completa cuando la partida sigue completa.
  IF v_programacion.estado_planeacion = 'completada' AND v_partida_completa THEN
    v_estado_programacion := 'completada';
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

    -- C23: aviso operativo, no bloqueo; la entrega puede registrarse después.
    IF NOT EXISTS (
      SELECT 1 FROM public.notas_entrega AS nota WHERE nota.orden_id = v_sesion.orden_id
    ) THEN
      INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
      VALUES (v_sesion.partida_id, p_operador_id, 'fin',
        'Orden completada sin nota de entrega registrada');
    END IF;
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

COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) IS
  'C20/C23: cierra o pausa una sesión activa con la hora real declarada, deriva las horas de la partida de las sesiones y acepta una operación ya completada o bloqueada por otra sesión. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Pausa automática por jornada: no bloquea una operación ya completa ni
--    duplica horas; el total se deriva de las sesiones.
-- -----------------------------------------------------------------------------
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

    -- C23: el total de la partida se deriva de las sesiones; no se acumula.
    PERFORM privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'bloqueada'
    WHERE programacion.id = v_sesion.programacion_id
      AND programacion.estado_planeacion = 'en_proceso'
      AND NOT EXISTS (
        SELECT 1 FROM public.sesiones_trabajo AS otra
        WHERE otra.programacion_id = v_sesion.programacion_id
          AND otra.id <> v_sesion.id
          AND otra.estado_sesion = 'activa'
      );

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

COMMENT ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid) IS
  'C15/C20/C23: pausa las sesiones que agotaron su jornada, deriva las horas de la partida y no bloquea operaciones ya completadas. Solo service_role.';

REVOKE ALL ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Reprogramación: la corrección de horas de una operación `en_proceso` ya
--    vive en la migración C24 (20261118150000), que redefinió la función con
--    capacidad por día y mensajes con detalle. Aquí no se vuelve a definir para
--    no regresar ese comportamiento.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. Diagnóstico de consistencia por orden para el administrador del taller.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diagnostico_consistencia_orden(p_orden_id uuid)
RETURNS TABLE (
  codigo text,
  severidad text,
  partida_id uuid,
  sesion_id uuid,
  programacion_id uuid,
  detalle text,
  valor_actual numeric,
  valor_esperado numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_pendientes numeric;
BEGIN
  IF p_orden_id IS NULL THEN
    RAISE EXCEPTION 'orden_requerida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- 1. Horas reales desincronizadas contra la suma de sesiones válidas.
  RETURN QUERY
  SELECT 'tiempo_real_desincronizado', 'media', partida.id, NULL::uuid, NULL::uuid,
    format('La partida %s registra %s min reales; sus sesiones suman %s min.',
      partida.codigo_pieza,
      round(partida.tiempo_real_minutos, 2),
      round(total.minutos, 2)),
    partida.tiempo_real_minutos, round(total.minutos, 2)
  FROM public.partidas_orden_produccion AS partida
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(sesion.horas_netas * 60), 0)::numeric AS minutos
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = partida.id
      AND NOT sesion.sesion_invalida
  ) AS total
  WHERE partida.orden_id = p_orden_id
    AND abs(partida.tiempo_real_minutos - round(total.minutos, 2)) > 0.01;

  -- 2. Producción por encima de lo solicitado.
  RETURN QUERY
  SELECT 'produccion_excede_solicitada', 'alta', partida.id, NULL::uuid, NULL::uuid,
    format('La partida %s produjo %s piezas de %s solicitadas.',
      partida.codigo_pieza, partida.cantidad_producida, partida.cantidad_solicitada),
    partida.cantidad_producida, partida.cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
    AND partida.cantidad_producida > partida.cantidad_solicitada;

  -- 3. Avance de una meta por encima de su objetivo.
  RETURN QUERY
  SELECT 'meta_excede_piezas', 'alta', meta.partida_id, NULL::uuid, NULL::uuid,
    format('La operación %s declaró %s piezas de %s.',
      meta.nombre, hecho.total, meta.meta_piezas),
    hecho.total, meta.meta_piezas
  FROM public.metas_proceso_partida AS meta
  JOIN public.partidas_orden_produccion AS partida ON partida.id = meta.partida_id
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(avance.cantidad_producida), 0)::numeric AS total
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = meta.id
  ) AS hecho
  WHERE partida.orden_id = p_orden_id
    AND hecho.total > meta.meta_piezas;

  -- 4. Cantidad física de la partida distinta del avance de la última operación.
  RETURN QUERY
  WITH ultima AS (
    SELECT DISTINCT ON (meta.partida_id)
      meta.partida_id, meta.id, meta.secuencia
    FROM public.metas_proceso_partida AS meta
    ORDER BY meta.partida_id, meta.secuencia DESC
  ),
  hecho AS (
    SELECT ultima.partida_id, coalesce(sum(avance.cantidad_producida), 0)::numeric AS total
    FROM ultima
    LEFT JOIN public.registros_avance_partida AS avance ON avance.meta_proceso_id = ultima.id
    GROUP BY ultima.partida_id
  )
  SELECT 'cantidad_producida_inconsistente', 'media', partida.id, NULL::uuid, NULL::uuid,
    format('La partida %s registra %s piezas y su última operación suma %s.',
      partida.codigo_pieza, partida.cantidad_producida, hecho.total),
    partida.cantidad_producida, hecho.total
  FROM hecho
  JOIN public.partidas_orden_produccion AS partida ON partida.id = hecho.partida_id
  WHERE partida.orden_id = p_orden_id
    AND abs(partida.cantidad_producida - hecho.total) > 0.0001;

  -- 5. Producción sin ninguna programación (brecha histórica, no se inventa).
  RETURN QUERY
  SELECT 'produccion_sin_programacion', 'media', partida.id, NULL::uuid, NULL::uuid,
    format('La partida %s produjo %s piezas sin una operación programada registrada.',
      partida.codigo_pieza, partida.cantidad_producida),
    partida.cantidad_producida, NULL::numeric
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
    AND partida.cantidad_producida > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.programacion_areas AS programacion
      WHERE programacion.partida_id = partida.id
        AND programacion.estado_planeacion <> 'cancelada'
    );

  -- 6. Pausas que quedaron atrapadas porque la orden ya terminó.
  RETURN QUERY
  SELECT 'pausa_huerfana', 'media', sesion.partida_id, sesion.id, sesion.programacion_id,
    format('Pausa de %s h sin cerrar; la orden ya terminó.', sesion.horas_netas),
    sesion.horas_netas, NULL::numeric
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion = 'pausada'
    AND NOT sesion.sesion_invalida
    AND (v_orden.estado IN ('completada', 'cerrada')
      OR v_orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA'));

  -- 7. Sesiones vacías que solo estorban al historial.
  RETURN QUERY
  SELECT 'sesion_vacia', 'baja', sesion.partida_id, sesion.id, sesion.programacion_id,
    'Sesión sin piezas y sin horas; puede descartarse.',
    sesion.horas_netas, 0::numeric
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion = 'pausada'
    AND NOT sesion.sesion_invalida
    AND coalesce(sesion.piezas_producidas, 0) = 0
    AND coalesce(sesion.horas_netas, 0) = 0;

  -- 8. Sesión activa sobre una operación que ya no es operable.
  RETURN QUERY
  SELECT 'sesion_activa_programacion_inoperable', 'alta',
    sesion.partida_id, sesion.id, sesion.programacion_id,
    format('Hay una sesión activa pero la operación está en estado %s.',
      programacion.estado_planeacion),
    NULL::numeric, NULL::numeric
  FROM public.sesiones_trabajo AS sesion
  JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion = 'activa'
    AND programacion.estado_planeacion NOT IN ('en_proceso', 'en_preparacion');

  -- 9. Operación bloqueada sin ninguna sesión que la pueda liberar.
  RETURN QUERY
  SELECT 'programacion_bloqueada_sin_sesion', 'media', programacion.partida_id,
    NULL::uuid, programacion.id,
    'La operación está bloqueada y no tiene sesión activa ni pausada.',
    NULL::numeric, NULL::numeric
  FROM public.programacion_areas AS programacion
  WHERE programacion.orden_id = p_orden_id
    AND programacion.estado_planeacion = 'bloqueada'
    AND NOT EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.programacion_id = programacion.id
        AND sesion.estado_sesion IN ('activa', 'pausada')
        AND NOT sesion.sesion_invalida
    );

  -- 10. Consumo de material pendiente en una orden ya terminada.
  RETURN QUERY
  SELECT 'consumo_material_pendiente', 'media', partida.id, NULL::uuid, NULL::uuid,
    format('La partida %s exige consumo de material y no lo tiene registrado.',
      partida.codigo_pieza),
    NULL::numeric, NULL::numeric
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
    AND (v_orden.estado IN ('completada', 'cerrada')
      OR v_orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA'))
    AND privado.partida_requiere_consumo_material(partida.id);

  -- 11. Orden terminada sin nota de entrega.
  v_pendientes := privado.pendientes_entrega_orden(p_orden_id);
  IF coalesce(v_pendientes, 0) > 0
     AND (v_orden.estado IN ('completada', 'cerrada')
       OR v_orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')) THEN
    RETURN QUERY
    SELECT 'orden_completada_sin_entrega', 'media', NULL::uuid, NULL::uuid, NULL::uuid,
      format('La orden terminó con %s piezas pendientes de entrega.', v_pendientes),
      v_pendientes, 0::numeric;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.diagnostico_consistencia_orden(uuid) IS
  'C23: lista las inconsistencias accionables de una orden (horas, cantidades, pausas huérfanas, material y entrega) sin modificar datos. Solo service_role.';

REVOKE ALL ON FUNCTION public.diagnostico_consistencia_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.diagnostico_consistencia_orden(uuid)
  TO service_role;
