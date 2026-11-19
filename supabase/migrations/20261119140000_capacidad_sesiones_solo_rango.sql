-- =============================================================================
-- Carga diaria: acotar las sesiones al rango consultado.
--
-- Antes, el CTE `ejecucion` agregaba TODA `sesiones_trabajo` (sin filtro de
-- fecha) y después se unía solo a las programaciones del rango. El resultado
-- era correcto, pero el costo crecía con el historial completo de la planta y
-- la vista Carga del operador lo ejecuta en cada carga de la terminal.
--
-- Ahora las sesiones se agregan por programación con un LATERAL: usa el índice
-- de `programacion_id` y solo toca las programaciones del rango pedido. La
-- salida es idéntica: suma de horas netas, `recurso_liberado` y el filtro final
-- que conserva las horas reales de un día sin jornada (#210).
--
-- Sin cambios de firma, columnas ni permisos: CREATE OR REPLACE mantiene el
-- GRANT de service_role.
-- =============================================================================

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
    LEFT JOIN LATERAL (
      SELECT
        coalesce(sum(sesion.horas_netas), 0::numeric) AS horas_reales,
        coalesce(bool_or(sesion.recurso_liberado), false) AS recurso_liberado
      FROM public.sesiones_trabajo AS sesion
      WHERE sesion.programacion_id = programacion.id
    ) AS ejecucion ON true
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
  -- La fila con trabajo real se conserva aunque el día no aporte capacidad.
  WHERE unida.horas_capacidad > 0
     OR unida.horas_programadas > 0
     OR unida.horas_reales > 0
  ORDER BY unida.fecha_programada, unida.area, unida.recurso_id;
END;
$$;

COMMENT ON FUNCTION public.obtener_carga_capacidad_diaria(date, date) IS
  'C24 + #210 + optimización: carga por equipo y día con jornada continua; agrega solo las sesiones de las programaciones del rango y conserva las horas reales en fechas sin jornada. Solo service_role.';
