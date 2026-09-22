-- Bloque 4 · OBS-29 (desglose de rentabilidad con anti-duplicado) y costo de
-- trabajos internos (TI) agregado por periodo para el dashboard.
--
-- 1) `obtener_rentabilidad_orden` gana la regla anti-duplicado: los gastos con
--    categoría `materia_prima` o `nomina` ya están representados por el consumo
--    real y por las sesiones con tarifa histórica, así que dejan de sumarse al
--    costo directo. Se contabilizan en la columna nueva
--    `gastos_incluidos_en_rubros` para que la UI pueda explicarlos.
--
-- 2) `obtener_desglose_rentabilidad_orden` devuelve el detalle por estación
--    (horas estimadas vs reales y tarifa histórica), por material consumido y
--    por categoría de gasto, marcando los gastos que no suman.
--
-- 3) `obtener_costo_ti_periodo` agrega materiales, mano de obra y gastos de las
--    órdenes internas en el periodo (y su comparativa anterior), para la tarjeta
--    del dashboard. Usa la misma regla anti-duplicado.
--
-- Aditiva e idempotente. La aplica el PO en remoto.

-- -----------------------------------------------------------------------------
-- 1. Rentabilidad de la orden con anti-duplicado de material/mano de obra.
--    Base: 20260919000005 (D-04).
-- -----------------------------------------------------------------------------
-- La firma suma `gastos_incluidos_en_rubros`: `CREATE OR REPLACE` no puede
-- cambiar el tipo de retorno, así que se recrea y se re-otorgan permisos.
DROP FUNCTION IF EXISTS public.obtener_rentabilidad_orden(uuid);

CREATE FUNCTION public.obtener_rentabilidad_orden(p_orden_id uuid)
RETURNS TABLE (
  orden_id uuid,
  monto_venta_mxn numeric,
  costo_materiales_mxn numeric,
  costo_mano_obra_mxn numeric,
  costo_gastos_directos_mxn numeric,
  costo_total_mxn numeric,
  utilidad_bruta_mxn numeric,
  margen_porcentaje numeric,
  margen_calculable boolean,
  materiales_considerados integer,
  sesiones_consideradas integer,
  sesiones_sin_tarifa integer,
  gastos_considerados integer,
  gastos_excluidos integer,
  gastos_incluidos_en_rubros integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_venta numeric(18, 4);
  v_materiales numeric(18, 4);
  v_mano_obra numeric(18, 4);
  v_gastos numeric(18, 4);
  v_costo_total numeric(18, 4);
  v_utilidad numeric(18, 4);
  v_materiales_count integer;
  v_sesiones_count integer;
  v_sesiones_sin_tarifa_count integer;
  v_gastos_count integer;
  v_gastos_excluidos_count integer;
  v_gastos_incluidos_count integer;
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

  -- D-04: solo la cuenta cobrable (entregada) reconoce ingreso; una AR creada
  -- al aprobar y aún no cobrable no es venta.
  SELECT COALESCE(SUM(
    CASE
      WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
      ELSE cuenta.monto_total * cuenta.tipo_cambio_origen
    END
  ), 0)
  INTO v_venta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.cobrable_desde IS NOT NULL;

  SELECT
    COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
      * consumo.costo_unitario_momento), 0),
    COUNT(*)::integer
  INTO v_materiales, v_materiales_count
  FROM public.registros_consumo_material AS consumo
  INNER JOIN public.partidas_orden_produccion AS partida
    ON partida.id = consumo.partida_id
  WHERE partida.orden_id = p_orden_id;

  SELECT
    COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE sesion.costo_hora_interno = 0)::integer
  INTO v_mano_obra, v_sesiones_count, v_sesiones_sin_tarifa_count
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion IN ('pausada', 'finalizada');

  -- OBS-29: `materia_prima` y `nomina` ya viven en los rubros de material y
  -- mano de obra; sumarlos otra vez duplicaría el costo.
  SELECT
    COALESCE(SUM(
      gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
    ) FILTER (
      WHERE gasto.estado_pago <> 'cancelado'
        AND gasto.categoria NOT IN ('materia_prima', 'nomina')
    ), 0),
    COUNT(*) FILTER (
      WHERE gasto.estado_pago <> 'cancelado'
        AND gasto.categoria NOT IN ('materia_prima', 'nomina')
    )::integer,
    COUNT(*) FILTER (WHERE gasto.estado_pago = 'cancelado')::integer,
    COUNT(*) FILTER (
      WHERE gasto.estado_pago <> 'cancelado'
        AND gasto.categoria IN ('materia_prima', 'nomina')
    )::integer
  INTO v_gastos, v_gastos_count, v_gastos_excluidos_count, v_gastos_incluidos_count
  FROM public.gastos AS gasto
  WHERE gasto.orden_id = p_orden_id;

  v_costo_total := round(v_materiales + v_mano_obra + v_gastos, 4);
  v_utilidad := round(v_venta - v_costo_total, 4);

  RETURN QUERY
  SELECT
    p_orden_id,
    round(v_venta, 4),
    round(v_materiales, 4),
    round(v_mano_obra, 4),
    round(v_gastos, 4),
    v_costo_total,
    v_utilidad,
    CASE WHEN v_venta > 0 THEN round(v_utilidad / v_venta * 100, 4) ELSE NULL END,
    v_venta > 0,
    v_materiales_count,
    v_sesiones_count,
    v_sesiones_sin_tarifa_count,
    v_gastos_count,
    v_gastos_excluidos_count,
    v_gastos_incluidos_count;
END;
$$;

COMMENT ON FUNCTION public.obtener_rentabilidad_orden(uuid) IS
  'Rentabilidad en MXN; ingreso solo de AR cobrables (D-04). OBS-29: los gastos de categoría materia_prima/nomina no se suman al costo directo (ya están en material/mano de obra) y se cuentan en gastos_incluidos_en_rubros.';

REVOKE EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Desglose por estación/rubro de la rentabilidad de una orden.
-- -----------------------------------------------------------------------------
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
  )
  -- Mano de obra por estación y tarifa histórica.
  SELECT
    'mano_obra'::text,
    recurso.codigo || ' · ' || recurso.nombre,
    recurso.codigo,
    COALESCE(estimadas.horas, 0)::numeric,
    SUM(sesion.horas_netas)::numeric,
    sesion.costo_hora_interno,
    round(SUM(sesion.horas_netas * sesion.costo_hora_interno), 4),
    NULL::text
  FROM public.sesiones_trabajo AS sesion
  INNER JOIN public.programacion_areas AS programacion
    ON programacion.id = sesion.programacion_id
  INNER JOIN public.recursos_planeacion AS recurso
    ON recurso.id = programacion.recurso_id
  LEFT JOIN estimadas ON estimadas.recurso_id = recurso.id
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion IN ('pausada', 'finalizada')
  GROUP BY recurso.codigo, recurso.nombre, sesion.costo_hora_interno, estimadas.horas

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

COMMENT ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid) IS
  'OBS-29: desglose por estación (horas estimadas/reales y tarifa histórica), material consumido y categorías de gasto, marcando los gastos que no suman por anti-duplicado. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Costo de producción de órdenes internas (TI) por periodo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.costo_ti_rango(
  p_inicio timestamptz,
  p_fin timestamptz
)
RETURNS TABLE (
  costo_materiales_mxn numeric,
  costo_mano_obra_mxn numeric,
  costo_gastos_mxn numeric,
  costo_total_mxn numeric,
  ordenes_internas integer
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH internas AS (
    SELECT orden.id, orden.creado_en
    FROM public.ordenes_produccion AS orden
    WHERE orden.es_interna = true
      AND orden.estado <> 'cancelada'
  ), materiales AS (
    SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
      * consumo.costo_unitario_momento), 0)::numeric AS monto
    FROM public.registros_consumo_material AS consumo
    INNER JOIN public.partidas_orden_produccion AS partida ON partida.id = consumo.partida_id
    INNER JOIN internas ON internas.id = partida.orden_id
    WHERE consumo.creado_en >= p_inicio AND consumo.creado_en < p_fin
  ), mano_obra AS (
    SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)::numeric AS monto
    FROM public.sesiones_trabajo AS sesion
    INNER JOIN internas ON internas.id = sesion.orden_id
    WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
      AND sesion.actualizado_en >= p_inicio AND sesion.actualizado_en < p_fin
  ), gastos AS (
    SELECT COALESCE(SUM(gasto.monto_total
      * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)::numeric AS monto
    FROM public.gastos AS gasto
    INNER JOIN internas ON internas.id = gasto.orden_id
    WHERE gasto.estado_pago <> 'cancelado'
      AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
      AND gasto.categoria NOT IN ('materia_prima', 'nomina')
  ), conteo AS (
    SELECT COUNT(*)::integer AS total
    FROM internas
    WHERE internas.creado_en >= p_inicio AND internas.creado_en < p_fin
  )
  SELECT
    materiales.monto,
    mano_obra.monto,
    gastos.monto,
    round(materiales.monto + mano_obra.monto + gastos.monto, 4),
    conteo.total
  FROM materiales, mano_obra, gastos, conteo;
$$;

REVOKE EXECUTE ON FUNCTION privado.costo_ti_rango(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.obtener_costo_ti_periodo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_actual record;
  v_anterior record;
BEGIN
  IF p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_dashboard_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  SELECT * INTO v_actual FROM privado.costo_ti_rango(p_fecha_inicio, p_fecha_fin);
  SELECT * INTO v_anterior FROM privado.costo_ti_rango(v_anterior_inicio, v_anterior_fin);

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', jsonb_build_object(
      'costoMaterialesMxn', v_actual.costo_materiales_mxn,
      'costoManoObraMxn', v_actual.costo_mano_obra_mxn,
      'costoGastosMxn', v_actual.costo_gastos_mxn,
      'costoTotalMxn', v_actual.costo_total_mxn,
      'ordenesInternas', v_actual.ordenes_internas
    ),
    'anterior', jsonb_build_object(
      'costoMaterialesMxn', v_anterior.costo_materiales_mxn,
      'costoManoObraMxn', v_anterior.costo_mano_obra_mxn,
      'costoGastosMxn', v_anterior.costo_gastos_mxn,
      'costoTotalMxn', v_anterior.costo_total_mxn,
      'ordenesInternas', v_anterior.ordenes_internas
    )
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_costo_ti_periodo(timestamptz, timestamptz) IS
  'Costo de producción de trabajos internos (TI) del periodo con regla anti-duplicado (OBS-29): materiales consumidos, mano de obra histórica y gastos directos. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_costo_ti_periodo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_costo_ti_periodo(timestamptz, timestamptz)
  TO service_role;
