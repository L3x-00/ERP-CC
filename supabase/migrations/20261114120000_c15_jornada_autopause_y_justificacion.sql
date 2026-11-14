-- =============================================================================
-- C15 (2026-11-14): la jornada del turno se respeta sin dejar al operador
-- bloqueado.
--
-- Observaciones del cliente:
--   1. Si el operador olvida cerrar la sesión, el reloj sigue corriendo más allá
--      de la jornada. El sistema debe pausarla al cumplir el límite y no dejar
--      que el conteo crezca indefinidamente.
--   2. Cuando una sesión ya excedió la jornada, el cierre quedaba bloqueado
--      esperando la aprobación de un responsable. El operador necesita una
--      salida: puede pedir aprobación o justificar el exceso con un motivo, y
--      el cierre queda registrado y auditado.
--
-- Cambios:
--   1. `pausar_sesiones_jornada_excedida`: pausa automática en el instante en
--      que las horas netas alcanzan la jornada del recurso/turno. Se invoca al
--      cargar el tablero del operador y desde el vigilante del panel.
--   2. Estado `JUSTIFICADA` en `autorizaciones_hora_extra` y RPC
--      `justificar_horas_extra_operador`, atada a una sesión concreta.
--   3. El cierre consume autorizaciones VIGENTES (aprobadas) o JUSTIFICADAS
--      (del propio operador y de esa sesión).
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La justificación del operador es un estado propio.
-- -----------------------------------------------------------------------------
ALTER TABLE public.autorizaciones_hora_extra
  DROP CONSTRAINT IF EXISTS autorizaciones_hora_extra_estado_valido;

ALTER TABLE public.autorizaciones_hora_extra
  ADD CONSTRAINT autorizaciones_hora_extra_estado_valido CHECK (
    estado IN ('SOLICITADA','VIGENTE','USADA','RECHAZADA','REVOCADA','JUSTIFICADA'));

COMMENT ON COLUMN public.autorizaciones_hora_extra.estado IS
  'SOLICITADA -> VIGENTE (aprobada) -> USADA; JUSTIFICADA (operador, atada a su sesión) -> USADA; RECHAZADA/REVOCADA no se consumen.';

-- -----------------------------------------------------------------------------
-- 2. Pausa automática al cumplir la jornada.
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
        estado_sesion = 'pausada'
    WHERE sesion.id = v_sesion.id;

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

COMMENT ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid) IS
  'C15: pausa las sesiones activas al alcanzar la jornada del turno, registrando el corte en ese instante. Solo service_role.';

REVOKE ALL ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Justificación del exceso por el propio operador.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.justificar_horas_extra_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_motivo text
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  sesion_id uuid,
  horas_autorizadas numeric,
  motivo text,
  estado text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_horas_netas numeric;
  v_jornada numeric;
  v_exceso numeric;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_existente public.autorizaciones_hora_extra%ROWTYPE;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL
     OR char_length(v_motivo) < 10 OR char_length(v_motivo) > 270 THEN
    RAISE EXCEPTION 'justificacion_horas_extra_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  v_jornada := privado.obtener_jornada_recurso_turno(
    v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);

  SELECT calculo.horas_netas INTO v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;

  v_exceso := round(greatest(coalesce(v_horas_netas, 0) - v_jornada, 0), 2);

  IF v_exceso <= 0 THEN
    RAISE EXCEPTION 'horas_extra_no_requeridas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existente
  FROM public.autorizaciones_hora_extra AS autorizacion
  WHERE autorizacion.sesion_id = p_sesion_id
    AND autorizacion.estado IN ('SOLICITADA', 'JUSTIFICADA')
  ORDER BY autorizacion.creado_en DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.autorizaciones_hora_extra AS autorizacion
    SET estado = 'JUSTIFICADA',
        horas_autorizadas = v_exceso,
        motivo = left('Justificación del operador: ' || v_motivo, 300),
        autorizado_por = p_operador_id
    WHERE autorizacion.id = v_existente.id;
  ELSE
    INSERT INTO public.autorizaciones_hora_extra (
      orden_id, sesion_id, horas_autorizadas, motivo, autorizado_por, estado
    ) VALUES (
      v_sesion.orden_id,
      p_sesion_id,
      v_exceso,
      left('Justificación del operador: ' || v_motivo, 300),
      p_operador_id,
      'JUSTIFICADA'
    )
    RETURNING * INTO v_existente;
  END IF;

  RETURN QUERY
  SELECT autorizacion.id, autorizacion.orden_id, autorizacion.sesion_id,
    autorizacion.horas_autorizadas, autorizacion.motivo, autorizacion.estado,
    autorizacion.creado_en
  FROM public.autorizaciones_hora_extra AS autorizacion
  WHERE autorizacion.id = v_existente.id;
END;
$$;

COMMENT ON FUNCTION public.justificar_horas_extra_operador(uuid, uuid, text) IS
  'C15: el operador justifica el exceso de su propia sesión con un motivo; habilita el cierre sin esperar aprobación. Solo service_role.';

REVOKE ALL ON FUNCTION public.justificar_horas_extra_operador(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.justificar_horas_extra_operador(uuid, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Cierre de sesi?n: acepta autorizaciones aprobadas o justificadas.
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

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;
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
      -- C15: una justificaci?n del propio operador, atada a ESTA sesi?n, cubre
      -- el exceso sin esperar aprobaci?n; queda registrada y auditada. La
      -- autorizaci?n de un responsable sigue siendo v?lida y debe cubrir el
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
    fecha_fin = now(), horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
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
    SET estado = 'completada', fecha_fin = now()
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

COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) IS
  'C15: cierra o pausa una sesión; limita el avance a las piezas disponibles, solo completa la operación al alcanzar su meta y acepta autorizaciones VIGENTES o justificaciones del operador para las horas extra. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) TO service_role;
