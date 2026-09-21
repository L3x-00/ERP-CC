-- =============================================================================
-- Migración: D-02 — capacidad instalada: equipos × jornada, con override.
-- ORCA MFG ERP — Planeación. La aplica el PO.
--
-- Decisión del cliente (2ª ronda): se separa la **jornada laboral** de la
-- **capacidad instalada**. La capacidad instalada es equipos × jornada: 3 CNC
-- router × 8 h = 24 h por jornada. El override por recurso permite una jornada
-- distinta a la estándar sin tocar la definición de turnos.
--
-- Regla efectiva por (recurso, fecha, turno):
--   cantidad_equipos × coalesce(excepción de fecha/turno,
--                               override de jornada,
--                               horas de la capacidad del turno,
--                               0)
--
--   * `recursos_planeacion.cantidad_equipos`: máquinas/estaciones del recurso.
--   * `recursos_planeacion.capacidad_jornada_override_horas`: horas de jornada
--     por equipo (NULL = usar la capacidad del turno, 8 h en el estándar).
--
-- La capacidad de PostgreSQL sigue siendo la única verdad para programar: el
-- helper privado lo usan `programar_partida_recurso`, `reprogramar_partida_recurso`
-- y la activación de preparación; `obtener_carga_capacidad_diaria` se alinea.
-- Aditiva e idempotente; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Equipos y override de jornada por recurso.
-- -----------------------------------------------------------------------------
ALTER TABLE public.recursos_planeacion
  ADD COLUMN IF NOT EXISTS cantidad_equipos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS capacidad_jornada_override_horas numeric(8, 2);

ALTER TABLE public.recursos_planeacion
  DROP CONSTRAINT IF EXISTS recursos_planeacion_cantidad_equipos_rango;
ALTER TABLE public.recursos_planeacion
  ADD CONSTRAINT recursos_planeacion_cantidad_equipos_rango CHECK (
    cantidad_equipos BETWEEN 1 AND 100
  );

ALTER TABLE public.recursos_planeacion
  DROP CONSTRAINT IF EXISTS recursos_planeacion_override_jornada_rango;
ALTER TABLE public.recursos_planeacion
  ADD CONSTRAINT recursos_planeacion_override_jornada_rango CHECK (
    capacidad_jornada_override_horas IS NULL
    OR (capacidad_jornada_override_horas >= 0.5 AND capacidad_jornada_override_horas <= 24)
  );

COMMENT ON COLUMN public.recursos_planeacion.cantidad_equipos IS
  'D-02: máquinas/estaciones del recurso; la capacidad instalada es equipos × jornada.';
COMMENT ON COLUMN public.recursos_planeacion.capacidad_jornada_override_horas IS
  'D-02: jornada (horas por equipo) distinta a la del turno; NULL = capacidad del turno.';

-- -----------------------------------------------------------------------------
-- 2. Capacidad efectiva: equipos × jornada (con excepción y override).
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
  SELECT round(
    coalesce(
      (
        SELECT recurso.cantidad_equipos
        FROM public.recursos_planeacion AS recurso
        WHERE recurso.id = p_recurso_id
      ),
      1
    )::numeric * coalesce(
      (
        SELECT excepcion.horas_capacidad
        FROM public.excepciones_capacidad_recurso AS excepcion
        WHERE excepcion.recurso_id = p_recurso_id
          AND excepcion.fecha = p_fecha
          AND excepcion.turno = p_turno
      ),
      (
        SELECT recurso.capacidad_jornada_override_horas
        FROM public.recursos_planeacion AS recurso
        WHERE recurso.id = p_recurso_id
      ),
      (
        SELECT capacidad.horas_capacidad
        FROM public.capacidades_recurso_turno AS capacidad
        WHERE capacidad.recurso_id = p_recurso_id
          AND capacidad.turno = p_turno
      ),
      0::numeric
    ),
    2
  );
$$;

REVOKE EXECUTE ON FUNCTION privado.obtener_capacidad_efectiva_recurso_turno(uuid, date, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Carga diaria: misma fórmula en la lectura del calendario.
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
      round(
        recurso.cantidad_equipos::numeric * coalesce(
          excepcion.horas_capacidad,
          recurso.capacidad_jornada_override_horas,
          capacidad_normal.horas_capacidad
        ),
        2
      ) AS horas_capacidad
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

COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'D-02: capacidad por recurso/fecha/turno = equipos × jornada (excepción > override > turno). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  TO service_role;
