-- =============================================================================
-- C11 - Secuencia de procesos con disponibilidad parcial.
--
-- Regla de taller: una operación del ruteo no puede arrancar ni declarar piezas
-- si el proceso inmediato anterior todavía no terminó ninguna pieza. Sí puede
-- avanzar con las piezas ya terminadas de ese proceso anterior, aunque la meta
-- anterior siga en curso (p. ej. doblar 100 de 1000 piezas ya cortadas).
--
-- Cambios:
-- 1. privado.piezas_disponibles_proceso(): piezas terminadas por el proceso
--    previo menos las ya consumidas por la operación actual.
-- 2. iniciar_sesion_trabajo_operador (firma vigente de 6 argumentos): sustituye
--    el candado de "programación previa completada" por disponibilidad real de
--    piezas. Se elimina la firma corta: sus llamadas resuelven aquí usando los
--    valores por defecto (evita la ambigüedad de sobrecargas con DEFAULT).
-- 3. cerrar_sesion_trabajo_operador: limita lo declarado a lo disponible y
--    mantiene la operación en 'programada' cuando su avance es parcial.
-- 4. registrar_avance_partida_op: misma validación para el avance global.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Disponibilidad real de una operación según su secuencia.
--    Devuelve NULL cuando no hay restricción (primera operación o sin ruteo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.piezas_disponibles_proceso(p_meta_proceso_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_previa_id uuid;
  v_hecho_previo numeric;
  v_hecho_actual numeric;
BEGIN
  IF p_meta_proceso_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_meta
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT previa.id INTO v_previa_id
  FROM public.metas_proceso_partida AS previa
  WHERE previa.partida_id = v_meta.partida_id
    AND previa.secuencia < v_meta.secuencia
  ORDER BY previa.secuencia DESC
  LIMIT 1;

  -- La primera operación del ruteo no depende de piezas de otro proceso.
  IF v_previa_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(avance.cantidad_producida), 0)
  INTO v_hecho_previo
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_previa_id;

  SELECT coalesce(sum(avance.cantidad_producida), 0)
  INTO v_hecho_actual
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_meta.id;

  RETURN greatest(v_hecho_previo - v_hecho_actual, 0);
END;
$$;

COMMENT ON FUNCTION privado.piezas_disponibles_proceso(uuid) IS
  'C11: piezas terminadas por el proceso previo que la operación indicada aún no consumió; NULL si es la primera o no tiene ruteo.';

REVOKE ALL ON FUNCTION privado.piezas_disponibles_proceso(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Inicio de sesión (firma con checklist y corrida, vigente para C10).
--    `reanudar_sesion_trabajo_a20` invoca con 4 argumentos y resuelve aquí.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.iniciar_sesion_trabajo_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_programacion_id uuid,
  p_operador_id uuid,
  p_verificacion jsonb DEFAULT NULL,
  p_corrida_id uuid DEFAULT NULL
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_area_codigo text;
  v_estado_orden text;
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_activo boolean;
  v_piezas_previas numeric;
  v_partida_procesos text[];
  v_cantidad_solicitada_partida numeric;
  v_cantidad_producida_partida numeric;
  v_corrida public.corridas%ROWTYPE;
  v_proceso public.catalogo_procesos%ROWTYPE;
  v_verificacion jsonb := p_verificacion;
  v_corrida_id uuid := p_corrida_id;
  v_codigo_item text;
  v_cantidad_pendiente numeric;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_programacion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'inicio_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id, partida.area_trabajo_codigo,
         partida.cantidad_solicitada, partida.cantidad_producida, partida.procesos, partida.codigo_pieza
  INTO v_orden_id, v_operador_asignado_id, v_area_codigo,
       v_cantidad_solicitada_partida, v_cantidad_producida_partida, v_partida_procesos, v_codigo_item
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_orden_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND OR v_estado_orden NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_no_iniciable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT privado.operador_habilitado_area(p_operador_id, v_area_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
    AND programacion.orden_id = p_orden_id
    AND programacion.partida_id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.estado_planeacion <> 'en_preparacion' THEN
    RAISE EXCEPTION 'programacion_no_preparada' USING ERRCODE = 'check_violation';
  END IF;

  -- Secuencia con disponibilidad parcial: la operación puede arrancar aunque la
  -- anterior siga en curso, pero solo cuando ya hay piezas terminadas de la
  -- operación previa que esta todavía no haya consumido. Una sesión pausada se
  -- reanuda sin esta validación: pudo haber consumido todo el lote disponible.
  IF v_programacion.meta_proceso_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.sesiones_trabajo AS pausada
       WHERE pausada.programacion_id = p_programacion_id
         AND pausada.estado_sesion = 'pausada'
     ) THEN
    v_piezas_previas := privado.piezas_disponibles_proceso(v_programacion.meta_proceso_id);
    IF v_piezas_previas IS NOT NULL AND v_piezas_previas <= 0 THEN
      RAISE EXCEPTION 'proceso_previo_sin_piezas' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT recurso.activo INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND OR v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  -- Checklist: si no llega, se hereda el de la última sesión de la programación
  -- (permite que `reanudar_sesion_trabajo_a20` conserve el verificador original).
  IF v_verificacion IS NULL THEN
    SELECT sesion.verificacion_inicio INTO v_verificacion
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.programacion_id = p_programacion_id
    ORDER BY sesion.fecha_inicio DESC
    LIMIT 1;
  END IF;
  IF NOT privado.verificacion_inicio_completa(v_verificacion) THEN
    RAISE EXCEPTION 'verificacion_inicio_incompleta' USING ERRCODE = '23514';
  END IF;

  -- Corrida: la indicada, la activa del ítem o una legacy automática.
  IF v_corrida_id IS NOT NULL THEN
    SELECT * INTO v_corrida
    FROM public.corridas AS corrida
    WHERE corrida.id = v_corrida_id
    FOR UPDATE;
    IF NOT FOUND OR v_corrida.orden_id <> p_orden_id
       OR v_corrida.estado NOT IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA') THEN
      RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = v_corrida_id AND item.partida_id = p_partida_id
    ) THEN
      RAISE EXCEPTION 'corrida_item_no_incluye_partida' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- Preferencia: la corrida de la última sesión de esta programación (para
    -- que la reanudación conserve su corrida); si no, la única activa del ítem.
    SELECT corrida.* INTO v_corrida
    FROM public.sesiones_trabajo AS sesion
    JOIN public.corridas AS corrida ON corrida.id = sesion.corrida_id
    WHERE sesion.programacion_id = p_programacion_id
      AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA')
    ORDER BY sesion.fecha_inicio DESC
    LIMIT 1
    FOR UPDATE OF corrida;

    IF FOUND THEN
      v_corrida_id := v_corrida.id;
    ELSE
      SELECT count(*) INTO v_cantidad_pendiente
      FROM public.corridas AS corrida
      JOIN public.corrida_items AS item ON item.corrida_id = corrida.id
      WHERE item.partida_id = p_partida_id
        AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA');

      IF v_cantidad_pendiente > 1 THEN
        RAISE EXCEPTION 'corrida_ambigua' USING ERRCODE = '23514';
      END IF;

      SELECT corrida.* INTO v_corrida
      FROM public.corridas AS corrida
      JOIN public.corrida_items AS item ON item.corrida_id = corrida.id
      WHERE item.partida_id = p_partida_id
        AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA')
      ORDER BY corrida.creado_en DESC
      LIMIT 1
      FOR UPDATE OF corrida;
      IF FOUND THEN
        v_corrida_id := v_corrida.id;
      END IF;
    END IF;
  END IF;

  IF v_corrida_id IS NULL THEN
    -- Compatibilidad legacy: corrida automática de un solo ítem.
    SELECT proceso.* INTO v_proceso
    FROM public.catalogo_procesos AS proceso
    WHERE proceso.activo
      AND (
        EXISTS (
          SELECT 1 FROM public.metas_proceso_partida AS meta
          WHERE meta.partida_id = p_partida_id
            AND lower(btrim(meta.nombre)) IN (lower(btrim(proceso.nombre)), lower(btrim(proceso.codigo)))
        )
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(v_partida_procesos, '{}'::text[])) AS proceso_texto(valor)
          WHERE lower(btrim(proceso_texto.valor)) IN (lower(btrim(proceso.nombre)), lower(btrim(proceso.codigo)))
        )
      )
    ORDER BY proceso.orden
    LIMIT 1;

    IF v_proceso.id IS NULL THEN
      -- Fallback técnico de grandfathering: proceso activo genérico que no exija
      -- primera pieza (la partida legacy no declara procesos contra el catálogo;
      -- la ola 2 permitirá elegir la corrida/proceso reales).
      SELECT proceso.* INTO v_proceso
      FROM public.catalogo_procesos AS proceso
      WHERE proceso.activo AND NOT proceso.requiere_primera_pieza
      ORDER BY proceso.orden
      LIMIT 1;
    END IF;
    IF v_proceso.id IS NULL THEN
      SELECT proceso.* INTO v_proceso
      FROM public.catalogo_procesos AS proceso
      WHERE proceso.activo
      ORDER BY proceso.orden
      LIMIT 1;
    END IF;
    IF v_proceso.id IS NULL THEN
      RAISE EXCEPTION 'corrida_sin_proceso_disponible' USING ERRCODE = '23514';
    END IF;

    v_cantidad_pendiente := v_cantidad_solicitada_partida - v_cantidad_producida_partida;
    IF v_cantidad_pendiente IS NULL OR v_cantidad_pendiente <= 0 THEN
      RAISE EXCEPTION 'corrida_sin_pendiente' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partidas_orden_produccion'
        AND column_name = 'codigo_item'
    ) THEN
      EXECUTE 'SELECT coalesce(codigo_item, codigo_pieza) FROM public.partidas_orden_produccion WHERE id = $1'
      INTO v_codigo_item USING p_partida_id;
    END IF;

    INSERT INTO public.corridas (orden_id, codigo, proceso_id, cantidad_planificada, creado_por)
    VALUES (
      p_orden_id,
      privado.corrida_siguiente_codigo(p_orden_id, v_proceso.prefijo_corrida),
      v_proceso.id,
      v_cantidad_pendiente,
      p_operador_id
    )
    RETURNING public.corridas.id INTO v_corrida_id;

    INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
    VALUES (v_corrida_id, p_partida_id, v_codigo_item, v_cantidad_pendiente);
  END IF;

  -- Checklist validado antes de resolver la corrida (error determinista).

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.operador_id = p_operador_id AND sesion.estado_sesion = 'activa'
  ) THEN
    RAISE EXCEPTION 'operador_con_sesion_activa' USING ERRCODE = 'unique_violation';
  END IF;

  PERFORM privado.iniciar_corrida_interna(v_corrida_id);

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'en_proceso'
  WHERE programacion.id = p_programacion_id;
  UPDATE public.ordenes_produccion AS orden
  SET estado = 'en_proceso', fecha_inicio = coalesce(orden.fecha_inicio, now())
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  WITH nueva_sesion AS (
    INSERT INTO public.sesiones_trabajo (
      orden_id, partida_id, programacion_id, operador_id, corrida_id, verificacion_inicio
    ) VALUES (
      p_orden_id, p_partida_id, p_programacion_id, p_operador_id, v_corrida_id, v_verificacion
    )
    RETURNING *
  ), marca AS (
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (p_partida_id, p_operador_id, 'inicio', 'Sesión de producción iniciada')
  )
  SELECT
    nueva_sesion.id, nueva_sesion.orden_id, nueva_sesion.partida_id,
    nueva_sesion.programacion_id, nueva_sesion.operador_id, nueva_sesion.fecha_inicio,
    nueva_sesion.estado_sesion, nueva_sesion.creado_en, nueva_sesion.actualizado_en
  FROM nueva_sesion;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'operador_o_programacion_con_sesion_activa' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) IS
  'SII-B6.2/C11: inicia sesión dentro de una corrida validando piezas disponibles del proceso previo. Solo service_role.';

REVOKE ALL ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) TO service_role;



-- -----------------------------------------------------------------------------
-- 3. Cierre de sesión: tope por disponibilidad y estado según la meta propia.
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
  'SII-B6.2/D2-A/C9.0-D3/C11: cierra o pausa una sesión, limita el avance a las piezas disponibles del proceso previo y solo completa la operación al alcanzar su meta. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Avance global de piso: también respeta la secuencia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_avance_partida_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_cantidad_producida numeric,
  p_cantidad_scrap numeric
)
RETURNS TABLE (
  partida_id uuid,
  cantidad_producida numeric,
  cantidad_scrap numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
  v_meta_final numeric;
  v_meta_id uuid;
  v_piezas_previas numeric;
BEGIN
  IF p_cantidad_producida IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_producida < 0
     OR p_cantidad_scrap < 0
     OR (p_cantidad_producida + p_cantidad_scrap) <= 0 THEN
    RAISE EXCEPTION 'cantidad_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    partida.orden_id,
    partida.operador_asignado_id,
    partida.cantidad_producida,
    partida.cantidad_solicitada
  INTO
    v_orden_id,
    v_operador_asignado_id,
    v_cantidad_producida_actual,
    v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  IF v_cantidad_producida_actual + p_cantidad_producida > v_cantidad_solicitada THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT meta.id, meta.meta_piezas INTO v_meta_id, v_meta_final
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = p_partida_id
  ORDER BY meta.secuencia DESC
  LIMIT 1;
  IF v_meta_final IS NOT NULL
     AND v_cantidad_producida_actual + p_cantidad_producida > v_meta_final THEN
    RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
  END IF;
  -- La vía global atribuye a la meta final: también respeta las piezas que ya
  -- terminó el proceso inmediato anterior y aún no se consumieron.
  v_piezas_previas := privado.piezas_disponibles_proceso(v_meta_id);
  IF v_piezas_previas IS NOT NULL AND p_cantidad_producida > v_piezas_previas THEN
    RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.registros_avance_partida (
    partida_id,
    operador_id,
    cantidad_producida,
    cantidad_scrap,
    meta_proceso_id
  )
  VALUES (
    p_partida_id,
    p_operador_id,
    p_cantidad_producida,
    p_cantidad_scrap,
    v_meta_id
  );

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET
    cantidad_producida = partida.cantidad_producida + p_cantidad_producida,
    cantidad_scrap = partida.cantidad_scrap + p_cantidad_scrap
  WHERE partida.id = p_partida_id
  RETURNING
    partida.id,
    partida.cantidad_producida,
    partida.cantidad_scrap,
    partida.actualizado_en;

  IF privado.orden_produccion_completa(v_orden_id) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = coalesce(orden.fecha_fin, now())
    WHERE orden.id = v_orden_id
      AND orden.estado = 'en_proceso';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  TO service_role;
