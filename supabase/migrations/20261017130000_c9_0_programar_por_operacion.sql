-- =============================================================================
-- C9.0 — Programar por operación (P-01 B)
-- =============================================================================
-- El cliente exige que Planeación programe por OPERACIÓN del ruteo (cada proceso
-- con su recurso, fecha, turno y horas). Las operaciones ya existen en
-- `metas_proceso_partida` (A20) y el avance de Producción ya se registra contra
-- ellas; esta migración alinea la programación.
--
-- Diseño aprobado (ficha C9.0, docs/observaciones-cliente-2026-10-07):
--   1. Columna aditiva nullable `programacion_areas.meta_proceso_id`; sin
--      backfill: lo existente queda como fila «heredada» (sin operación).
--   2. Los dos UNIQUE globales se reemplazan por índices únicos parciales:
--        - heredadas (meta NULL): (partida_id, recurso_id) y (partida_id, secuencia)
--        - operaciones (meta NOT NULL): (partida_id, meta_proceso_id) → 1 fila
--          por operación. Dos operaciones de la misma partida SÍ pueden usar el
--          mismo recurso (se ejecutan una tras otra; el candado de recurso activo
--          y la capacidad siguen intactos).
--   3. `programar_partida_recurso(_auditada)`: recreadas con
--      `p_meta_proceso_id uuid DEFAULT NULL` al final (las llamadas viejas de
--      8/10 argumentos siguen resolviendo). Con operación se exige `p_secuencia`
--      NULL y la secuencia se DERIVA de `meta.secuencia`; sin operación el
--      comportamiento actual queda intacto.
--   4. `cerrar_sesion_trabajo_operador`: sin meta explícita, el avance se
--      atribuye a la operación programada en la fila de la sesión (antes: la
--      última meta de la partida). Las filas heredadas conservan el respaldo.
--   5. `reprogramar_partida_recurso(_auditada)`: sin cambios (D-4: la operación
--      no se reasigna al reprogramar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columna meta_proceso_id (aditiva, nullable, sin backfill)
-- -----------------------------------------------------------------------------
ALTER TABLE public.programacion_areas
  ADD COLUMN IF NOT EXISTS meta_proceso_id uuid;

ALTER TABLE public.programacion_areas
  DROP CONSTRAINT IF EXISTS programacion_areas_meta_proceso_id_fkey;
ALTER TABLE public.programacion_areas
  ADD CONSTRAINT programacion_areas_meta_proceso_id_fkey
  FOREIGN KEY (meta_proceso_id) REFERENCES public.metas_proceso_partida (id)
  ON DELETE RESTRICT;

COMMENT ON COLUMN public.programacion_areas.meta_proceso_id IS
  'C9.0/P-01 B: operación del ruteo (metas_proceso_partida) que esta fila programa. NULL = fila heredada del modelo por área.';

-- -----------------------------------------------------------------------------
-- 2. Índices únicos: los globales se vuelven parciales para que convivan las
--    filas heredadas (sin operación) y las filas por operación.
-- -----------------------------------------------------------------------------
ALTER TABLE public.programacion_areas
  DROP CONSTRAINT IF EXISTS programacion_areas_partida_recurso_unico;
ALTER TABLE public.programacion_areas
  DROP CONSTRAINT IF EXISTS programacion_areas_partida_secuencia_unica;

CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_heredada_recurso_unico
  ON public.programacion_areas (partida_id, recurso_id)
  WHERE meta_proceso_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_heredada_secuencia_unica
  ON public.programacion_areas (partida_id, secuencia)
  WHERE meta_proceso_id IS NULL;

-- Una operación del ruteo solo puede estar programada una vez por partida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_operacion_unica
  ON public.programacion_areas (partida_id, meta_proceso_id)
  WHERE meta_proceso_id IS NOT NULL;

-- La FK (ON DELETE RESTRICT) necesita índice sobre el lado referenciante para
-- no degradar los borrados de metas de partidas borrador.
CREATE INDEX IF NOT EXISTS idx_programacion_areas_meta_proceso
  ON public.programacion_areas (meta_proceso_id)
  WHERE meta_proceso_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. RPC core: recreación con p_meta_proceso_id al final (DEFAULT NULL).
--    Las llamadas posicionales viejas de 8 argumentos seguirán resolviendo.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer);

CREATE OR REPLACE FUNCTION public.programar_partida_recurso(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer DEFAULT 1,
  p_meta_proceso_id uuid DEFAULT NULL
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
  v_recurso_activo boolean;
  v_orden_partida_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
  v_secuencia smallint;
BEGIN
  IF p_orden_id IS NULL
     OR p_partida_id IS NULL
     OR p_recurso_id IS NULL
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- C9.0: con operación la secuencia se deriva de la meta (el formulario la
  -- deja de capturar); sin operación la secuencia manual sigue siendo obligatoria.
  IF p_meta_proceso_id IS NULL THEN
    IF p_secuencia IS NULL OR p_secuencia <= 0 THEN
      RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_secuencia IS NOT NULL THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida → orden → recurso (igual que el motor de sesiones).
  SELECT partida.orden_id
  INTO v_orden_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden_partida_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  -- La operación debe pertenecer a la partida; bajo el lock de la partida.
  IF p_meta_proceso_id IS NOT NULL THEN
    SELECT meta.secuencia
    INTO v_secuencia
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = p_meta_proceso_id
      AND meta.partida_id = p_partida_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_secuencia := p_secuencia;
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_programable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT recurso.activo
  INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_activo = false THEN
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
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.programacion_areas (
    orden_id,
    partida_id,
    recurso_id,
    secuencia,
    fecha_programada,
    turno,
    horas_estimadas,
    orden_prioridad,
    estado_planeacion,
    meta_proceso_id
  ) VALUES (
    p_orden_id,
    p_partida_id,
    p_recurso_id,
    v_secuencia,
    p_fecha_programada,
    p_turno,
    p_horas_estimadas,
    p_orden_prioridad,
    'programada',
    p_meta_proceso_id
  )
  RETURNING
    programacion_areas.id,
    programacion_areas.estado_planeacion,
    programacion_areas.actualizado_en;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'programacion_duplicada' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid) IS
  'C9.0/P-01 B: programa una partida (heredada, con secuencia manual) o una operación del ruteo (secuencia derivada de la meta) validando capacidad y candados. Motor núcleo sin superficie de Data API: solo lo invoca el wrapper auditado.';

-- El motor núcleo no es superficie de Data API (C4.2): el wrapper auditado, que
-- verifica actor y permiso, es el único invocable por la aplicación.
REVOKE EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Wrapper auditado: recreación con p_meta_proceso_id al final.
--    Las llamadas posicionales viejas de 10 argumentos siguen resolviendo.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid);

CREATE OR REPLACE FUNCTION public.programar_partida_recurso_auditada(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_meta_proceso_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_planeacion text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resultado record;
  v_secuencia smallint;
  v_operacion text;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_resultado
  FROM public.programar_partida_recurso(
    p_orden_id, p_partida_id, p_recurso_id, p_secuencia,
    p_fecha_programada, p_turno, p_horas_estimadas, p_orden_prioridad,
    p_meta_proceso_id
  );

  -- La secuencia y la operación del evento son las REALES de la fila insertada:
  -- con operación, la derivada de la meta (el parámetro pudo venir NULL).
  SELECT programacion.secuencia, meta.nombre
  INTO v_secuencia, v_operacion
  FROM public.programacion_areas AS programacion
  LEFT JOIN public.metas_proceso_partida AS meta
    ON meta.id = programacion.meta_proceso_id
  WHERE programacion.id = v_resultado.id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'programacion_inicial',
    jsonb_build_object(
      'anterior', NULL,
      'nuevo', jsonb_build_object(
        'programacion_id', v_resultado.id,
        'partida_id', p_partida_id,
        'recurso_id', p_recurso_id,
        'secuencia', v_secuencia,
        'fecha_programada', p_fecha_programada,
        'turno', p_turno,
        'horas_estimadas', p_horas_estimadas,
        'orden_prioridad', p_orden_prioridad,
        'meta_proceso_id', p_meta_proceso_id,
        'operacion', v_operacion
      )
    ),
    'Programación inicial', p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_resultado.id, v_resultado.estado_planeacion, v_resultado.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid, uuid) IS
  'C9.0/C4.2: programa mediante el motor de capacidad y registra actor, correlación, operación y estado nuevo en la historia de la Orden.';

REVOKE ALL ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Cierre de sesión: sin meta explícita, el avance se atribuye a la operación
--    programada en la fila de la sesión (D-3). Las filas heredadas conservan el
--    respaldo histórico (última meta de la partida). Firma sin cambios.
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
      SELECT autorizacion.id INTO v_autorizacion_id
      FROM public.autorizaciones_hora_extra AS autorizacion
      WHERE autorizacion.estado = 'VIGENTE'
        AND autorizacion.orden_id = v_sesion.orden_id
        AND (autorizacion.sesion_id = p_sesion_id OR autorizacion.sesion_id IS NULL)
        AND autorizacion.horas_autorizadas >= (v_horas_netas - v_jornada)
      ORDER BY (autorizacion.sesion_id = p_sesion_id) DESC, autorizacion.creado_en
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
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;
  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = v_estado_programacion
  WHERE programacion.id = v_sesion.programacion_id;
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
  'SII-B6.2/D2-A/C9.0-D3: cierra o pausa una sesión (motivo de catálogo, primera pieza, horas extra sobre la jornada del turno), atribuye el avance a la operación programada cuando no se indica meta explícita y deriva el estado de la corrida. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) TO service_role;
