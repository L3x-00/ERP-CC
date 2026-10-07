-- =============================================================================
-- B9 (corrección de auditoría) — Utilización con la jornada del turno
-- Plan: docs/plan-erp-sii/09-estrategia-y-kpis.md §9.3 (decisión D2-A/D5-A).
--
-- Defecto: la utilización usaba `COALESCE(override, 8)` e ignoraba
-- `capacidades_recurso_turno`: un recurso configurado con turno de 4 h se
-- valoraba a 8 h, subestimando la utilización. Ahora: override > mayor
-- capacidad de turno del recurso > 8 h estándar (misma regla que Planeación y
-- que el umbral de horas extra en 20261007230003).
--
-- Se recrea `obtener_kpis_sii` sin cambiar firma ni claves JSON.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007230005).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.obtener_kpis_sii(
  p_inicio timestamptz,
  p_fin timestamptz,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_ejecutivo jsonb;
  v_vendido numeric := 0;
  v_enviadas integer := 0;
  v_cerradas integer := 0;
  v_seguimiento integer := 0;
  v_horas_reales numeric := 0;
  v_horas_estimadas numeric := 0;
  v_utilizacion numeric := 0;
  v_wip integer := 0;
  v_wip_costo numeric := 0;
  v_wip_sin_tarifa integer := 0;
  v_piezas integer := 0;
  v_retrabajos numeric := 0;
  v_scrap numeric := 0;
  v_no_conformidades integer := 0;
  v_venta_estimada numeric := 0;
  v_costo_estimado numeric := 0;
  v_margen_estimado numeric;
  v_margen_real numeric;
  v_cobros numeric := 0;
  v_aging_0_30 numeric := 0;
  v_aging_31_60 numeric := 0;
  v_aging_61_90 numeric := 0;
  v_aging_90 numeric := 0;
  v_promesas_vigentes integer := 0;
  v_promesas_cumplidas integer := 0;
  v_promesas_vencidas integer := 0;
BEGIN
  IF p_inicio IS NULL OR p_fin IS NULL OR p_actor_id IS NULL OR p_inicio >= p_fin
     OR p_fin - p_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_kpis_invalido' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
    OR privado.actor_con_permiso(p_actor_id, 'ver_clientes')
    OR privado.actor_con_permiso(p_actor_id, 'ver_pipeline_equipo')
    OR privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_planeacion')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_kpis' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ventas (§9.3): una venta se reconoce una vez por revisión cerrada; TI no
  -- vende. El TC congelado vive en el snapshot de la revisión.
  SELECT
    COALESCE(SUM(
      CASE WHEN item.es_descuento THEN -item.cantidad * item.precio_unitario
           ELSE item.cantidad * item.precio_unitario END
      * COALESCE((revision.snapshot_cabecera ->> 'tipo_cambio')::numeric, 1)
    ), 0)
  INTO v_vendido
  FROM public.propuesta_revisiones AS revision
  JOIN public.propuestas AS propuesta ON propuesta.id = revision.propuesta_id
  JOIN public.pipeline AS rfq ON rfq.id = propuesta.rfq_id
  JOIN public.propuesta_items AS item ON item.revision_id = revision.id AND item.activo
  WHERE revision.estado = 'SALE_CONFIRMED'
    AND COALESCE(rfq.es_orden_interna, false) = false
    AND EXISTS (
      SELECT 1 FROM public.propuesta_revision_eventos AS evento
      WHERE evento.revision_id = revision.id
        AND evento.estado_nuevo = 'SALE_CONFIRMED'
        AND evento.creado_en >= p_inicio AND evento.creado_en < p_fin
    );

  SELECT
    COUNT(*) FILTER (WHERE evento.estado_nuevo = 'SENT'),
    COUNT(*) FILTER (WHERE evento.estado_nuevo IN ('ACCEPTED', 'SALE_CONFIRMED'))
  INTO v_enviadas, v_cerradas
  FROM public.propuesta_revision_eventos AS evento
  WHERE evento.creado_en >= p_inicio AND evento.creado_en < p_fin;

  SELECT COUNT(*) INTO v_seguimiento
  FROM public.propuestas AS propuesta
  JOIN public.propuesta_revisiones AS revision ON revision.id = propuesta.revision_vigente_id
  WHERE revision.estado IN ('SENT', 'FOLLOW_UP');

  SELECT COALESCE(SUM(sesion.horas_netas), 0)
  INTO v_horas_reales
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
    AND sesion.fecha_inicio >= p_inicio AND sesion.fecha_inicio < p_fin;

  SELECT COALESCE(SUM(partida.tiempo_estimado_minutos) / 60.0, 0)
  INTO v_horas_estimadas
  FROM public.partidas_orden_produccion AS partida
  WHERE EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = partida.id
      AND sesion.fecha_inicio >= p_inicio AND sesion.fecha_inicio < p_fin
  );

  -- Utilización por máquina (D2-A): horas reales ÷ capacidad nominal del periodo
  -- con la jornada del turno (override > capacidad del turno > 8 h estándar).
  -- (equipos × jornada efectiva por recurso activo × días del rango).
  SELECT COALESCE(SUM(
    recurso.cantidad_equipos
    * COALESCE(
        recurso.capacidad_jornada_override_horas,
        (
          SELECT max(capacidad.horas_capacidad)
          FROM public.capacidades_recurso_turno AS capacidad
          WHERE capacidad.recurso_id = recurso.id
        ),
        8
      )
  ), 0)
  INTO v_utilizacion
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.activo;

  v_utilizacion := CASE
    WHEN v_utilizacion <= 0 THEN 0
    ELSE round(
      v_horas_reales / (v_utilizacion * GREATEST(EXTRACT(EPOCH FROM (p_fin - p_inicio)) / 86400.0, 1)) * 100,
      4)
  END;

  -- WIP: órdenes en producción sin cierre administrativo, valoradas a costo
  -- estimado (horas estimadas × tarifa interna más reciente del recurso).
  SELECT
    COUNT(DISTINCT orden.id),
    COALESCE(SUM(
      partida.tiempo_estimado_minutos / 60.0 * COALESCE(tarifa.costo, 0)
    ), 0),
    COUNT(DISTINCT partida.id) FILTER (WHERE COALESCE(tarifa.costo, 0) = 0)
  INTO v_wip, v_wip_costo, v_wip_sin_tarifa
  FROM public.ordenes_produccion AS orden
  JOIN public.partidas_orden_produccion AS partida ON partida.orden_id = orden.id
  LEFT JOIN LATERAL (
    SELECT sesion.costo_hora_interno AS costo
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = partida.id
    ORDER BY sesion.creado_en DESC
    LIMIT 1
  ) AS tarifa ON true
  WHERE orden.estado_sii IN ('EN_PRODUCCION', 'PRODUCCION_COMPLETADA')
    AND orden.cerrada_admin_en IS NULL;

  -- Piezas producidas: cantidad final acumulada de partidas con actividad real
  -- (los avances por proceso no suman piezas de KPI).
  SELECT COALESCE(SUM(partida.cantidad_producida), 0)
  INTO v_piezas
  FROM public.partidas_orden_produccion AS partida
  WHERE EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = partida.id
      AND sesion.fecha_inicio >= p_inicio AND sesion.fecha_inicio < p_fin
  );

  SELECT
    COALESCE(SUM(inspeccion.cantidad_retrabajo), 0),
    COUNT(*) FILTER (WHERE inspeccion.resultado = 'RECHAZADA')
  INTO v_retrabajos, v_no_conformidades
  FROM public.inspecciones_calidad AS inspeccion
  WHERE inspeccion.creado_en >= p_inicio AND inspeccion.creado_en < p_fin;

  SELECT COALESCE(SUM(inspeccion.cantidad_nok), 0) + COALESCE((
    SELECT SUM(partida.cantidad_scrap)
    FROM public.partidas_orden_produccion AS partida
    WHERE EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.partida_id = partida.id
        AND sesion.fecha_inicio >= p_inicio AND sesion.fecha_inicio < p_fin
    )
  ), 0)
  INTO v_scrap
  FROM public.inspecciones_calidad AS inspeccion
  WHERE inspeccion.creado_en >= p_inicio AND inspeccion.creado_en < p_fin;

  -- Rentabilidad: margen estimado de la revisión aceptada vs margen real del
  -- ejecutivo (AR cobrable − costos reales) en el mismo rango.
  SELECT
    COALESCE(SUM(
      CASE WHEN item.es_descuento THEN -item.cantidad * item.precio_unitario
           ELSE item.cantidad * item.precio_unitario END
      * COALESCE((revision.snapshot_cabecera ->> 'tipo_cambio')::numeric, 1)
    ), 0)
  INTO v_venta_estimada
  FROM public.propuesta_revisiones AS revision
  JOIN public.propuesta_items AS item ON item.revision_id = revision.id AND item.activo
  WHERE revision.estado IN ('ACCEPTED', 'SALE_CONFIRMED')
    AND EXISTS (
      SELECT 1 FROM public.propuesta_revision_eventos AS evento
      WHERE evento.revision_id = revision.id
        AND evento.estado_nuevo IN ('ACCEPTED', 'SALE_CONFIRMED')
        AND evento.creado_en >= p_inicio AND evento.creado_en < p_fin
    );

  SELECT COALESCE(SUM(costo.monto), 0)
  INTO v_costo_estimado
  FROM public.propuesta_revision_costos AS costo
  JOIN public.propuesta_revisiones AS revision ON revision.id = costo.revision_id
  WHERE revision.estado IN ('ACCEPTED', 'SALE_CONFIRMED')
    AND EXISTS (
      SELECT 1 FROM public.propuesta_revision_eventos AS evento
      WHERE evento.revision_id = revision.id
        AND evento.estado_nuevo IN ('ACCEPTED', 'SALE_CONFIRMED')
        AND evento.creado_en >= p_inicio AND evento.creado_en < p_fin
    );

  v_margen_estimado := CASE
    WHEN v_venta_estimada > 0 THEN round((v_venta_estimada - v_costo_estimado) / v_venta_estimada * 100, 4)
    ELSE NULL
  END;

  v_ejecutivo := privado.metricas_ejecutivas_rango(p_inicio, p_fin, now());
  v_margen_real := NULLIF(v_ejecutivo -> 'ventas' ->> 'margenPromedioPorcentaje', '')::numeric;

  -- Cobranza: pagos vigentes (sin reverso) del periodo; la transferencia
  -- interna no es cobro. Aging sobre cuentas cobrables vencidas por tramos.
  SELECT COALESCE(SUM(
    pago.monto_pagado
    * CASE WHEN pago.moneda_pago = 'MXN' THEN 1 ELSE pago.tipo_cambio_pago END
  ), 0)
  INTO v_cobros
  FROM public.pagos_ar AS pago
  WHERE pago.creado_en >= p_inicio AND pago.creado_en < p_fin
    AND NOT EXISTS (
      SELECT 1 FROM public.reversos_pago_ar AS reverso WHERE reverso.pago_id = pago.id
    );

  SELECT
    COALESCE(SUM(CASE WHEN edad <= 30 THEN saldo END), 0),
    COALESCE(SUM(CASE WHEN edad > 30 AND edad <= 60 THEN saldo END), 0),
    COALESCE(SUM(CASE WHEN edad > 60 AND edad <= 90 THEN saldo END), 0),
    COALESCE(SUM(CASE WHEN edad > 90 THEN saldo END), 0)
  INTO v_aging_0_30, v_aging_31_60, v_aging_61_90, v_aging_90
  FROM (
    SELECT cuenta.saldo_pendiente
      * CASE WHEN cuenta.moneda = 'MXN' THEN 1 ELSE cuenta.tipo_cambio_origen END AS saldo,
      GREATEST(EXTRACT(EPOCH FROM (now() - cuenta.fecha_vencimiento)) / 86400.0, 0) AS edad
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado IN ('pendiente', 'parcial')
      AND cuenta.cobrable_desde IS NOT NULL
      AND cuenta.fecha_vencimiento IS NOT NULL
      AND cuenta.fecha_vencimiento < now()
  ) AS vencidas;

  SELECT
    COUNT(*) FILTER (WHERE promesa.estado = 'VIGENTE'),
    COUNT(*) FILTER (WHERE promesa.estado = 'CUMPLIDA'),
    COUNT(*) FILTER (WHERE promesa.estado = 'VENCIDA')
  INTO v_promesas_vigentes, v_promesas_cumplidas, v_promesas_vencidas
  FROM public.promesas_pago AS promesa;

  RETURN jsonb_build_object(
    'ventas', jsonb_build_object(
      'vendidoMxn', round(v_vendido, 4),
      'tasaCierrePorcentaje', CASE WHEN v_enviadas > 0
        THEN round(v_cerradas::numeric / v_enviadas * 100, 4) ELSE 0 END,
      'propuestasEnSeguimiento', v_seguimiento
    ),
    'produccion', jsonb_build_object(
      'horasReales', round(v_horas_reales, 4),
      'horasEstimadas', round(v_horas_estimadas, 4),
      'utilizacionPorcentaje', v_utilizacion,
      'wipOrdenes', v_wip,
      'wipCostoEstimadoMxn', round(v_wip_costo, 4),
      'wipPartidasSinTarifa', v_wip_sin_tarifa,
      'piezasProducidas', round(v_piezas, 4)
    ),
    'calidad', jsonb_build_object(
      'retrabajos', round(v_retrabajos, 4),
      'scrap', round(v_scrap, 4),
      'noConformidades', v_no_conformidades
    ),
    'rentabilidad', jsonb_build_object(
      'margenEstimadoPorcentaje', v_margen_estimado,
      'margenRealPorcentaje', v_margen_real,
      'ventaNetaMxn', COALESCE((v_ejecutivo -> 'ventas' ->> 'ventaNetaMxn')::numeric, 0),
      'utilidadNetaMxn', COALESCE((v_ejecutivo -> 'finanzas' ->> 'utilidadNetaAcumulada')::numeric, 0)
    ),
    'cobranza', jsonb_build_object(
      'cobrosPeriodoMxn', round(v_cobros, 4),
      'aging', jsonb_build_object(
        'dias0a30', round(v_aging_0_30, 4),
        'dias31a60', round(v_aging_31_60, 4),
        'dias61a90', round(v_aging_61_90, 4),
        'dias90mas', round(v_aging_90, 4)
      ),
      'promesas', jsonb_build_object(
        'vigentes', v_promesas_vigentes,
        'cumplidas', v_promesas_cumplidas,
        'vencidas', v_promesas_vencidas
      )
    )
  );
END;
$function$;
COMMENT ON FUNCTION public.obtener_kpis_sii(timestamptz, timestamptz, uuid) IS
'SII-B9: diccionario §9.3 — ventas, producción, calidad, rentabilidad y cobranza sin doble conteo (TI aparte); utilización con la jornada del turno (D2-A). Solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_kpis_sii(timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_sii(timestamptz, timestamptz, uuid)
  TO service_role;