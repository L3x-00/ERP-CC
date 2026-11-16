-- =============================================================================
-- C18 — Horario laboral de la empresa
-- Regla confirmada por el PO (2026-11-16):
--   Lunes a viernes 08:00–17:00 (9 h), sábado 08:00–12:00 (4 h), domingo cerrado.
--   Turnos: matutino 08:00–13:00 (5 h), vespertino 13:00–17:00 (4 h),
--   nocturno sin capacidad. El sábado solo trabaja el matutino (4 h).
--
-- La jornada de horas extra es la del DÍA (9 h / 4 h), no la del bloque de
-- turno: una sesión continua puede ocupar toda la jornada.
-- Aplicar solo en local; el remoto lo aplica el PO.
-- =============================================================================

-- 1. Horas de la jornada completa para una fecha.
CREATE OR REPLACE FUNCTION privado.jornada_laboral_dia(p_fecha date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE extract(isodow FROM p_fecha)
    WHEN 7 THEN 0::numeric   -- domingo
    WHEN 6 THEN 4::numeric   -- sábado
    ELSE 9::numeric          -- lunes a viernes
  END;
$$;

COMMENT ON FUNCTION privado.jornada_laboral_dia(date) IS
  'C18: horas efectivas de la jornada (L-V 9 h, sábado 4 h, domingo 0).';

-- 2. Horas que el horario permite en un turno concreto.
CREATE OR REPLACE FUNCTION privado.horas_turno_horario_laboral(p_fecha date, p_turno text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN extract(isodow FROM p_fecha) = 7 THEN 0::numeric
    WHEN upper(coalesce(p_turno, '')) = 'NOCTURNO' THEN 0::numeric
    WHEN extract(isodow FROM p_fecha) = 6 THEN
      CASE WHEN upper(p_turno) = 'MATUTINO' THEN 4::numeric ELSE 0::numeric END
    WHEN upper(p_turno) = 'MATUTINO' THEN 5::numeric
    WHEN upper(p_turno) = 'VESPERTINO' THEN 4::numeric
    ELSE 0::numeric
  END;
$$;

COMMENT ON FUNCTION privado.horas_turno_horario_laboral(date, text) IS
  'C18: tope del turno según el día (matutino 5 h, vespertino 4 h, sábado matutino 4 h, domingo 0).';

-- 3. Horas de capacidad de un turno. La jornada del día se reparte entre los
--    turnos en orden (matutino → vespertino), tomando como tope lo configurado
--    por turno y sin que la suma pase las horas del día. Así un recurso con
--    8 h de matutino conserva su capacidad histórica (≤ 9 h) y el reparto
--    5 + 4 de un recurso nuevo suma exactamente la jornada. El nocturno queda
--    sin capacidad porque la empresa cierra a las 17:00.
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
  WITH objetivo AS (
    SELECT LEAST(
      privado.jornada_laboral_dia(p_fecha),
      coalesce(
        (SELECT recurso.capacidad_jornada_override_horas
         FROM public.recursos_planeacion AS recurso
         WHERE recurso.id = p_recurso_id),
        privado.jornada_laboral_dia(p_fecha)
      )
    ) AS horas
  ),
  configurado AS (
    SELECT
      turno.orden,
      turno.turno,
      coalesce(
        (SELECT excepcion.horas_capacidad
         FROM public.excepciones_capacidad_recurso AS excepcion
         WHERE excepcion.recurso_id = p_recurso_id
           AND excepcion.fecha = p_fecha
           AND excepcion.turno = turno.turno),
        (SELECT capacidad.horas_capacidad
         FROM public.capacidades_recurso_turno AS capacidad
         WHERE capacidad.recurso_id = p_recurso_id
           AND capacidad.turno = turno.turno),
        0::numeric
      ) AS horas
    FROM (VALUES (1, 'matutino'), (2, 'vespertino'), (3, 'nocturno'))
      AS turno(orden, turno)
  ),
  repartido AS (
    SELECT
      configurado.turno,
      CASE
        WHEN configurado.turno = 'nocturno' THEN 0::numeric
        ELSE greatest(
          0::numeric,
          least(
            configurado.horas,
            objetivo.horas - coalesce(
              sum(configurado.horas) OVER (
                ORDER BY configurado.orden
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0::numeric
            )
          )
        )
      END AS horas
    FROM configurado
    CROSS JOIN objetivo
  )
  SELECT round(
    coalesce(
      (SELECT repartido.horas FROM repartido
       WHERE repartido.turno = lower(coalesce(p_turno, ''))),
      0::numeric
    ),
    2
  );
$$;

COMMENT ON FUNCTION privado.horas_turno_recurso(uuid, date, text) IS
  'C18: reparte la jornada del día entre los turnos (matutino → vespertino, nocturno 0) respetando lo configurado por turno.';

-- 3b. Capacidad efectiva: equipos × horas del turno.
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

-- 4. Jornada para horas extra / auto-pausa: el día completo, con el override
--    por recurso como tope opcional (nunca por encima del horario).
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
  SELECT round(
    LEAST(
      coalesce(
        (SELECT excepcion.horas_capacidad
         FROM public.excepciones_capacidad_recurso AS excepcion
         WHERE excepcion.recurso_id = p_recurso_id
           AND excepcion.fecha = p_fecha
           AND excepcion.turno = p_turno),
        (SELECT recurso.capacidad_jornada_override_horas
         FROM public.recursos_planeacion AS recurso
         WHERE recurso.id = p_recurso_id),
        privado.jornada_laboral_dia(p_fecha)
      ),
      privado.jornada_laboral_dia(p_fecha)
    ),
    2
  );
$$;

COMMENT ON FUNCTION privado.obtener_jornada_recurso_turno(uuid, date, text) IS
  'C18: jornada del día (L-V 9 h, sábado 4 h) con override del recurso como tope.';

-- 5. Datos: se conserva la capacidad configurada (acotada a la jornada del día)
--    para no dejar inoperables las programaciones históricas de 8 h; la app
--    registra los turnos base 5 + 4 cuando un recurso no tiene ninguno.
UPDATE public.capacidades_recurso_turno
SET horas_capacidad = LEAST(horas_capacidad, 9), actualizado_en = now()
WHERE horas_capacidad > 9;

-- El turno nocturno no tiene capacidad con el horario actual (la empresa cierra
-- a las 17:00). La tabla exige horas > 0, así que se elimina su configuración.
DELETE FROM public.capacidades_recurso_turno WHERE turno = 'nocturno';

UPDATE public.recursos_planeacion
SET capacidad_jornada_override_horas = 9, actualizado_en = now()
WHERE capacidad_jornada_override_horas = 8;

-- 6. Un reclamo puede ocupar hasta la jornada completa (9 h L-V; el sábado
--    la función lo limita a 4 h).
ALTER TABLE public.reclamos_proceso_operador
  DROP CONSTRAINT IF EXISTS reclamos_proceso_operador_horas_check;
ALTER TABLE public.reclamos_proceso_operador
  ADD CONSTRAINT reclamos_proceso_operador_horas_check
  CHECK (horas_estimadas > 0 AND horas_estimadas <= 9);

-- 7. Reclamo y movimiento del operador con la jornada del día.
CREATE OR REPLACE FUNCTION public.reclamar_proceso_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_meta_proceso_id uuid,
  p_operador_id uuid,
  p_fecha date,
  p_turno text DEFAULT 'matutino'
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  meta_proceso_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha date,
  turno text,
  horas_estimadas numeric,
  estado text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_estado_orden text;
  v_horas numeric;
  v_ocupadas numeric;
  v_meta_piezas numeric;
  v_hecho numeric;
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_operador_id IS NULL
     OR p_fecha IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno') THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida → orden.
  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_estado_orden IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_reclamable' USING ERRCODE = 'check_violation';
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

  IF p_meta_proceso_id IS NOT NULL THEN
    SELECT meta.meta_piezas
    INTO v_meta_piezas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = p_meta_proceso_id
      AND meta.partida_id = p_partida_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(avance.cantidad_producida), 0)
    INTO v_hecho
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = p_meta_proceso_id;

    IF v_hecho >= v_meta_piezas THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_horas := privado.horas_estimadas_proceso(p_partida_id, p_meta_proceso_id);

  IF v_horas > privado.jornada_laboral_dia(p_fecha) THEN
    RAISE EXCEPTION 'proceso_excede_jornada' USING ERRCODE = 'check_violation';
  END IF;

  -- La partida admite un solo operador responsable; el reclamo lo asigna si
  -- estaba libre y rechaza si ya pertenece a otro operador.
  IF v_partida.operador_asignado_id IS NULL THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET operador_asignado_id = p_operador_id
    WHERE partida.id = p_partida_id;
  ELSIF v_partida.operador_asignado_id <> p_operador_id THEN
    RAISE EXCEPTION 'partida_asignada_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  -- Serializa la jornada del operador para no rebasar la jornada del día con
  -- reclamos simultáneos desde dos terminales.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_operador_id::text || ':' || p_fecha::text, 0)
  );

  SELECT coalesce(sum(reclamo.horas_estimadas), 0)
  INTO v_ocupadas
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.operador_id = p_operador_id
    AND reclamo.fecha = p_fecha
    AND reclamo.estado = 'activo';

  IF v_ocupadas + v_horas > privado.jornada_laboral_dia(p_fecha) THEN
    RAISE EXCEPTION 'capacidad_diaria_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.reclamos_proceso_operador (
    orden_id, partida_id, meta_proceso_id, operador_id, fecha, turno,
    horas_estimadas, estado
  ) VALUES (
    p_orden_id, p_partida_id, p_meta_proceso_id, p_operador_id, p_fecha, p_turno,
    v_horas, 'activo'
  )
  RETURNING * INTO v_reclamo;

  RETURN QUERY
  SELECT reclamo.id, reclamo.orden_id, reclamo.partida_id, reclamo.meta_proceso_id,
    reclamo.programacion_id, reclamo.operador_id, reclamo.fecha, reclamo.turno,
    reclamo.horas_estimadas, reclamo.estado, reclamo.creado_en, reclamo.actualizado_en
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = v_reclamo.id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'proceso_ya_reclamado' USING ERRCODE = 'unique_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.mover_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid,
  p_fecha date,
  p_turno text DEFAULT 'matutino'
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  meta_proceso_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha date,
  turno text,
  horas_estimadas numeric,
  estado text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_estado_orden text;
  v_ocupadas numeric;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL OR p_fecha IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno') THEN
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
  IF v_reclamo.programacion_id IS NOT NULL THEN
    RAISE EXCEPTION 'reclamo_ya_preparado' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo orden de locks que el resto del motor.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_estado_orden IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_reclamable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_operador_id::text || ':' || p_fecha::text, 0)
  );

  SELECT coalesce(sum(reclamo.horas_estimadas), 0)
  INTO v_ocupadas
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.operador_id = p_operador_id
    AND reclamo.fecha = p_fecha
    AND reclamo.estado = 'activo'
    AND reclamo.id <> p_reclamo_id;

  IF v_ocupadas + v_reclamo.horas_estimadas > privado.jornada_laboral_dia(p_fecha) THEN
    RAISE EXCEPTION 'capacidad_diaria_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET fecha = p_fecha,
      turno = p_turno,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN QUERY
  SELECT reclamo.id, reclamo.orden_id, reclamo.partida_id, reclamo.meta_proceso_id,
    reclamo.programacion_id, reclamo.operador_id, reclamo.fecha, reclamo.turno,
    reclamo.horas_estimadas, reclamo.estado, reclamo.creado_en, reclamo.actualizado_en
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id;
END;
$$;

-- 8. Respaldo de recurso acotado al mismo grupo de equipo.
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
        AND programacion.turno = v_reclamo.turno
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
        AND programacion.turno = v_reclamo.turno
        AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
        AND programacion.id IS DISTINCT FROM v_programacion_id;

      IF v_horas_programadas + v_reclamo.horas_estimadas > v_capacidad THEN
        CONTINUE;
      END IF;

      v_recurso_id := v_recurso.id;
      EXIT;
    END LOOP;

    IF v_recurso_id IS NULL THEN
      RAISE EXCEPTION 'sin_recurso_disponible' USING ERRCODE = 'check_violation';
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
    RAISE EXCEPTION 'recurso_ocupado' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text) IS
  'C10/C18: reserva una operación para el día del operador y valida la jornada del horario (9 h L-V, 4 h sábado). Solo service_role.';
COMMENT ON FUNCTION public.mover_reclamo_operador(uuid, uuid, date, text) IS
  'C10/C18: mueve un reclamo activo a otro día validando la jornada del horario. Solo service_role.';

-- 9. Calendario y disponibilidad: la carga diaria usa la capacidad del horario
--    y deja de ofrecer turnos cerrados (domingo, nocturno y sábado vespertino)
--    salvo que ya tengan trabajo programado.
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
      capacidad_normal.turno,
      privado.obtener_capacidad_efectiva_recurso_turno(
        recurso.id, fechas.fecha, capacidad_normal.turno
      ) AS horas_capacidad
    FROM public.recursos_planeacion AS recurso
    JOIN public.capacidades_recurso_turno AS capacidad_normal
      ON capacidad_normal.recurso_id = recurso.id
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
      programacion.turno,
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
      carga_programacion.turno,
      sum(carga_programacion.horas_programadas) AS horas_programadas,
      sum(carga_programacion.horas_reales) AS horas_reales,
      sum(carga_programacion.horas_exceso) AS horas_exceso
    FROM carga_programacion
    GROUP BY
      carga_programacion.recurso_id,
      carga_programacion.fecha_programada,
      carga_programacion.turno
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
      AND carga.turno = capacidad.turno
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
  -- Los turnos cerrados por el horario no se ofrecen; si ya tenían trabajo
  -- programado, se conserva la fila para mostrarlo y poder reubicarlo.
  WHERE unida.horas_capacidad > 0 OR unida.horas_programadas > 0
  ORDER BY unida.fecha_programada, unida.area, unida.recurso_id, unida.turno;
END;
$$;

COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'C9.3/C18: capacidad restante por recurso/fecha/turno con el horario laboral (L-V 9 h, sábado 4 h, domingo cerrado); respeta ejecución real y liberación formal. Solo service_role.';
