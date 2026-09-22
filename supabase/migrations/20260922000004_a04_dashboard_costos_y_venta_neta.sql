-- =============================================================================
-- A04 — El dashboard ejecutivo usa la misma regla de costo e ingreso que el
-- detalle de la orden.
--
-- Hallazgo (auditoría global 2026-09-22): con un consumo de material de 500 la
-- tarjeta de rentabilidad mostraba costo 500, pero al registrar un gasto de
-- categoría `materia_prima` por el mismo importe la utilidad ejecutiva pasaba de
-- -500 a -1000: el anti-duplicado de OBS-29 nunca llegó al resumen ejecutivo.
--
-- Correcciones:
--   1. Anti-duplicado alineado: un gasto **ligado a una orden** de categoría
--      `materia_prima` o `nomina` ya está representado por el consumo real y por
--      las sesiones con tarifa histórica, así que no vuelve a sumar al costo del
--      periodo. Los gastos indirectos **sin orden** (nómina administrativa,
--      compras a almacén) SÍ se conservan en el costo: no tienen contrapartida en
--      ningún rubro de orden.
--   2. Ingreso neto (A03/D-11): el margen del periodo se calcula sobre la venta
--      NETA histórica. `totalFacturado` conserva su significado (importe
--      facturado con IVA) y se agregan `ventaNetaMxn`, `ivaMxn`,
--      `ventaSinDesgloseMxn` y `cuentasSinDesglose`.
--   3. Si alguna cuenta reconocida en el periodo no tiene desglose persistido,
--      `utilidadNetaAcumulada` y `margenPromedioPorcentaje` salen NULL: la UI los
--      muestra como no calculables en lugar de un margen inflado por IVA.
--   4. `gastosTotal` y la distribución por categoría NO cambian: siguen midiendo
--      el desembolso real del periodo (DAS-02/DAS-06), no el costo de producción.
--      El monto neutralizado por anti-duplicado se publica aparte en
--      `gastosIncluidosEnRubrosMxn` para que las dos cifras se puedan conciliar.
--
-- Las claves nuevas son aditivas: el mapper del dashboard las lee con default y
-- el tablero sigue funcionando si la migración aún no está aplicada.
--
-- Aditiva e idempotente. La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Un solo cálculo por rango: el periodo actual y el anterior dejan de ser dos
--    copias del mismo SQL (fuente de divergencias como la de este hallazgo).
-- -----------------------------------------------------------------------------
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
    -- D-04: el ingreso se reconoce cuando la cuenta se vuelve cobrable.
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
    -- Excluye trabajos internos: no son venta/cotizado comercial (DAS-01).
    -- El descuento (RFQ-03) viene en positivo y aquí se resta del cotizado.
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
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
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < p_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= p_ahora
          AND orden.fecha_compromiso < p_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= p_inicio
      AND orden.creado_en < p_fin
  ), costos AS (
    -- OBS-29/A04: misma regla que `obtener_rentabilidad_orden`. Un gasto de
    -- materia prima o nómina LIGADO A UNA ORDEN ya está en el consumo y en las
    -- sesiones; los indirectos sin orden se conservan.
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= p_inicio AND consumo.creado_en < p_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= p_inicio AND sesion.actualizado_en < p_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
           AND NOT (gasto.orden_id IS NOT NULL
             AND gasto.categoria IN ('materia_prima', 'nomina')))
      AS monto,
      (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
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
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
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
          SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END) AS monto
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_inicio AND gasto.fecha_gasto < p_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;
$$;

COMMENT ON FUNCTION privado.metricas_ejecutivas_rango(timestamptz, timestamptz, timestamptz) IS
  'A04: bloque ejecutivo de un rango con costo anti-duplicado (gastos de orden materia_prima/nomina no suman) e ingreso neto histórico. Uso interno del RPC ejecutivo.';

REVOKE EXECUTE ON FUNCTION privado.metricas_ejecutivas_rango(timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. RPC ejecutivo: misma firma y misma forma de respuesta, sin el SQL duplicado.
--    Base: 20260919000005 (D-04).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_metricas_dashboard_ejecutivo(
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
  v_ahora timestamptz := now();
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

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', privado.metricas_ejecutivas_rango(p_fecha_inicio, p_fecha_fin, v_ahora),
    'anterior', privado.metricas_ejecutivas_rango(v_anterior_inicio, v_anterior_fin, v_ahora),
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz) IS
  'Ventas comerciales (excluye TI) reconocidas al volverse cobrables (D-04) con venta neta histórica (A03), órdenes (incl. TI) y finanzas con costo anti-duplicado alineado al detalle de la orden (A04/OBS-29), en MXN.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  TO service_role;
