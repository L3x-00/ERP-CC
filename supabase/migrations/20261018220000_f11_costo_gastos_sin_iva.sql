-- =============================================================================
-- C10.1/F11 — Todo costo de gasto se calcula sobre monto_subtotal (sin IVA).
-- Respuesta F-08 del cliente: tarjeta, desglose, Dashboard y costo TI netos.
--
-- Se copian las definiciones VIGENTES completas y solo cambia la fuente del
-- importe de gasto (monto_total -> monto_subtotal). Firmas, retornos, estados
-- y grants quedan iguales.
--   * public.obtener_rentabilidad_orden      <- 20260922000003 (A03)
--   * public.obtener_desglose_rentabilidad_orden <- 20260923170507 (A15)
--   * privado.metricas_ejecutivas_rango      <- 20261017100001 (C8.4)
--   * privado.costo_ti_rango                 <- 20261007120004 (SII-B5)
-- Aplicar SOLO local; el PO aplica en remoto ANTES del despliegue.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.obtener_rentabilidad_orden(p_orden_id uuid)
RETURNS TABLE (
  orden_id uuid,
  monto_venta_mxn numeric,
  monto_venta_facturado_mxn numeric,
  monto_iva_mxn numeric,
  venta_desglose_conocido boolean,
  cuentas_sin_desglose integer,
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
  v_venta_neta numeric(18, 4);
  v_venta_facturada numeric(18, 4);
  v_iva numeric(18, 4);
  v_sin_desglose integer;
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
  -- A03: el ingreso reconocido es el NETO histórico de la cuenta. El factor de
  -- conversión a MXN es el TC congelado en la cuenta, igual para base e IVA.
  SELECT
    COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_subtotal
           ELSE cuenta.monto_subtotal * cuenta.tipo_cambio_origen END
    ), 0),
    COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0),
    COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_iva
           ELSE cuenta.monto_iva * cuenta.tipo_cambio_origen END
    ), 0),
    COUNT(*) FILTER (WHERE cuenta.monto_subtotal IS NULL)::integer
  INTO v_venta_neta, v_venta_facturada, v_iva, v_sin_desglose
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.cobrable_desde IS NOT NULL;

  -- Sin desglose no hay ingreso neto defendible: se declara no calculable en vez
  -- de dividir por la tasa vigente o de presentar el importe con IVA como venta.
  IF v_sin_desglose > 0 THEN
    v_venta_neta := NULL;
    v_iva := NULL;
  END IF;

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
      gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
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
  v_utilidad := CASE
    WHEN v_venta_neta IS NULL THEN NULL
    ELSE round(v_venta_neta - v_costo_total, 4)
  END;

  RETURN QUERY
  SELECT
    p_orden_id,
    round(v_venta_neta, 4),
    round(v_venta_facturada, 4),
    round(v_iva, 4),
    v_sin_desglose = 0,
    v_sin_desglose,
    round(v_materiales, 4),
    round(v_mano_obra, 4),
    round(v_gastos, 4),
    v_costo_total,
    v_utilidad,
    CASE
      WHEN v_venta_neta IS NOT NULL AND v_venta_neta > 0
        THEN round(v_utilidad / v_venta_neta * 100, 4)
      ELSE NULL
    END,
    v_venta_neta IS NOT NULL AND v_venta_neta > 0,
    v_materiales_count,
    v_sesiones_count,
    v_sesiones_sin_tarifa_count,
    v_gastos_count,
    v_gastos_excluidos_count,
    v_gastos_incluidos_count;
END;
$$;

COMMENT ON FUNCTION public.obtener_rentabilidad_orden(uuid) IS
  'Rentabilidad en MXN sobre ingreso NETO histórico (A03/D-11): monto_venta_mxn es la base sin IVA y sale NULL —junto con utilidad y margen— si alguna cuenta cobrable no tiene desglose persistido. Ingreso solo de AR cobrables (D-04); gastos materia_prima/nomina no suman (OBS-29). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid) TO service_role;

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
    round(SUM(gasto.monto_subtotal
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
    round(SUM(gasto.monto_subtotal
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

CREATE OR REPLACE FUNCTION privado.metricas_ejecutivas_rango(
  p_inicio timestamptz,
  p_fin timestamptz,
  p_ahora timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH ingresos AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
             ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
      ), 0)::numeric AS facturado,
      COALESCE(SUM(
        CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_subtotal
             ELSE cuenta.monto_subtotal * cuenta.tipo_cambio_origen END
      ), 0)::numeric AS neto,
      COALESCE(SUM(
        CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_iva
             ELSE cuenta.monto_iva * cuenta.tipo_cambio_origen END
      ), 0)::numeric AS iva,
      COALESCE(SUM(
        CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
             ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
      ) FILTER (WHERE cuenta.monto_subtotal IS NULL), 0)::numeric AS sin_desglose_monto,
      COUNT(*) FILTER (WHERE cuenta.monto_subtotal IS NULL)::integer AS sin_desglose
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.cobrable_desde IS NOT NULL
      AND cuenta.cobrable_desde >= p_inicio
      AND cuenta.cobrable_desde < p_fin
  ), cotizado AS (
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
      )::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= p_inicio
      AND pipeline.creado_en < p_fin
      AND pipeline.es_orden_interna = false
  ), respuesta AS (
    SELECT
      AVG(EXTRACT(EPOCH FROM (p.fecha_envio_cotizacion - p.creado_en))::numeric / 3600.0)
        FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
          AND p.fecha_envio_cotizacion >= p.creado_en) AS horas_promedio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en) AS con_envio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en
        AND p.fecha_envio_cotizacion - p.creado_en <= interval '24 hours') AS respondidas_24h
    FROM public.pipeline AS p
    WHERE p.creado_en >= p_inicio
      AND p.creado_en < p_fin
      AND p.es_orden_interna = false
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado_sii IN ('PLANIFICADA', 'LISTA', 'EN_PRODUCCION'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA'))::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado_sii = 'CONFIRMADA')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      -- C8.4/O-06 A: atraso contra la promesa al cliente, no contra la fecha operativa.
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso_comercial < p_ahora
          AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso_comercial >= p_ahora
          AND orden.fecha_compromiso_comercial < p_ahora + interval '3 days'
          AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= p_inicio
      AND orden.creado_en < p_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= p_inicio AND consumo.creado_en < p_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= p_inicio AND sesion.actualizado_en < p_fin)
      + (SELECT COALESCE(SUM(gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
           AND NOT (gasto.orden_id IS NOT NULL
             AND gasto.categoria IN ('materia_prima', 'nomina')))
      AS monto,
      (SELECT COALESCE(SUM(gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
       FROM public.gastos AS gasto
       WHERE gasto.estado_pago <> 'cancelado'
         AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
         AND gasto.orden_id IS NOT NULL
         AND gasto.categoria IN ('materia_prima', 'nomina'))
      AS incluidos_en_rubros
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL
          AND cuenta.fecha_vencimiento < p_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin), 0)::numeric AS gastos_total
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.facturado, 4),
      'ventaNetaMxn', CASE WHEN ingresos.sin_desglose = 0 THEN round(ingresos.neto, 4) ELSE NULL END,
      'ivaMxn', CASE WHEN ingresos.sin_desglose = 0 THEN round(ingresos.iva, 4) ELSE NULL END,
      'ventaSinDesgloseMxn', round(ingresos.sin_desglose_monto, 4),
      'cuentasSinDesglose', ingresos.sin_desglose,
      'totalCotizado', round(cotizado.monto, 4),
      'porcentajeConversion', CASE WHEN cotizado.oportunidades > 0
        THEN round(cotizado.ganadas::numeric / cotizado.oportunidades * 100, 4) ELSE 0 END,
      'tiempoRespuestaHorasPromedio', round(COALESCE(respuesta.horas_promedio, 0), 4),
      'porcentajeRespondidas24h', CASE WHEN respuesta.con_envio > 0
        THEN round(respuesta.respondidas_24h::numeric / respuesta.con_envio * 100, 4) ELSE 0 END
    ),
    'ordenes', jsonb_build_object(
      'activas', ordenes.activas,
      'completadas', ordenes.completadas,
      'aprobacionesPendientes', ordenes.aprobaciones_pendientes,
      'internas', ordenes.internas,
      'atrasadas', ordenes.atrasadas,
      'enRiesgo', ordenes.en_riesgo
    ),
    'finanzas', jsonb_build_object(
      'arPendiente', round(finanzas.ar_pendiente, 4),
      'arVencido', round(finanzas.ar_vencido, 4),
      'cxpPendiente', round(finanzas.cxp_pendiente, 4),
      'gastosTotal', round(finanzas.gastos_total, 4),
      'costosReconocidosMxn', round(costos.monto, 4),
      'gastosIncluidosEnRubrosMxn', round(costos.incluidos_en_rubros, 4),
      'utilidadNetaAcumulada', CASE WHEN ingresos.sin_desglose = 0
        THEN round(ingresos.neto - costos.monto, 4) ELSE NULL END,
      'margenPromedioPorcentaje', CASE
        WHEN ingresos.sin_desglose = 0 AND ingresos.neto > 0
          THEN round((ingresos.neto - costos.monto) / ingresos.neto * 100, 4)
        ELSE NULL END
    ),
    'distribucionGastoPorCategoria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('categoria', d.categoria, 'montoMxn', round(d.monto, 4))
        ORDER BY d.monto DESC
      )
      FROM (
        SELECT gasto.categoria AS categoria,
          SUM(gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END) AS monto
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;
$$;

REVOKE ALL ON FUNCTION privado.metricas_ejecutivas_rango(timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

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
      AND orden.estado_sii <> 'CANCELADA'
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
    SELECT COALESCE(SUM(gasto.monto_subtotal
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

REVOKE ALL ON FUNCTION privado.costo_ti_rango(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
