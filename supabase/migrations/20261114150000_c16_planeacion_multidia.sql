-- =============================================================================
-- C16 (2026-11-14): programar una operación que no cabe en una jornada.
--
-- Observación del cliente: una operación con 15.25 h estimadas no se puede
-- programar en un turno de 8 h. El sistema debe recomendar repartirla en varios
-- días y permitir que el usuario elija los días; la producción continúa con el
-- flujo normal (una sola sesión que se pausa/retoma).
--
-- Modelo:
--   * La fila principal de `programacion_areas` conserva la operación y su
--     primera jornada. Las filas adicionales son reservas de capacidad del
--     mismo `meta_proceso_id` en días posteriores (`es_continuacion = true`).
--   * La producción usa SIEMPRE la fila principal; las continuaciones solo
--     reservan capacidad y se muestran en el calendario.
--   * Al completar la operación, todas sus filas se marcan `completada`.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Días adicionales de una misma operación.
-- -----------------------------------------------------------------------------
ALTER TABLE public.programacion_areas
  ADD COLUMN IF NOT EXISTS es_continuacion boolean NOT NULL DEFAULT false;

ALTER TABLE public.programacion_areas
  DROP CONSTRAINT IF EXISTS programacion_areas_continuacion_valida;
ALTER TABLE public.programacion_areas
  ADD CONSTRAINT programacion_areas_continuacion_valida CHECK (
    NOT es_continuacion OR meta_proceso_id IS NOT NULL);

-- Una operación puede ocupar un día por fecha; las continuaciones viven en
-- fechas distintas y la fila principal es única por operación.
DROP INDEX IF EXISTS public.idx_programacion_areas_operacion_unica;
-- La fila principal sigue siendo única por operación (programación de un día).
CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_operacion_principal_unica
  ON public.programacion_areas (partida_id, meta_proceso_id)
  WHERE meta_proceso_id IS NOT NULL AND es_continuacion = false;
-- Cada día adicional vive en una fecha distinta de la misma operación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_operacion_dia_unico
  ON public.programacion_areas (partida_id, meta_proceso_id, fecha_programada)
  WHERE meta_proceso_id IS NOT NULL;

COMMENT ON COLUMN public.programacion_areas.es_continuacion IS
  'C16: true en las filas que reservan un día adicional de una operación; la producción usa la fila principal (false).';

-- -----------------------------------------------------------------------------
-- 2. Programar la operación repartida en varios días (atómico y auditado).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.programar_operacion_multidia_auditada(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_turno text,
  p_dias jsonb,
  p_orden_prioridad integer,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
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
  v_dia record;
  v_indice integer := 0;
  v_parent_id uuid;
  v_secuencia smallint;
  v_operacion text;
  v_capacidad numeric;
  v_ocupado numeric;
  v_recurso_activo boolean;
  v_orden_partida_id uuid;
  v_fechas date[] := '{}';
  v_total numeric := 0;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
  END IF;
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_recurso_id IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_orden_prioridad IS NULL OR p_orden_prioridad NOT BETWEEN 1 AND 9999
     OR p_meta_proceso_id IS NULL
     OR p_dias IS NULL OR jsonb_typeof(p_dias) <> 'array'
     OR jsonb_array_length(p_dias) < 2 OR jsonb_array_length(p_dias) > 15 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida → orden → meta → recurso.
  SELECT partida.orden_id INTO v_orden_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND OR v_orden_partida_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id AND orden.estado NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_programable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT meta.secuencia INTO v_secuencia
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id AND meta.partida_id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.programacion_areas AS programacion
    WHERE programacion.partida_id = p_partida_id
      AND programacion.meta_proceso_id = p_meta_proceso_id
      AND programacion.estado_planeacion <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'programacion_duplicada' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT recurso.activo INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT privado.recurso_compatible_con_operacion(p_partida_id, p_meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
  END IF;

  -- Validación de cada día antes de insertar: fechas únicas, horas y capacidad.
  FOR v_dia IN
    SELECT dia.fecha, dia.horas
    FROM jsonb_to_recordset(p_dias) AS dia(fecha date, horas numeric)
    ORDER BY dia.fecha
  LOOP
    IF v_dia.fecha IS NULL OR v_dia.horas IS NULL
       OR v_dia.horas <= 0 OR v_dia.horas > 24 THEN
      RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
    END IF;
    IF v_dia.fecha = ANY(v_fechas) THEN
      RAISE EXCEPTION 'programacion_duplicada' USING ERRCODE = 'unique_violation';
    END IF;
    v_fechas := array_append(v_fechas, v_dia.fecha);

    v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
      p_recurso_id, v_dia.fecha, p_turno);
    IF v_capacidad <= 0 THEN
      RAISE EXCEPTION 'capacidad_no_disponible' USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
    INTO v_ocupado
    FROM public.programacion_areas AS programacion
    WHERE programacion.recurso_id = p_recurso_id
      AND programacion.fecha_programada = v_dia.fecha
      AND programacion.turno = p_turno
      AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

    IF v_ocupado + v_dia.horas > v_capacidad THEN
      RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
    END IF;
    v_total := v_total + v_dia.horas;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_dia IN
    SELECT dia.fecha, dia.horas
    FROM jsonb_to_recordset(p_dias) AS dia(fecha date, horas numeric)
    ORDER BY dia.fecha
  LOOP
    v_indice := v_indice + 1;
    INSERT INTO public.programacion_areas (
      orden_id, partida_id, recurso_id, secuencia, fecha_programada, turno,
      horas_estimadas, orden_prioridad, estado_planeacion, meta_proceso_id,
      es_continuacion
    ) VALUES (
      p_orden_id, p_partida_id, p_recurso_id, v_secuencia, v_dia.fecha, p_turno,
      v_dia.horas, p_orden_prioridad, 'programada', p_meta_proceso_id,
      v_indice > 1
    )
    RETURNING programacion_areas.id INTO v_parent_id;
  END LOOP;

  -- La primera fila (menor fecha) es la principal; las demás son continuaciones.
  SELECT programacion.id INTO v_parent_id
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = p_partida_id
    AND programacion.meta_proceso_id = p_meta_proceso_id
    AND programacion.estado_planeacion <> 'cancelada'
  ORDER BY programacion.fecha_programada, programacion.creado_en
  LIMIT 1;

  SELECT meta.nombre INTO v_operacion
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'programacion_inicial',
    jsonb_build_object(
      'anterior', NULL,
      'nuevo', jsonb_build_object(
        'programacion_id', v_parent_id,
        'partida_id', p_partida_id,
        'recurso_id', p_recurso_id,
        'secuencia', v_secuencia,
        'fecha_programada', (SELECT min(fecha) FROM unnest(v_fechas) AS fecha),
        'turno', p_turno,
        'horas_estimadas', v_total,
        'orden_prioridad', p_orden_prioridad,
        'meta_proceso_id', p_meta_proceso_id,
        'operacion', v_operacion,
        'dias', p_dias
      )
    ),
    'Programación inicial en varios días', p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT programacion.id, programacion.estado_planeacion, programacion.actualizado_en
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_parent_id;
END;
$$;

COMMENT ON FUNCTION public.programar_operacion_multidia_auditada(
  uuid, uuid, uuid, text, jsonb, integer, uuid, uuid, uuid
) IS
  'C16: reparte una operación en varios días validando capacidad por jornada; solo service_role.';

REVOKE ALL ON FUNCTION public.programar_operacion_multidia_auditada(
  uuid, uuid, uuid, text, jsonb, integer, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programar_operacion_multidia_auditada(
  uuid, uuid, uuid, text, jsonb, integer, uuid, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Las continuaciones no abren preparación ni sesión: solo reservan capacidad.
-- -----------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Cierre de sesión: completar la operación marca todos sus días.
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
