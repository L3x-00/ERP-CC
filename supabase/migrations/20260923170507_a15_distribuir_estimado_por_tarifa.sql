-- A15: reparte las horas programadas entre tarifas históricas de la misma
-- estación según horas reales. La última tarifa absorbe el redondeo, de modo
-- que la suma siempre coincide con la programación sin tocar costos reales.
CREATE OR REPLACE FUNCTION public.obtener_desglose_rentabilidad_orden(p_orden_id uuid)
RETURNS TABLE (
  rubro text,
  concepto text,
  referencia text,
  horas_estimadas numeric,
  horas_reales numeric,
  tarifa_hora numeric,
  importe numeric,
  nota text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_orden_id IS NULL THEN
    RAISE EXCEPTION 'orden_id_requerido' USING ERRCODE = 'null_value_not_allowed';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  WITH estimadas AS (
    SELECT programacion.recurso_id, SUM(programacion.horas_estimadas) AS horas
    FROM public.programacion_areas AS programacion
    INNER JOIN public.partidas_orden_produccion AS partida
      ON partida.id = programacion.partida_id
    WHERE partida.orden_id = p_orden_id
      AND programacion.estado_planeacion <> 'cancelada'
    GROUP BY programacion.recurso_id
  ), mano_obra_por_tarifa AS (
    SELECT
      recurso.id AS recurso_id,
      recurso.codigo,
      recurso.nombre,
      sesion.costo_hora_interno AS tarifa,
      COALESCE(estimadas.horas, 0) AS horas_programadas,
      SUM(sesion.horas_netas) AS horas_reales,
      round(SUM(sesion.horas_netas * sesion.costo_hora_interno), 4) AS costo
    FROM public.sesiones_trabajo AS sesion
    INNER JOIN public.programacion_areas AS programacion
      ON programacion.id = sesion.programacion_id
    INNER JOIN public.recursos_planeacion AS recurso
      ON recurso.id = programacion.recurso_id
    LEFT JOIN estimadas ON estimadas.recurso_id = recurso.id
    WHERE sesion.orden_id = p_orden_id
      AND sesion.estado_sesion IN ('pausada', 'finalizada')
    GROUP BY recurso.id, recurso.codigo, recurso.nombre,
      sesion.costo_hora_interno, estimadas.horas
  ), cuotas AS (
    SELECT
      mano_obra_por_tarifa.*,
      row_number() OVER (PARTITION BY recurso_id ORDER BY tarifa) AS numero_tarifa,
      count(*) OVER (PARTITION BY recurso_id) AS cantidad_tarifas,
      round(
        CASE
          WHEN sum(mano_obra_por_tarifa.horas_reales) OVER (PARTITION BY recurso_id) > 0
          THEN horas_programadas * mano_obra_por_tarifa.horas_reales
            / sum(mano_obra_por_tarifa.horas_reales) OVER (PARTITION BY recurso_id)
          ELSE 0
        END,
        2
      ) AS cuota_estimada
    FROM mano_obra_por_tarifa
  )
  -- Mano de obra por estación y tarifa histórica.
  SELECT
    'mano_obra'::text,
    cuotas.codigo || ' · ' || cuotas.nombre,
    cuotas.codigo,
    CASE WHEN numero_tarifa = cantidad_tarifas
      THEN horas_programadas - (sum(cuota_estimada) OVER (PARTITION BY recurso_id) - cuota_estimada)
      ELSE cuota_estimada
    END::numeric,
    cuotas.horas_reales::numeric,
    tarifa,
    costo,
    NULL::text
  FROM cuotas

  UNION ALL

  -- Material realmente consumido por material de inventario.
  SELECT
    'material'::text,
    COALESCE(material.nombre, 'Material sin catálogo'),
    material.codigo,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    round(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
      * consumo.costo_unitario_momento), 4),
    NULL::text
  FROM public.registros_consumo_material AS consumo
  INNER JOIN public.partidas_orden_produccion AS partida
    ON partida.id = consumo.partida_id
  LEFT JOIN public.materiales AS material
    ON material.id = consumo.material_id
  WHERE partida.orden_id = p_orden_id
  GROUP BY material.nombre, material.codigo

  UNION ALL

  -- Gastos directos por categoría (sí suman al costo).
  SELECT
    'gasto'::text,
    gasto.categoria,
    NULL::text,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    round(SUM(gasto.monto_total
      * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 4),
    NULL::text
  FROM public.gastos AS gasto
  WHERE gasto.orden_id = p_orden_id
    AND gasto.estado_pago <> 'cancelado'
    AND gasto.categoria NOT IN ('materia_prima', 'nomina')
  GROUP BY gasto.categoria

  UNION ALL

  -- Gastos ya representados en material/mano de obra: se muestran, no suman.
  SELECT
    'gasto_incluido'::text,
    gasto.categoria,
    NULL::text,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    round(SUM(gasto.monto_total
      * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 4),
    'Ya incluido en material o mano de obra; no suma al costo'::text
  FROM public.gastos AS gasto
  WHERE gasto.orden_id = p_orden_id
    AND gasto.estado_pago <> 'cancelado'
    AND gasto.categoria IN ('materia_prima', 'nomina')
  GROUP BY gasto.categoria

  ORDER BY 1, 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid) TO service_role;
