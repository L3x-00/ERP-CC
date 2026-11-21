-- Carga diaria: las horas reales se atribuyen al día en que se trabajaron.
--
-- ANTES: `ejecucion` sumaba TODAS las sesiones de una programación y `carga`
-- colocaba ese total en `programacion.fecha_programada`. Una sesión iniciada un
-- día y cerrada entrada la noche del siguiente (o una jornada que se cerró
-- después de medianoche) inflaba la columna de la programación con horas que no
-- correspondían a esa fecha. En producción, IT01 del 19-nov mostró 18.88 h: una
-- sola sesión de 15.91 h del día anterior se contó en el 19.
--
-- AHORA: una función pura recorta cada sesión al día de la zona del taller y
-- calcula sus horas netas con la misma regla de comida del motor. La reserva
-- pendiente y el exceso siguen asociados a la fecha de la programación; solo el
-- tiempo ya trabajado cambia de día. Sin cambios de firma, columnas ni permisos.

CREATE OR REPLACE FUNCTION privado.horas_sesion_en_fecha(
  p_inicio timestamptz,
  p_fin timestamptz,
  p_fecha date
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_fin <= (p_fecha::timestamp AT TIME ZONE 'America/Tijuana')
      OR p_inicio >= ((p_fecha + 1)::timestamp AT TIME ZONE 'America/Tijuana')
      THEN 0::numeric
    ELSE coalesce((
      SELECT calculo.horas_netas
      FROM privado.calcular_horas_sesion_trabajo(
        greatest(p_inicio, (p_fecha::timestamp AT TIME ZONE 'America/Tijuana')),
        least(p_fin, ((p_fecha + 1)::timestamp AT TIME ZONE 'America/Tijuana'))
      ) AS calculo
    ), 0::numeric)
  END;
$$;

REVOKE ALL ON FUNCTION privado.horas_sesion_en_fecha(timestamptz, timestamptz, date)
  FROM PUBLIC, anon, authenticated, service_role;

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
  sesiones_rango AS (
    SELECT
      sesion.id,
      sesion.programacion_id,
      sesion.fecha_inicio,
      coalesce(sesion.fecha_fin, now()) AS fecha_fin,
      sesion.horas_netas,
      sesion.recurso_liberado
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.fecha_inicio < (p_fecha_fin::timestamp AT TIME ZONE 'America/Tijuana') + interval '1 day'
      AND coalesce(sesion.fecha_fin, now()) > (p_fecha_inicio::timestamp AT TIME ZONE 'America/Tijuana')
  ),
  ejecucion AS (
    SELECT
      sesion.programacion_id,
      coalesce(sum(sesion.horas_netas), 0::numeric) AS horas_reales,
      coalesce(bool_or(sesion.recurso_liberado), false) AS recurso_liberado
    FROM sesiones_rango AS sesion
    GROUP BY sesion.programacion_id
  ),
  ejecucion_diaria AS (
    SELECT
      sesion.programacion_id,
      fechas.fecha AS fecha_programada,
      sum(privado.horas_sesion_en_fecha(
        sesion.fecha_inicio, sesion.fecha_fin, fechas.fecha
      )) AS horas_reales
    FROM sesiones_rango AS sesion
    CROSS JOIN fechas
    GROUP BY sesion.programacion_id, fechas.fecha
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
      sum(carga_programacion.horas_exceso) AS horas_exceso
    FROM carga_programacion
    GROUP BY carga_programacion.recurso_id, carga_programacion.fecha_programada
  ),
  reales AS (
    SELECT
      programacion.recurso_id,
      ejecucion_diaria.fecha_programada,
      sum(ejecucion_diaria.horas_reales) AS horas_reales
    FROM ejecucion_diaria
    JOIN public.programacion_areas AS programacion
      ON programacion.id = ejecucion_diaria.programacion_id
    WHERE ejecucion_diaria.horas_reales > 0
    GROUP BY programacion.recurso_id, ejecucion_diaria.fecha_programada
  ),
  unida AS (
    SELECT
      capacidad.recurso_id,
      capacidad.area,
      capacidad.fecha_programada,
      capacidad.turno,
      capacidad.horas_capacidad,
      coalesce(carga.horas_programadas, 0::numeric) AS horas_programadas,
      coalesce(reales.horas_reales, 0::numeric) AS horas_reales,
      coalesce(carga.horas_exceso, 0::numeric) AS horas_exceso
    FROM capacidad
    LEFT JOIN carga
      ON carga.recurso_id = capacidad.recurso_id
      AND carga.fecha_programada = capacidad.fecha_programada
    LEFT JOIN reales
      ON reales.recurso_id = capacidad.recurso_id
      AND reales.fecha_programada = capacidad.fecha_programada
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
  WHERE unida.horas_capacidad > 0
     OR unida.horas_programadas > 0
     OR unida.horas_reales > 0
  ORDER BY unida.fecha_programada, unida.area, unida.recurso_id;
END;
$$;

COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'C24 + #210: carga por equipo y día con jornada continua; las horas reales se atribuyen al día trabajado en America/Tijuana, no a la fecha de la programación. Solo service_role.';
