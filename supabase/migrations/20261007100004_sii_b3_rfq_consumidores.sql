-- =============================================================================
-- SII-B3.2 (ola 2) — Consumidores SQL de `pipeline.etapa` migrados a `estado_rfq`
-- Plan: docs/plan-erp-sii/03-rfq.md §3.8 (consumidores) y §3.9 (aceptación 1)
--
-- Recrea, conservando firma y claves JSON exactas:
--   * privado.metricas_ejecutivas_rango  (porcentajeConversión deja de leer etapa)
--   * public.obtener_metricas_vendedor   (pipelinePorEtapa + sin seguimiento)
--   * public.obtener_metricas_pipeline_equipo (ídem)
--
-- Mapeo estado_rfq → bucket legado del embudo (contrato JSON sin cambios):
--   NEW                                   → prospecto
--   INCOMPLETE/WAITING_CUSTOMER/WAITING_TECHNICAL → contactado
--   READY_FOR_PROPOSAL                    → cotizado
--   CONVERTED (sin orden)                 → negociacion
--   CON orden vinculada                   → ganada
--   CLOSED/CANCELLED                      → perdida
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias: sin B3 ola 1 esta migración no puede aplicar.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.rfq_items') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20261007100002_sii_b3_rfq_base.sql antes (falta public.rfq_items)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipeline' AND column_name = 'estado_rfq'
  ) THEN
    RAISE EXCEPTION 'aplicar 20261007100002_sii_b3_rfq_base.sql antes (falta pipeline.estado_rfq)';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Traducción estado_rfq → bucket legado del embudo (solo lectura de métricas)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.etapa_legacy_de_rfq(p_estado text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_estado
    WHEN 'NEW' THEN 'prospecto'
    WHEN 'INCOMPLETE' THEN 'contactado'
    WHEN 'WAITING_CUSTOMER' THEN 'contactado'
    WHEN 'WAITING_TECHNICAL' THEN 'contactado'
    WHEN 'READY_FOR_PROPOSAL' THEN 'cotizado'
    WHEN 'CONVERTED' THEN 'negociacion'
    WHEN 'CLOSED' THEN 'perdida'
    WHEN 'CANCELLED' THEN 'perdida'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION privado.etapa_legacy_de_rfq(text) IS
  'SII-B3 ola 2: traduce estado_rfq al bucket histórico del embudo (claves JSON sin cambios). Uso interno de métricas.';

REVOKE ALL ON FUNCTION privado.etapa_legacy_de_rfq(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ejecutivo: `porcentajeConversion` cuenta ganadas por orden vinculada
--    (la columna etapa ya no se lee). Mismo cuerpo y claves que A04.
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
    -- Ola 2: ganadas = RFQ con orden vinculada (estado_rfq no distingue "ganada").
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
  'A04/B3 ola 2: bloque ejecutivo de un rango con costo anti-duplicado e ingreso neto. La conversión usa estado_rfq y órdenes vinculadas (ya no lee pipeline.etapa).';

REVOKE EXECUTE ON FUNCTION privado.metricas_ejecutivas_rango(timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Vendedor: mismos buckets y claves; VOLATILE se conserva (FOR KEY SHARE).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_metricas_vendedor(
  p_usuario_id uuid,
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_mes_actual date;
  v_mes_anterior date;
  v_meta_actual numeric := 0;
  v_meta_anterior numeric := 0;
  v_comision_actual numeric := 0;
  v_comision_anterior numeric := 0;
  v_real_actual numeric := 0;
  v_real_anterior numeric := 0;
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_usuario_id IS NULL
     OR p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_vendedor_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_usuario_id
    AND usuario.rol = 'vendedor'
    AND usuario.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendedor_no_activo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;
  v_mes_actual := date_trunc('month', (p_fecha_fin - interval '1 microsecond'))::date;
  v_mes_anterior := date_trunc('month', (v_anterior_fin - interval '1 microsecond'))::date;

  SELECT COALESCE(meta.meta_mensual_mxn, 0), COALESCE(meta.porcentaje_comision, 0)
  INTO v_meta_actual, v_comision_actual
  FROM public.metas_vendedor AS meta
  WHERE meta.vendedor_id = p_usuario_id AND meta.mes = v_mes_actual;
  SELECT COALESCE(meta.meta_mensual_mxn, 0), COALESCE(meta.porcentaje_comision, 0)
  INTO v_meta_anterior, v_comision_anterior
  FROM public.metas_vendedor AS meta
  WHERE meta.vendedor_id = p_usuario_id AND meta.mes = v_mes_anterior;

  SELECT COALESCE(SUM(
    CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
         ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
  ), 0)
  INTO v_real_actual
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  INNER JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
  WHERE pipeline.vendedor_id = p_usuario_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.fecha_emision >= p_fecha_inicio
    AND cuenta.fecha_emision < p_fecha_fin;

  SELECT COALESCE(SUM(
    CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
         ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
  ), 0)
  INTO v_real_anterior
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  INNER JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
  WHERE pipeline.vendedor_id = p_usuario_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.fecha_emision >= v_anterior_inicio
    AND cuenta.fecha_emision < v_anterior_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'cotizado'),
      'negociacion', COUNT(*) FILTER (
        WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'negociacion'
          AND NOT EXISTS (
            SELECT 1 FROM public.ordenes_produccion AS orden
            WHERE orden.cotizacion_id = pipeline.id
          )
      ),
      'ganada', COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
      ),
      'perdida', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'perdida')
    ),
    'cotizacionesSinSeguimiento', COUNT(*) FILTER (
      WHERE pipeline.estado_rfq IN ('READY_FOR_PROPOSAL', 'CONVERTED')
        AND NOT EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
        AND pipeline.fecha_envio_cotizacion IS NOT NULL
        AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
          < p_fecha_fin - interval '3 days'
    ),
    'metaMensual', jsonb_build_object(
      'metaMxn', round(v_meta_actual, 4),
      'realMxn', round(v_real_actual, 4),
      'porcentajeCumplimiento', CASE WHEN v_meta_actual > 0
        THEN round(v_real_actual / v_meta_actual * 100, 4) ELSE 0 END
    ),
    'comisionAcumuladaMxn', round(v_real_actual * v_comision_actual / 100, 4)
  ) INTO v_actual
  FROM public.pipeline AS pipeline
  WHERE pipeline.vendedor_id = p_usuario_id
    AND pipeline.creado_en >= p_fecha_inicio
    AND pipeline.creado_en < p_fecha_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'cotizado'),
      'negociacion', COUNT(*) FILTER (
        WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'negociacion'
          AND NOT EXISTS (
            SELECT 1 FROM public.ordenes_produccion AS orden
            WHERE orden.cotizacion_id = pipeline.id
          )
      ),
      'ganada', COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
      ),
      'perdida', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'perdida')
    ),
    'cotizacionesSinSeguimiento', COUNT(*) FILTER (
      WHERE pipeline.estado_rfq IN ('READY_FOR_PROPOSAL', 'CONVERTED')
        AND NOT EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
        AND pipeline.fecha_envio_cotizacion IS NOT NULL
        AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
          < v_anterior_fin - interval '3 days'
    ),
    'metaMensual', jsonb_build_object(
      'metaMxn', round(v_meta_anterior, 4),
      'realMxn', round(v_real_anterior, 4),
      'porcentajeCumplimiento', CASE WHEN v_meta_anterior > 0
        THEN round(v_real_anterior / v_meta_anterior * 100, 4) ELSE 0 END
    ),
    'comisionAcumuladaMxn', round(v_real_anterior * v_comision_anterior / 100, 4)
  ) INTO v_anterior
  FROM public.pipeline AS pipeline
  WHERE pipeline.vendedor_id = p_usuario_id
    AND pipeline.creado_en >= v_anterior_inicio
    AND pipeline.creado_en < v_anterior_fin;

  RETURN jsonb_build_object(
    'version', 1,
    'usuarioId', p_usuario_id,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz) IS
  'Métricas del pipeline, seguimiento, meta y comisión de un vendedor activo, sin acceso cruzado. Ola 2: buckets derivados de estado_rfq y órdenes vinculadas.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Equipo: mismos buckets y claves (STABLE se conserva).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_metricas_pipeline_equipo(
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
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_equipo_invalido' USING ERRCODE = 'check_violation';
  END IF;
  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'cotizado'),
      'negociacion', COUNT(*) FILTER (
        WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'negociacion'
          AND NOT EXISTS (
            SELECT 1 FROM public.ordenes_produccion AS orden
            WHERE orden.cotizacion_id = pipeline.id
          )
      ),
      'ganada', COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
      ),
      'perdida', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'perdida')
    ),
     'cotizacionesSinSeguimiento', COUNT(*) FILTER (
       WHERE pipeline.estado_rfq IN ('READY_FOR_PROPOSAL', 'CONVERTED')
         AND NOT EXISTS (
           SELECT 1 FROM public.ordenes_produccion AS orden
           WHERE orden.cotizacion_id = pipeline.id
         )
         AND pipeline.fecha_envio_cotizacion IS NOT NULL
         AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
           < p_fecha_fin - interval '3 days'
     ),
     'ordenes', (
       SELECT jsonb_build_object(
         'activas', COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado = 'completada'),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado = 'borrador'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         )
       )
       FROM public.ordenes_produccion AS orden
       WHERE orden.creado_en >= p_fecha_inicio AND orden.creado_en < p_fecha_fin
     )
  ) INTO v_actual
  FROM public.pipeline AS pipeline
  WHERE pipeline.creado_en >= p_fecha_inicio AND pipeline.creado_en < p_fecha_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'cotizado'),
      'negociacion', COUNT(*) FILTER (
        WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'negociacion'
          AND NOT EXISTS (
            SELECT 1 FROM public.ordenes_produccion AS orden
            WHERE orden.cotizacion_id = pipeline.id
          )
      ),
      'ganada', COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.ordenes_produccion AS orden
          WHERE orden.cotizacion_id = pipeline.id
        )
      ),
      'perdida', COUNT(*) FILTER (WHERE privado.etapa_legacy_de_rfq(pipeline.estado_rfq) = 'perdida')
    ),
     'cotizacionesSinSeguimiento', COUNT(*) FILTER (
       WHERE pipeline.estado_rfq IN ('READY_FOR_PROPOSAL', 'CONVERTED')
         AND NOT EXISTS (
           SELECT 1 FROM public.ordenes_produccion AS orden
           WHERE orden.cotizacion_id = pipeline.id
         )
         AND pipeline.fecha_envio_cotizacion IS NOT NULL
         AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
           < v_anterior_fin - interval '3 days'
     ),
     'ordenes', (
       SELECT jsonb_build_object(
         'activas', COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado = 'completada'),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado = 'borrador'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         )
       )
       FROM public.ordenes_produccion AS orden
       WHERE orden.creado_en >= v_anterior_inicio AND orden.creado_en < v_anterior_fin
     )
  ) INTO v_anterior
  FROM public.pipeline AS pipeline
  WHERE pipeline.creado_en >= v_anterior_inicio AND pipeline.creado_en < v_anterior_fin;

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz) IS
  'Consolida el pipeline y seguimientos del equipo sin transportar datos financieros. Ola 2: buckets derivados de estado_rfq y órdenes vinculadas.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz)
  TO service_role;
