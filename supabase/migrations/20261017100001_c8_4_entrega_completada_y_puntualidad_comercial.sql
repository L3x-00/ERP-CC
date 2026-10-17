-- C8.4 — Entrega solo tras Producción completada (O-08 «No», respuesta 2026-10-15)
--      y puntualidad contra el compromiso comercial (O-06 A).
--
-- Contrato:
--   * `registrar_entrega` solo acepta órdenes `PRODUCCION_COMPLETADA`: no se
--     entrega nada mientras la orden está `EN_PRODUCCION`. Los parciales y la
--     nota total siguen permitidos después de producir; la UI bloquea antes.
--     `CERRADA`, `CONFIRMADA`, `PLANIFICADA` y `LISTA` siguen rechazadas con el
--     mismo error `orden_no_entregable` (código 23514).
--   * El Dashboard («atrasadas» y «en riesgo») mide contra
--     `fecha_compromiso_comercial` (promesa inmutable al cliente, C4.2/DC-10)
--     en `privado.metricas_ejecutivas_rango` y
--     `public.obtener_metricas_pipeline_equipo`; deja de usar el espejo
--     operativo `fecha_compromiso`, que se mueve con la reprogramación interna.
--     Órdenes internas sin compromiso comercial no cuentan (fecha NULL).
--   * Idempotente: CREATE OR REPLACE con la misma firma y privileges intactos.
--     Aplicar SOLO local; el remoto lo aplica el PO.

-- -----------------------------------------------------------------------------
-- 1. registrar_entrega: exige PRODUCCION_COMPLETADA (O-08 «No»)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_entrega(
  p_orden_id uuid,
  p_renglones jsonb,
  p_recibido_por text,
  p_contacto_id uuid DEFAULT NULL,
  p_entregado_por uuid DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_nota public.notas_entrega%ROWTYPE;
  v_existente public.notas_entrega%ROWTYPE;
  v_recibido text;
  v_entregado_por uuid;
  v_cantidad_renglones integer;
  v_renglones integer;
  v_folio_legacy text;
  v_es_parcial boolean;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'entrega_generar') THEN
    RAISE EXCEPTION 'sin_permiso_entrega' USING ERRCODE = '42501';
  END IF;

  v_recibido := btrim(coalesce(p_recibido_por, ''));
  IF p_orden_id IS NULL
     OR char_length(v_recibido) NOT BETWEEN 3 AND 120
     OR p_renglones IS NULL
     OR jsonb_typeof(p_renglones) <> 'array'
     OR jsonb_array_length(p_renglones) = 0
     OR jsonb_array_length(p_renglones) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_cantidad_renglones
  FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_renglones <> jsonb_array_length(p_renglones)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
       WHERE entrada.partida_id IS NULL
          OR entrada.cantidad_entregada IS NULL
          OR entrada.cantidad_entregada <= 0
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT entrada.partida_id
         FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
         GROUP BY entrada.partida_id
         HAVING count(*) > 1
       ) AS duplicada
     ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = '23514';
  END IF;

  v_entregado_por := coalesce(p_entregado_por, p_actor);

  -- Orden de locks vigente: partidas (UUID ascendente) → orden → usuarios.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_renglones THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada' USING ERRCODE = '22023';
  END IF;
  -- O-08 «No» (2026-10-15): primero se produce, después se entrega.
  IF v_orden.estado_sii <> 'PRODUCCION_COMPLETADA' THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;

  PERFORM 1
  FROM public.usuarios AS entregador
  WHERE entregador.id = v_entregado_por AND entregador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entregador_no_activo' USING ERRCODE = '23514';
  END IF;

  IF p_contacto_id IS NOT NULL THEN
    PERFORM 1
    FROM public.contactos_cliente AS contacto
    WHERE contacto.id = p_contacto_id
      AND contacto.cliente_id = v_orden.cliente_id
      AND contacto.activo = true
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'contacto_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Idempotencia bajo lock: la misma solicitud devuelve la nota existente.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_producida, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_producida
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_pendiente' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  v_folio_legacy := public.generar_folio_nota_entrega('NE');

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, recibido_por, recibido_por_id,
    entregado_por_id, solicitud_id, creado_por
  ) VALUES (
    v_folio_legacy, p_orden_id, v_es_parcial, v_recibido, p_contacto_id,
    v_entregado_por, p_solicitud_id, p_actor
  )
  RETURNING * INTO v_nota;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, codigo_item, cantidad_solicitada, cantidad_entregada
  )
  SELECT v_nota.id, partida.id, partida.codigo_item, partida.cantidad_solicitada, entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;
  GET DIAGNOSTICS v_renglones = ROW_COUNT;

  RETURN jsonb_build_object(
    'notaId', v_nota.id,
    'folio', v_nota.folio,
    'folioSii', v_nota.folio_sii,
    'esParcial', v_nota.es_parcial,
    'creadoEn', v_nota.creado_en,
    'renglones', v_renglones,
    'yaExistia', false
  );
EXCEPTION WHEN unique_violation THEN
  -- Carrera de `solicitud_id` entre dos llamadas concurrentes: la perdedora
  -- devuelve la nota ganadora. Otros choques (folio) se propagan.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid) IS
  'SII-B7.1 / O-08: registra una entrega parcial/total por ITxx SOLO con PRODUCCION_COMPLETADA; folio NE-MMYY_XX-YY, idempotente por solicitud_id, locks partidas→orden→usuarios. Dispara archivo y activación de AR al cubrir el 100 %. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. Puntualidad contra el compromiso comercial (O-06 A)
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
-- 3. Dashboard de equipo: mismo cambio de fuente temporal (contado y anterior)
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
           WHERE orden.fecha_compromiso_comercial < v_ahora
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso_comercial >= v_ahora
             AND orden.fecha_compromiso_comercial < v_ahora + interval '3 days'
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
           WHERE orden.fecha_compromiso_comercial < v_ahora
             AND orden.estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso_comercial >= v_ahora
             AND orden.fecha_compromiso_comercial < v_ahora + interval '3 days'
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
