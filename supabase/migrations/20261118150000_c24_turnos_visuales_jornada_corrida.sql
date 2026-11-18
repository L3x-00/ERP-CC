-- =============================================================================
-- C24 — Turnos como etiqueta visual y jornada corrida de 8 h
--
-- Regla del PO (2026-11-18):
--   * Matutino y vespertino dejan de ser una regla de capacidad: son solo una
--     etiqueta visual de preferencia. La jornada es CONTINUA: 8 h de lunes a
--     viernes, 4 h el sábado y domingo cerrado.
--   * La capacidad de un equipo es por DÍA (equipos x horas de la jornada) y la
--     carga se suma por día, sin importar la etiqueta de turno.
--   * Regla transversal: ningún error genérico. Cuando un recurso no está
--     disponible, el mensaje dice por qué (día cerrado, sin capacidad, equipo
--     ocupado o capacidad excedida con las horas reales).
--
-- Motivo: O-1126_09 fallaba al iniciar con «No hay recurso libre del área para
-- esa fecha y turno» porque el turno partía la capacidad (matutino 5 h,
-- vespertino 4 h) y el vespertino no tenía capacidad configurada. El operador
-- no tenía forma de saber qué corregir.
--
-- Aplicar solo en local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Jornada continua: 8 h L-V, 4 h sábado, domingo cerrado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.jornada_laboral_dia(p_fecha date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE extract(isodow FROM p_fecha)
    WHEN 7 THEN 0::numeric   -- domingo
    WHEN 6 THEN 4::numeric   -- sábado
    ELSE 8::numeric          -- lunes a viernes
  END;
$$;

COMMENT ON FUNCTION privado.jornada_laboral_dia(date) IS
  'C24: horas efectivas de la jornada continua (L-V 8 h, sábado 4 h, domingo 0).';

-- -----------------------------------------------------------------------------
-- 2. El turno ya no reparte la jornada: ambas etiquetas ven la jornada completa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.horas_turno_horario_laboral(p_fecha date, p_turno text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_turno = 'nocturno' THEN 0::numeric  -- la empresa cierra a las 17:00
    ELSE privado.jornada_laboral_dia(p_fecha)
  END;
$$;

COMMENT ON FUNCTION privado.horas_turno_horario_laboral(date, text) IS
  'C24: el turno es una etiqueta visual; la jornada es continua y no se parte por turno.';

-- -----------------------------------------------------------------------------
-- 3. Capacidad del equipo en la fecha: jornada completa (con override y la
--    excepción del día más restrictiva). El turno no interviene.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.horas_turno_recurso(
  p_recurso_id uuid,
  p_fecha date,
  p_turno text
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT round(
    LEAST(
      privado.jornada_laboral_dia(p_fecha),
      coalesce(
        (SELECT recurso.capacidad_jornada_override_horas
         FROM public.recursos_planeacion AS recurso
         WHERE recurso.id = p_recurso_id),
        privado.jornada_laboral_dia(p_fecha)
      ),
      coalesce(
        (SELECT min(excepcion.horas_capacidad)
         FROM public.excepciones_capacidad_recurso AS excepcion
         WHERE excepcion.recurso_id = p_recurso_id
           AND excepcion.fecha = p_fecha),
        privado.jornada_laboral_dia(p_fecha)
      )
    ),
    2
  );
$$;

COMMENT ON FUNCTION privado.horas_turno_recurso(uuid, date, text) IS
  'C24: horas de la jornada continua disponibles para el equipo en la fecha; el turno es solo etiqueta.';

CREATE OR REPLACE FUNCTION privado.obtener_capacidad_efectiva_recurso_turno(
  p_recurso_id uuid,
  p_fecha date,
  p_turno text
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT round(
    coalesce(
      (SELECT recurso.cantidad_equipos
       FROM public.recursos_planeacion AS recurso
       WHERE recurso.id = p_recurso_id),
      1
    )::numeric * privado.horas_turno_recurso(p_recurso_id, p_fecha, p_turno),
    2
  );
$$;

COMMENT ON FUNCTION privado.obtener_capacidad_efectiva_recurso_turno(uuid, date, text) IS
  'C24: equipos x jornada continua del día; la etiqueta de turno no resta capacidad.';

CREATE OR REPLACE FUNCTION privado.obtener_jornada_recurso_turno(
  p_recurso_id uuid,
  p_fecha date,
  p_turno text
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT privado.horas_turno_recurso(p_recurso_id, p_fecha, p_turno);
$$;

COMMENT ON FUNCTION privado.obtener_jornada_recurso_turno(uuid, date, text) IS
  'C24: jornada continua del equipo en la fecha (misma para cualquier etiqueta de turno).';

-- -----------------------------------------------------------------------------
-- 4. Datos: el tope de la jornada y del reclamo pasa de 9 h a 8 h.
-- -----------------------------------------------------------------------------
UPDATE public.recursos_planeacion
SET capacidad_jornada_override_horas = 8, actualizado_en = now()
WHERE capacidad_jornada_override_horas = 9;

ALTER TABLE public.reclamos_proceso_operador
  DROP CONSTRAINT IF EXISTS reclamos_proceso_operador_horas_check;
ALTER TABLE public.reclamos_proceso_operador
  ADD CONSTRAINT reclamos_proceso_operador_horas_check
  -- NOT VALID: si producción conserva algún reclamo histórico de 9 h creado
  -- bajo C18, la migración no se cae; los reclamos nuevos ya se validan a 8 h.
  CHECK (horas_estimadas > 0 AND horas_estimadas <= 8) NOT VALID;

-- -----------------------------------------------------------------------------
-- 5. Preparar el reclamo: la carga se suma por día y el error explica la causa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preparar_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_area_macro text;
  v_grupo_id uuid;
  v_recurso record;
  v_recurso_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
  v_prioridad integer;
  v_programacion_id uuid;
  v_secuencia smallint := 1;
  v_total_metas integer;
  v_reutiliza_programacion boolean := false;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> v_reclamo.orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden.estado NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_pendiente_liberacion' USING ERRCODE = 'check_violation';
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

  IF NOT privado.operador_habilitado_area(p_operador_id, v_partida.area_trabajo_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT * INTO v_meta
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = v_reclamo.meta_proceso_id
      AND meta.partida_id = v_reclamo.partida_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    v_secuencia := v_meta.secuencia;
  END IF;

  v_prioridad := CASE v_orden.prioridad
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'normal' THEN 3
    ELSE 4
  END;

  -- ¿Ya existe la fila de programación de esta operación?
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = v_reclamo.partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM v_reclamo.meta_proceso_id
  FOR UPDATE;
  v_reutiliza_programacion := FOUND;

  -- Compatibilidad C9.0: Planeación pudo preparar la partida completa (fila
  -- heredada sin operación). Si la partida tiene una sola operación, el reclamo
  -- adopta esa fila en lugar de crear otra que competiría por el mismo recurso.
  IF NOT v_reutiliza_programacion AND v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT count(*) INTO v_total_metas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = v_reclamo.partida_id;

    IF v_total_metas = 1 THEN
      SELECT * INTO v_programacion
      FROM public.programacion_areas AS programacion
      WHERE programacion.partida_id = v_reclamo.partida_id
        AND programacion.meta_proceso_id IS NULL
        AND programacion.estado_planeacion IN ('programada', 'en_preparacion')
      ORDER BY programacion.creado_en DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.programacion_areas AS programacion
        SET meta_proceso_id = v_reclamo.meta_proceso_id,
            actualizado_en = now()
        WHERE programacion.id = v_programacion.id;
        v_reutiliza_programacion := true;
      END IF;
    END IF;
  END IF;

  IF v_reutiliza_programacion THEN
    IF v_programacion.estado_planeacion = 'completada' THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_proceso' THEN
      RAISE EXCEPTION 'programacion_ya_en_proceso' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'bloqueada' THEN
      RAISE EXCEPTION 'proceso_pausado_reanudar' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_preparacion' THEN
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET programacion_id = v_programacion.id,
          actualizado_en = now()
      WHERE reclamo.id = p_reclamo_id;
      RETURN v_programacion.id;
    END IF;
    -- `programada` o `cancelada`: se revalida recurso y capacidad para el día
    -- del reclamo antes de reactivarla.
    v_programacion_id := v_programacion.id;
    v_recurso_id := v_programacion.recurso_id;
  END IF;

  IF v_recurso_id IS NOT NULL THEN
    PERFORM 1
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.id = v_recurso_id
      AND recurso.activo = true
    FOR UPDATE;

    IF NOT FOUND THEN
      v_recurso_id := NULL;
    ELSE
      v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
        v_recurso_id, v_reclamo.fecha, v_reclamo.turno
      );

      SELECT coalesce(sum(programacion.horas_estimadas), 0)
      INTO v_horas_programadas
      FROM public.programacion_areas AS programacion
      WHERE programacion.recurso_id = v_recurso_id
        AND programacion.fecha_programada = v_reclamo.fecha
        AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
        AND programacion.id IS DISTINCT FROM v_programacion_id;

      IF v_capacidad <= 0
         OR v_horas_programadas + v_reclamo.horas_estimadas > v_capacidad
         OR EXISTS (
           SELECT 1
           FROM public.programacion_areas AS ocupada
           WHERE ocupada.recurso_id = v_recurso_id
             AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
             AND ocupada.id IS DISTINCT FROM v_programacion_id
         ) THEN
        v_recurso_id := NULL;
      END IF;
    END IF;
  END IF;

  IF v_recurso_id IS NULL THEN
    v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);

    -- C18/A3: el respaldo exige el grupo de equipo que pide la operación y,
    -- si el ruteo no lo capturó, el grupo del equipo ya programado. Nunca se
    -- cambia a una máquina de otra familia: si no hay hueco en el grupo, falla.
    v_grupo_id := privado.grupo_equipo_requerido_operacion(v_reclamo.meta_proceso_id);

    IF v_grupo_id IS NULL THEN
      SELECT recurso.grupo_equipo_id INTO v_grupo_id
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.id = v_programacion.recurso_id;
    END IF;

    FOR v_recurso IN
      SELECT recurso.id
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.activo = true
        AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
        AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
      ORDER BY recurso.codigo
      FOR UPDATE
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.programacion_areas AS ocupada
        WHERE ocupada.recurso_id = v_recurso.id
          AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
          AND ocupada.id IS DISTINCT FROM v_programacion_id
      ) THEN
        CONTINUE;
      END IF;

      v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
        v_recurso.id, v_reclamo.fecha, v_reclamo.turno
      );
      IF v_capacidad <= 0 THEN
        CONTINUE;
      END IF;

      SELECT coalesce(sum(programacion.horas_estimadas), 0)
      INTO v_horas_programadas
      FROM public.programacion_areas AS programacion
      WHERE programacion.recurso_id = v_recurso.id
        AND programacion.fecha_programada = v_reclamo.fecha
        AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
        AND programacion.id IS DISTINCT FROM v_programacion_id;

      IF v_horas_programadas + v_reclamo.horas_estimadas > v_capacidad THEN
        CONTINUE;
      END IF;

      v_recurso_id := v_recurso.id;
      EXIT;
    END LOOP;

    IF v_recurso_id IS NULL THEN
      IF privado.jornada_laboral_dia(v_reclamo.fecha) <= 0 THEN
        RAISE EXCEPTION 'jornada_cerrada: el % no tiene jornada laboral; elige de lunes a sábado', v_reclamo.fecha
          USING ERRCODE = 'check_violation';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.recursos_planeacion AS recurso
        WHERE recurso.activo = true
          AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
          AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
          AND privado.obtener_capacidad_efectiva_recurso_turno(
            recurso.id, v_reclamo.fecha, v_reclamo.turno
          ) > 0
      ) THEN
        RAISE EXCEPTION 'recurso_sin_capacidad: ningún equipo del área tiene capacidad configurada para el %', v_reclamo.fecha
          USING ERRCODE = 'check_violation';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.recursos_planeacion AS recurso
        WHERE recurso.activo = true
          AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
          AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.programacion_areas AS ocupada
            WHERE ocupada.recurso_id = recurso.id
              AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
              AND ocupada.id IS DISTINCT FROM v_programacion_id
          )
      ) THEN
        RAISE EXCEPTION 'recurso_ocupado: todos los equipos del área están en preparación o en proceso el %; espera a que se libere alguno', v_reclamo.fecha
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT coalesce(max(
        privado.obtener_capacidad_efectiva_recurso_turno(recurso.id, v_reclamo.fecha, v_reclamo.turno)
        - coalesce((
            SELECT sum(programacion.horas_estimadas)
            FROM public.programacion_areas AS programacion
            WHERE programacion.recurso_id = recurso.id
              AND programacion.fecha_programada = v_reclamo.fecha
              AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
              AND programacion.id IS DISTINCT FROM v_programacion_id
          ), 0)
      ), 0)
      INTO v_capacidad
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.activo = true
        AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
        AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id);

      RAISE EXCEPTION 'recurso_capacidad_excedida: el proceso requiere % h y el equipo con más hueco solo tiene % h libres el %',
        v_reclamo.horas_estimadas, greatest(round(v_capacidad, 2), 0), v_reclamo.fecha
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_programacion_id IS NULL THEN
    INSERT INTO public.programacion_areas (
      orden_id, partida_id, recurso_id, secuencia, fecha_programada, turno,
      horas_estimadas, orden_prioridad, estado_planeacion, meta_proceso_id
    ) VALUES (
      v_reclamo.orden_id, v_reclamo.partida_id, v_recurso_id,
      v_secuencia, v_reclamo.fecha, v_reclamo.turno,
      v_reclamo.horas_estimadas, v_prioridad, 'en_preparacion',
      v_reclamo.meta_proceso_id
    )
    RETURNING id INTO v_programacion_id;
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET recurso_id = v_recurso_id,
        fecha_programada = v_reclamo.fecha,
        turno = v_reclamo.turno,
        horas_estimadas = v_reclamo.horas_estimadas,
        orden_prioridad = v_prioridad,
        estado_planeacion = 'en_preparacion',
        actualizado_en = now()
    WHERE programacion.id = v_programacion_id;
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET programacion_id = v_programacion_id,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN v_programacion_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'recurso_ocupado: otro proceso tomó el equipo en el mismo instante; actualiza y vuelve a intentar' USING ERRCODE = 'unique_violation';
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Planificación: la carga del equipo también se suma por día.
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
      RAISE EXCEPTION 'capacidad_no_disponible: el equipo no tiene capacidad configurada para el %', v_dia.fecha USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
    INTO v_ocupado
    FROM public.programacion_areas AS programacion
    WHERE programacion.recurso_id = p_recurso_id
      AND programacion.fecha_programada = v_dia.fecha
      AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

    IF v_ocupado + v_dia.horas > v_capacidad THEN
      RAISE EXCEPTION 'capacidad_insuficiente: el % ya tiene % h programadas y el proceso pide % h (capacidad % h)', v_dia.fecha, round(v_ocupado, 2), round(v_dia.horas, 2), round(v_capacidad, 2) USING ERRCODE = 'check_violation';
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

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide programar el
  -- recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_operacion(p_partida_id, p_meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    p_recurso_id,
    p_fecha_programada,
    p_turno
  );
  IF v_capacidad <= 0 THEN
    RAISE EXCEPTION 'capacidad_no_disponible: el equipo no tiene capacidad configurada para el %', p_fecha_programada USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.fecha_programada = p_fecha_programada
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente: el % ya tiene % h programadas y el proceso pide % h (capacidad % h)', p_fecha_programada, round(v_horas_programadas, 2), round(p_horas_estimadas, 2), round(v_capacidad, 2) USING ERRCODE = 'check_violation';
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

CREATE OR REPLACE FUNCTION public.reprogramar_partida_recurso(
  p_programacion_id uuid,
  p_recurso_id uuid,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
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
  v_recurso_nuevo_activo boolean;
  v_capacidad numeric;
  v_horas_programadas numeric;
BEGIN
  IF p_programacion_id IS NULL
     OR p_recurso_id IS NULL
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999
     OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'reprogramacion_invalida' USING ERRCODE = 'check_violation';
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
  -- Una programación en preparación/ejecución ya tiene recurso y sesión
  -- comprometidos: moverla dejaría el histórico de capacidad inconsistente.
  --
  -- C23 (producción sin callejones): una operación en ejecución no se mueve de
  -- máquina, fecha, turno ni prioridad, pero sí puede corregir sus horas
  -- estimadas para reflejar el ruteo. C24 conserva esa regla al redefinir la
  -- función para sumar la carga por día.
  IF v_programacion.estado_planeacion = 'en_proceso' THEN
    IF p_recurso_id <> v_programacion.recurso_id
       OR p_fecha_programada <> v_programacion.fecha_programada
       OR p_turno <> v_programacion.turno
       OR p_orden_prioridad <> v_programacion.orden_prioridad THEN
      RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_programacion.estado_planeacion NOT IN ('programada', 'bloqueada') THEN
    RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
  END IF;
  -- Las reservas de días adicionales no se reprograman por sí solas: mover una
  -- continuación dejaría la fila principal y la reserva en desacuerdo.
  IF v_programacion.es_continuacion THEN
    RAISE EXCEPTION 'programacion_continuacion_no_operable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id IN (v_programacion.recurso_id, p_recurso_id)
  ORDER BY recurso.id
  FOR UPDATE;

  SELECT recurso.activo
  INTO v_recurso_nuevo_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_nuevo_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide reprogramar hacia
  -- un recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_operacion(v_programacion.partida_id, v_programacion.meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    p_recurso_id,
    p_fecha_programada,
    p_turno
  );
  IF v_capacidad <= 0 THEN
    RAISE EXCEPTION 'capacidad_no_disponible: el equipo no tiene capacidad configurada para el %', p_fecha_programada USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.fecha_programada = p_fecha_programada
    AND programacion.id <> p_programacion_id
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente: el % ya tiene % h programadas y el proceso pide % h (capacidad % h)', p_fecha_programada, round(v_horas_programadas, 2), round(p_horas_estimadas, 2), round(v_capacidad, 2) USING ERRCODE = 'check_violation';
  END IF;

  -- C22: el reparto multi-día anterior deja de ser válido al mover la fila
  -- principal. Se cancelan sus reservas para no mostrar dos fechas ni dos
  -- estados de la misma operación. En una corrección de horas en ejecución no
  -- se toca el reparto: la fecha no cambia (C23).
  IF v_programacion.estado_planeacion <> 'en_proceso'
     AND v_programacion.meta_proceso_id IS NOT NULL THEN
    UPDATE public.programacion_areas AS continuacion
    SET estado_planeacion = 'cancelada'
    WHERE continuacion.partida_id = v_programacion.partida_id
      AND continuacion.meta_proceso_id = v_programacion.meta_proceso_id
      AND continuacion.es_continuacion = true
      AND continuacion.estado_planeacion <> 'cancelada';
  END IF;

  RETURN QUERY
  UPDATE public.programacion_areas AS programacion
  SET
    recurso_id = p_recurso_id,
    fecha_programada = p_fecha_programada,
    turno = p_turno,
    horas_estimadas = p_horas_estimadas,
    orden_prioridad = p_orden_prioridad
  WHERE programacion.id = p_programacion_id
  RETURNING
    programacion.id,
    programacion.estado_planeacion,
    programacion.actualizado_en;
END;
$$;
-- -----------------------------------------------------------------------------
-- 7. Carga diaria para la matriz semanal: una fila por equipo y día.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_carga_capacidad_diaria(
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS TABLE (
  recurso_id uuid,
  area text,
  fecha_programada date,
  turno text,
  horas_capacidad numeric,
  horas_programadas numeric,
  horas_reales numeric,
  horas_exceso numeric,
  horas_disponibles numeric,
  porcentaje_ocupacion numeric,
  sobrecargado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio > p_fecha_fin THEN
    RAISE EXCEPTION 'rango_fechas_invalido' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  WITH fechas AS (
    SELECT serie::date AS fecha
    FROM generate_series(p_fecha_inicio, p_fecha_fin, interval '1 day') AS serie
  ),
  capacidad AS (
    SELECT
      recurso.id AS recurso_id,
      recurso.area,
      fechas.fecha AS fecha_programada,
      'jornada'::text AS turno,
      privado.obtener_capacidad_efectiva_recurso_turno(
        recurso.id, fechas.fecha, 'matutino'
      ) AS horas_capacidad
    FROM public.recursos_planeacion AS recurso
    CROSS JOIN fechas
    WHERE recurso.activo = true
  ),
  ejecucion AS (
    SELECT
      sesion.programacion_id,
      coalesce(sum(sesion.horas_netas), 0::numeric) AS horas_reales,
      coalesce(bool_or(sesion.recurso_liberado), false) AS recurso_liberado
    FROM public.sesiones_trabajo AS sesion
    GROUP BY sesion.programacion_id
  ),
  carga_programacion AS (
    SELECT
      programacion.recurso_id,
      programacion.fecha_programada,
      CASE
        WHEN programacion.estado_planeacion IN ('cancelada', 'completada') THEN 0::numeric
        WHEN programacion.estado_planeacion = 'bloqueada'
          AND coalesce(ejecucion.recurso_liberado, false) THEN 0::numeric
        ELSE greatest(
          programacion.horas_estimadas - coalesce(ejecucion.horas_reales, 0::numeric),
          0::numeric
        )
      END AS horas_programadas,
      coalesce(ejecucion.horas_reales, 0::numeric) AS horas_reales,
      greatest(
        coalesce(ejecucion.horas_reales, 0::numeric) - programacion.horas_estimadas,
        0::numeric
      ) AS horas_exceso
    FROM public.programacion_areas AS programacion
    LEFT JOIN ejecucion ON ejecucion.programacion_id = programacion.id
    WHERE programacion.fecha_programada BETWEEN p_fecha_inicio AND p_fecha_fin
  ),
  carga AS (
    SELECT
      carga_programacion.recurso_id,
      carga_programacion.fecha_programada,
      sum(carga_programacion.horas_programadas) AS horas_programadas,
      sum(carga_programacion.horas_reales) AS horas_reales,
      sum(carga_programacion.horas_exceso) AS horas_exceso
    FROM carga_programacion
    GROUP BY carga_programacion.recurso_id, carga_programacion.fecha_programada
  ),
  unida AS (
    SELECT
      capacidad.recurso_id,
      capacidad.area,
      capacidad.fecha_programada,
      capacidad.turno,
      capacidad.horas_capacidad,
      coalesce(carga.horas_programadas, 0::numeric) AS horas_programadas,
      coalesce(carga.horas_reales, 0::numeric) AS horas_reales,
      coalesce(carga.horas_exceso, 0::numeric) AS horas_exceso
    FROM capacidad
    LEFT JOIN carga
      ON carga.recurso_id = capacidad.recurso_id
      AND carga.fecha_programada = capacidad.fecha_programada
  )
  SELECT
    unida.recurso_id,
    unida.area,
    unida.fecha_programada,
    unida.turno,
    unida.horas_capacidad,
    unida.horas_programadas,
    unida.horas_reales,
    unida.horas_exceso,
    unida.horas_capacidad - unida.horas_programadas AS horas_disponibles,
    CASE
      WHEN unida.horas_programadas = 0 THEN 0::numeric
      WHEN unida.horas_capacidad = 0 THEN 100::numeric
      ELSE round((unida.horas_programadas / unida.horas_capacidad) * 100, 2)
    END AS porcentaje_ocupacion,
    unida.horas_programadas > unida.horas_capacidad AS sobrecargado
  FROM unida
  WHERE unida.horas_capacidad > 0 OR unida.horas_programadas > 0
  ORDER BY unida.fecha_programada, unida.area, unida.recurso_id;
END;
$$;

COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'C24: carga por equipo y día con la jornada continua; el turno es una etiqueta y no se suma aparte.';
