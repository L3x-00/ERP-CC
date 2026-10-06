-- =============================================================================
-- SII-B5 ola 2 — Consumidores SQL leen el estado SII
-- Plan: docs/plan-erp-sii/05-orden-trabajo.md §5.3 ("estado derivado del avance")
--
-- Recrea, sin cambiar firmas ni claves JSON, las funciones compartidas que
-- filtraban por el estado legacy:
--   * privado.metricas_ejecutivas_rango (dashboard ejecutivo)
--   * public.obtener_metricas_pipeline_equipo (dashboard de equipo)
--   * privado.costo_ti_rango (rentabilidad TI, vía obtener_costo_ti_periodo)
--   * public.repetir_orden_op / public.reactivar_orden_op
-- El puente estado_sii ↔ estado sigue intacto (se retira al cierre de B6).
-- Idempotente: CREATE OR REPLACE. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'estado_sii'
  ) THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007120001_sii_b5_orden_base antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Dashboard ejecutivo
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
      COUNT(*) FILTER (WHERE orden.estado_sii IN ('PLANIFICADA', 'LISTA', 'EN_PRODUCCION'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA'))::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado_sii = 'CONFIRMADA')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < p_ahora
          AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= p_ahora
          AND orden.fecha_compromiso < p_ahora + interval '3 days'
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

REVOKE ALL ON FUNCTION privado.metricas_ejecutivas_rango(timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Dashboard de equipo (claves JSON intactas)
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
         'activas', COUNT(*) FILTER (WHERE orden.estado_sii IN ('PLANIFICADA', 'LISTA', 'EN_PRODUCCION')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado_sii = 'CONFIRMADA'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
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
         'activas', COUNT(*) FILTER (WHERE orden.estado_sii IN ('PLANIFICADA', 'LISTA', 'EN_PRODUCCION')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado_sii = 'CONFIRMADA'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
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

-- -----------------------------------------------------------------------------
-- 3. Costo TI por periodo (RPC privada que alimenta obtener_costo_ti_periodo)
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

REVOKE ALL ON FUNCTION privado.costo_ti_rango(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Repetir y reactivar órdenes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repetir_orden_op(
  p_orden_origen_id uuid,
  p_actor_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, cuenta_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen public.ordenes_produccion%ROWTYPE;
  v_partidas jsonb;
  v_orden_id uuid;
  v_folio text;
  v_cuenta_id uuid;
  v_ar_monto numeric;
  v_ar_subtotal numeric;
  v_ar_iva numeric;
  v_ar_moneda text;
  v_ar_tc numeric;
BEGIN
  IF p_orden_origen_id IS NULL OR p_actor_id IS NULL OR p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'repeticion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_repetir_orden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_origen
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_origen_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Solo tiene sentido repetir un trabajo terminado o uno heredado; una orden
  -- activa, cancelada o en borrador no es historial.
  IF v_origen.estado_sii = 'CANCELADA'
     OR NOT (v_origen.id_historico IS NOT NULL OR v_origen.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')) THEN
    RAISE EXCEPTION 'orden_no_repetible' USING ERRCODE = 'check_violation';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'codigo_pieza', partida.codigo_pieza,
      'descripcion', partida.descripcion,
      'cantidad_solicitada', partida.cantidad_solicitada,
      'unidad_medida', partida.unidad_medida,
      'material_id', partida.material_id,
      'tiempo_estimado_minutos', partida.tiempo_estimado_minutos,
      'maquina_asignada', partida.maquina_asignada,
      'area_trabajo_codigo', partida.area_trabajo_codigo,
      'procesos', partida.procesos,
      'es_externo', partida.es_externo,
      'proveedor_externo', partida.proveedor_externo
    )
    ORDER BY partida.creado_en, partida.id
  )
  INTO v_partidas
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_origen_id;

  IF v_partidas IS NULL OR jsonb_array_length(v_partidas) = 0 THEN
    RAISE EXCEPTION 'orden_sin_partidas' USING ERRCODE = 'check_violation';
  END IF;

  -- La repetición crea una OP nueva con folio propio y metas inicializadas por
  -- el trigger de ORD-07; las cantidades producidas parten de cero.
  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    v_origen.cliente_id, NULL, p_fecha_compromiso, v_origen.prioridad, v_partidas
  ) AS creada;

  UPDATE public.ordenes_produccion AS orden
  SET
    estado_sii = 'PLANIFICADA',
    orden_origen_id = p_orden_origen_id,
    referencia_externa = v_origen.referencia_externa,
    condicion_pago = v_origen.condicion_pago,
    horas_estimadas = v_origen.horas_estimadas,
    monto_sin_iva = v_origen.monto_sin_iva,
    monto_iva = v_origen.monto_iva
  WHERE orden.id = v_orden_id;

  -- Precio comercial: se copia del desglose de la AR de origen si existe; si no,
  -- de los montos capturados. Nunca se copian pagos ni saldos.
  SELECT cuenta.monto_total, cuenta.monto_subtotal, cuenta.monto_iva,
         cuenta.moneda, cuenta.tipo_cambio_origen
  INTO v_ar_monto, v_ar_subtotal, v_ar_iva, v_ar_moneda, v_ar_tc
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_origen_id
  FOR KEY SHARE;

  IF FOUND THEN
    INSERT INTO public.cuentas_por_cobrar (
      orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
      tipo_cambio_origen, estado, monto_subtotal, monto_iva
    ) VALUES (
      v_orden_id, v_origen.cliente_id, v_ar_monto, v_ar_monto, v_ar_moneda,
      v_ar_tc, 'pendiente', v_ar_subtotal, v_ar_iva
    )
    RETURNING cuentas_por_cobrar.id INTO v_cuenta_id;
  ELSIF v_origen.monto_sin_iva IS NOT NULL THEN
    INSERT INTO public.cuentas_por_cobrar (
      orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
      tipo_cambio_origen, estado, monto_subtotal, monto_iva
    ) VALUES (
      v_orden_id, v_origen.cliente_id, v_origen.monto_sin_iva + v_origen.monto_iva,
      v_origen.monto_sin_iva + v_origen.monto_iva, 'MXN', 1, 'pendiente',
      v_origen.monto_sin_iva, v_origen.monto_iva
    )
    RETURNING cuentas_por_cobrar.id INTO v_cuenta_id;
  END IF;

  RETURN QUERY SELECT v_orden_id, v_folio, v_cuenta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivar_orden_op(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  estado text,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_actualizado_en IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reactivacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_reactivar_orden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- CAS: una pantalla obsoleta no revive una orden que cambió después.
  IF v_orden.actualizado_en <> p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_orden.estado_sii NOT IN ('PRODUCCION_COMPLETADA', 'CERRADA') THEN
    RAISE EXCEPTION 'orden_no_reactivable' USING ERRCODE = 'check_violation';
  END IF;

  -- Una orden entregada o archivada conserva su cierre: reabrirla alteraría la
  -- nota de entrega y la facturación ya emitida.
  IF v_orden.archivada_en IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.notas_entrega AS nota WHERE nota.orden_id = p_orden_id)
     OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar AS cuenta
       WHERE cuenta.orden_id = p_orden_id
         AND (
           cuenta.cobrable_desde IS NOT NULL
           OR cuenta.estado IN ('parcial', 'pagado')
           OR cuenta.saldo_pendiente < cuenta.monto_total
         )
     ) THEN
    RAISE EXCEPTION 'orden_entregada_no_reactivable' USING ERRCODE = 'check_violation';
  END IF;

  -- Solo cambia el estado y el cierre; sesiones, avances, programaciones,
  -- metas y partidas se conservan intactos.
  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'EN_PRODUCCION', fecha_fin = NULL, actualizado_en = clock_timestamp()
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  SELECT orden.id, orden.estado, orden.fecha_inicio, orden.fecha_fin, orden.actualizado_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;
