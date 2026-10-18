-- C9.3 / P-03 B — capacidad restante según ejecución real.
-- Conserva `horas_estimadas` como dato histórico, expone horas reales/exceso y
-- solo libera una programación bloqueada cuando Producción lo registra formalmente.

DROP FUNCTION IF EXISTS public.obtener_carga_capacidad_diaria(date, date);

CREATE FUNCTION public.obtener_carga_capacidad_diaria(
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
  )
  SELECT
    capacidad.recurso_id,
    capacidad.area,
    capacidad.fecha_programada,
    capacidad.turno,
    capacidad.horas_capacidad,
    coalesce(carga.horas_programadas, 0::numeric) AS horas_programadas,
    coalesce(carga.horas_reales, 0::numeric) AS horas_reales,
    coalesce(carga.horas_exceso, 0::numeric) AS horas_exceso,
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
  'C9.3: capacidad restante por recurso/fecha/turno según estimado menos horas reales; expone exceso y respeta liberación formal. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_carga_capacidad_diaria(date, date)
  TO service_role;
