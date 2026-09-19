-- =============================================================================
-- Órdenes internas (trabajo interno "TI") — RFQ-09 + DAS-01.
--
-- Una oportunidad (RFQ) puede marcarse como trabajo interno. Al aprobarla, la
-- orden hereda esa condición y:
--   * NO genera cuenta por cobrar comercial (RFQ-09: "no se genera AR").
--   * NO se cuenta como venta/cotizado/conversión comercial en el dashboard,
--     y se reporta por separado como "Órdenes internas (TI)" (DAS-01).
--
-- Mecanismo: banderas booleanas (robusto y sin romper los CHECK de folio, que
-- exigen 'OP-NNNNNN'). El folio no cambia; el TI se identifica por la bandera y
-- se etiqueta en la UI. El cliente se conserva (la RFQ interna sigue teniendo
-- cliente); solo cambia el tratamiento comercial/AR.
--
-- Firmas sin cambios => CREATE OR REPLACE (conserva permisos); se reafirman
-- REVOKE/GRANT. ALTER ... ADD COLUMN IF NOT EXISTS es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Banderas de trabajo interno.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS es_orden_interna boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.pipeline.es_orden_interna IS
  'RFQ-09: la oportunidad es trabajo interno (TI); al aprobar no genera AR y no cuenta como venta a cliente.';

ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS es_interna boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.ordenes_produccion.es_interna IS
  'DAS-01/RFQ-09: orden de trabajo interno (TI); se identifica aparte y no admite apertura de cobranza.';

-- -----------------------------------------------------------------------------
-- 2. Aprobación: la OP hereda la condición interna de la oportunidad.
--    Misma firma que 20260911000003; se añade la lectura de la bandera y el
--    UPDATE de la OP recién creada (la rama de reintento no la toca: la OP ya
--    conserva su propia bandera).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_oportunidad_y_crear_orden(
  p_pipeline_id uuid,
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_etapa text;
  v_prioridad text;
  v_es_interna boolean;
  v_orden_id uuid;
  v_folio text;
  v_orden_cliente_id uuid;
  v_partidas jsonb;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad, es_orden_interna
  INTO v_etapa, v_prioridad, v_es_interna
  FROM public.pipeline
  WHERE pipeline.id = p_pipeline_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'oportunidad_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ordenes_produccion.id, ordenes_produccion.folio, ordenes_produccion.cliente_id
  INTO v_orden_id, v_folio, v_orden_cliente_id
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.cotizacion_id = p_pipeline_id;

  IF FOUND THEN
    IF v_orden_cliente_id IS DISTINCT FROM p_cliente_id THEN
      RAISE EXCEPTION 'cliente_no_corresponde_orden' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pipeline
    SET etapa = 'ganada', cliente_id = p_cliente_id
    WHERE pipeline.id = p_pipeline_id;
    RETURN QUERY SELECT v_orden_id, v_folio, true;
    RETURN;
  END IF;

  IF v_etapa <> 'negociacion' THEN
    RAISE EXCEPTION 'etapa_pipeline_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'codigo_pieza', 'COT-' || lpad((linea.orden + 1)::text, 3, '0'),
      'descripcion', CASE
        WHEN nullif(btrim(linea.material), '') IS NULL THEN linea.descripcion
        ELSE linea.descripcion || ' — Material cotizado: ' || linea.material
      END,
      'cantidad_solicitada', linea.cantidad,
      'unidad_medida', 'unidad',
      'material_id', NULL,
      'tiempo_estimado_minutos', 0,
      'maquina_asignada', NULL
    )
    ORDER BY linea.orden, linea.id
  )
  INTO v_partidas
  FROM public.cotizacion_lineas AS linea
  WHERE linea.pipeline_id = p_pipeline_id;

  IF v_partidas IS NULL OR jsonb_array_length(v_partidas) = 0 THEN
    RAISE EXCEPTION 'cotizacion_sin_lineas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    p_cliente_id,
    p_pipeline_id,
    p_fecha_compromiso,
    coalesce(v_prioridad, 'normal'),
    v_partidas
  ) AS creada;

  -- La OP hereda la condición interna de la oportunidad de origen.
  IF coalesce(v_es_interna, false) THEN
    UPDATE public.ordenes_produccion
    SET es_interna = true
    WHERE ordenes_produccion.id = v_orden_id;
  END IF;

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera una orden desde sus líneas (heredando la condición interna/TI) y marca ganada en una transacción; reconcilia reintentos. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Cobranza: una orden interna no admite apertura de AR (RFQ-09).
--    Misma firma que 20260814143339; se añade la lectura de es_interna y el
--    rechazo temprano tras validar existencia de la orden.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abrir_cuenta_por_cobrar(
  p_orden_id uuid,
  p_monto_total numeric,
  p_moneda text,
  p_tipo_cambio_origen numeric,
  p_fecha_vencimiento timestamptz,
  p_folio_factura_remision text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cliente_id uuid,
  saldo_pendiente numeric,
  moneda text,
  estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente_id uuid;
  v_estado_orden text;
  v_es_interna boolean;
BEGIN
  IF p_orden_id IS NULL
     OR p_monto_total IS NULL OR p_monto_total <= 0
     OR p_monto_total IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0
     OR p_tipo_cambio_origen IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_fecha_vencimiento IS NULL
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('USD', 'MXN') THEN
    RAISE EXCEPTION 'datos_cuenta_por_cobrar_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;

  SELECT orden.cliente_id, orden.estado, orden.es_interna
  INTO v_cliente_id, v_estado_orden, v_es_interna
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF coalesce(v_es_interna, false) THEN
    RAISE EXCEPTION 'orden_interna_sin_cobranza' USING ERRCODE = 'check_violation';
  END IF;

  IF v_estado_orden <> 'completada' OR EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_no_lista_para_cobranza' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.clientes AS cliente
  WHERE cliente.id = v_cliente_id
    AND cliente.estado = 'activo'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.cuentas_por_cobrar (
    orden_id, cliente_id, folio_factura_remision, monto_total, saldo_pendiente,
    moneda, tipo_cambio_origen, estado, fecha_vencimiento
  ) VALUES (
    p_orden_id, v_cliente_id, NULLIF(btrim(p_folio_factura_remision), ''),
    round(p_monto_total, 4), round(p_monto_total, 4), upper(trim(p_moneda)),
    round(p_tipo_cambio_origen, 4), 'pendiente', p_fecha_vencimiento
  )
  RETURNING
    cuentas_por_cobrar.id,
    cuentas_por_cobrar.cliente_id,
    cuentas_por_cobrar.saldo_pendiente,
    cuentas_por_cobrar.moneda,
    cuentas_por_cobrar.estado;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'cuenta_por_cobrar_ya_existe' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text) IS
  'Abre AR desde una OP completada y totalmente producida; rechaza órdenes internas (TI). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Dashboard ejecutivo: excluir RFQ internas de lo comercial y contar las
--    órdenes internas por separado. Reemplaza la versión de 20260916000001
--    (misma firma), conservando DAS-05 (tiempo de respuesta/%<=24h), DAS-02
--    (gastosTotal) y DAS-06 (distribucionGastoPorCategoria).
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
  v_actual jsonb;
  v_anterior jsonb;
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

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= p_fecha_inicio
      AND cuenta.fecha_emision < p_fecha_fin
  ), cotizado AS (
    -- Excluye trabajos internos: no son venta/cotizado comercial (DAS-01).
    SELECT COALESCE(SUM(linea.cantidad * linea.precio_unitario), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= p_fecha_inicio
      AND pipeline.creado_en < p_fecha_fin
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
    WHERE p.creado_en >= p_fecha_inicio
      AND p.creado_en < p_fecha_fin
      AND p.es_orden_interna = false
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= p_fecha_inicio
      AND orden.creado_en < p_fecha_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= p_fecha_inicio AND consumo.creado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= p_fecha_inicio AND sesion.actualizado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin), 0)::numeric AS gastos_total
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
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
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
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
          AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  INTO v_actual
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= v_anterior_inicio
      AND cuenta.fecha_emision < v_anterior_fin
  ), cotizado AS (
    SELECT COALESCE(SUM(linea.cantidad * linea.precio_unitario), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= v_anterior_inicio
      AND pipeline.creado_en < v_anterior_fin
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
    WHERE p.creado_en >= v_anterior_inicio
      AND p.creado_en < v_anterior_fin
      AND p.es_orden_interna = false
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= v_anterior_inicio
      AND orden.creado_en < v_anterior_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= v_anterior_inicio AND consumo.creado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= v_anterior_inicio AND sesion.actualizado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin), 0)::numeric AS gastos_total
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
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
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
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
          AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  INTO v_anterior
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;

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

COMMENT ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz) IS
  'Ventas comerciales (excluye trabajos internos), tiempo de respuesta y %<=24h, órdenes (incl. conteo de internas TI), finanzas con gasto del periodo y distribución por categoría, en MXN, para el intervalo y su periodo anterior.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  TO service_role;
