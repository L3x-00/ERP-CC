-- =============================================================================
-- Fase 6.2: motor transaccional de capacidad, reprogramación y preparación.
--
-- Regla de concurrencia: todas las mutaciones bloquean los recursos en orden
-- determinista. La capacidad se comprueba dentro de la misma transacción; la UI
-- nunca autoriza una programación a partir de cálculos previos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Excepciones de capacidad: mantenimiento, feriados y turnos extraordinarios.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.excepciones_capacidad_recurso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurso_id uuid NOT NULL REFERENCES public.recursos_planeacion (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('matutino', 'vespertino', 'nocturno')),
  horas_capacidad numeric(8, 2) NOT NULL CHECK (horas_capacidad >= 0 AND horas_capacidad <= 24),
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) >= 3),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT excepciones_capacidad_recurso_fecha_turno_unica UNIQUE (recurso_id, fecha, turno)
);

COMMENT ON TABLE public.excepciones_capacidad_recurso IS
  'Sobrescribe temporalmente la capacidad de un recurso por fecha y turno; cero representa indisponibilidad.';

DROP TRIGGER IF EXISTS trigger_excepciones_capacidad_recurso_actualizado_en
  ON public.excepciones_capacidad_recurso;
CREATE TRIGGER trigger_excepciones_capacidad_recurso_actualizado_en
  BEFORE UPDATE ON public.excepciones_capacidad_recurso
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

REVOKE ALL PRIVILEGES ON TABLE public.excepciones_capacidad_recurso
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.excepciones_capacidad_recurso TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.excepciones_capacidad_recurso TO service_role;

ALTER TABLE public.excepciones_capacidad_recurso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS excepciones_capacidad_recurso_seleccionar
  ON public.excepciones_capacidad_recurso;
CREATE POLICY excepciones_capacidad_recurso_seleccionar
  ON public.excepciones_capacidad_recurso FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_planeacion'))
    OR (SELECT privado.usuario_tiene_permiso('gestionar_planeacion'))
  );

-- Las excepciones forman parte del calendario y deben actualizar la vista sin refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'excepciones_capacidad_recurso'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.excepciones_capacidad_recurso;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Helper privado. No es un endpoint público; la capacidad efectiva primero
--    considera la excepción y después la capacidad normal del recurso/turno.
-- -----------------------------------------------------------------------------
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
  SELECT coalesce(
    (
      SELECT excepcion.horas_capacidad
      FROM public.excepciones_capacidad_recurso AS excepcion
      WHERE excepcion.recurso_id = p_recurso_id
        AND excepcion.fecha = p_fecha
        AND excepcion.turno = p_turno
    ),
    (
      SELECT capacidad.horas_capacidad
      FROM public.capacidades_recurso_turno AS capacidad
      WHERE capacidad.recurso_id = p_recurso_id
        AND capacidad.turno = p_turno
    ),
    0::numeric
  );
$$;

REVOKE EXECUTE ON FUNCTION privado.obtener_capacidad_efectiva_recurso_turno(uuid, date, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Carga por recurso, fecha y turno. Es lectura server-side: el cliente recibe
--    datos filtrados por acciones posteriores, nunca una función SQL pública.
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
      coalesce(excepcion.horas_capacidad, capacidad_normal.horas_capacidad) AS horas_capacidad
    FROM public.recursos_planeacion AS recurso
    JOIN public.capacidades_recurso_turno AS capacidad_normal
      ON capacidad_normal.recurso_id = recurso.id
    CROSS JOIN fechas
    LEFT JOIN public.excepciones_capacidad_recurso AS excepcion
      ON excepcion.recurso_id = recurso.id
      AND excepcion.fecha = fechas.fecha
      AND excepcion.turno = capacidad_normal.turno
    WHERE recurso.activo = true
  ),
  carga AS (
    SELECT
      programacion.recurso_id,
      programacion.fecha_programada,
      programacion.turno,
      coalesce(sum(programacion.horas_estimadas), 0::numeric) AS horas_programadas
    FROM public.programacion_areas AS programacion
    WHERE programacion.fecha_programada BETWEEN p_fecha_inicio AND p_fecha_fin
      AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
    GROUP BY programacion.recurso_id, programacion.fecha_programada, programacion.turno
  )
  SELECT
    capacidad.recurso_id,
    capacidad.area,
    capacidad.fecha_programada,
    capacidad.turno,
    capacidad.horas_capacidad,
    coalesce(carga.horas_programadas, 0::numeric) AS horas_programadas,
    capacidad.horas_capacidad - coalesce(carga.horas_programadas, 0::numeric) AS horas_disponibles,
    CASE
      WHEN coalesce(carga.horas_programadas, 0::numeric) = 0 THEN 0::numeric
      WHEN capacidad.horas_capacidad = 0 THEN 100::numeric
      ELSE round((coalesce(carga.horas_programadas, 0::numeric) / capacidad.horas_capacidad) * 100, 2)
    END AS porcentaje_ocupacion,
    coalesce(carga.horas_programadas, 0::numeric) > capacidad.horas_capacidad AS sobrecargado
  FROM capacidad
  LEFT JOIN carga
    ON carga.recurso_id = capacidad.recurso_id
    AND carga.fecha_programada = capacidad.fecha_programada
    AND carga.turno = capacidad.turno
  ORDER BY capacidad.fecha_programada, capacidad.area, capacidad.recurso_id, capacidad.turno;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Programación inicial. El lock de recurso serializa la comprobación de
--    capacidad frente a inserciones, reprogramaciones y activaciones concurrentes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.programar_partida_recurso(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer DEFAULT 1
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
BEGIN
  IF p_orden_id IS NULL
     OR p_partida_id IS NULL
     OR p_recurso_id IS NULL
     OR p_secuencia IS NULL
     OR p_secuencia <= 0
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
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

  SELECT partida.orden_id
  INTO v_orden_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden_partida_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
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
    estado_planeacion
  ) VALUES (
    p_orden_id,
    p_partida_id,
    p_recurso_id,
    p_secuencia,
    p_fecha_programada,
    p_turno,
    p_horas_estimadas,
    p_orden_prioridad,
    'programada'
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

-- -----------------------------------------------------------------------------
-- 5. Reprogramación con compare-and-set. Dos recursos se bloquean por UUID para
--    no introducir ciclos de espera cuando se intercambian programaciones.
-- -----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_programacion.estado_planeacion IN ('cancelada', 'completada') THEN
    RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
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
    AND programacion.id <> p_programacion_id
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
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
-- 6. Toma de preparación. No recibe actor del navegador ni divulga la identidad
--    de la programación conflictiva. El índice parcial de 6.1 conserva una
--    segunda barrera atómica si una ruta no prevista llegara a competir.
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
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'serialization_failure';
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

COMMENT ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer) IS
  'Programa bajo lock de recurso y capacidad efectiva. Solo service_role.';
COMMENT ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz) IS
  'Reprograma con compare-and-set y locks ordenados de recursos. Solo service_role.';
COMMENT ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz) IS
  'Activa preparación bajo lock de recurso sin exponer la programación conflictiva. Solo service_role.';
COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'Resume capacidad efectiva y carga por recurso, fecha y turno. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.activar_modo_preparacion(uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  TO service_role;
