-- =============================================================================
-- Auditoría 2026-09-11 — Aging y CxP del periodo anterior en Dashboard.
--
-- Hallazgo: `obtener_metricas_contador` reportaba el aging del periodo anterior
-- como todo vencido en el bucket >90 y CxP por vencer/vencido en cero. El
-- comparativo financiero era sintético. Se replican los mismos FILTER del
-- periodo actual, referidos a `v_anterior_fin`, y se limitan las filas a las
-- cuentas/gastos que ya existían en ese corte (`creado_en < v_anterior_fin`).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.obtener_metricas_contador(
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
    RAISE EXCEPTION 'rango_contador_invalido' USING ERRCODE = 'check_violation';
  END IF;
  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  WITH pagos AS (
    SELECT COALESCE(SUM(pago.monto_pagado * pago.tipo_cambio_pago), 0)::numeric AS cobrado
    FROM public.pagos_ar AS pago
    WHERE pago.creado_en >= p_fecha_inicio AND pago.creado_en < p_fecha_fin
  ), cartera AS (
    SELECT
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS pendiente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora
      ), 0)::numeric AS vencido,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento >= v_ahora
      ), 0)::numeric AS corriente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora
          AND cuenta.fecha_vencimiento >= v_ahora - interval '30 days'
      ), 0)::numeric AS uno_treinta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '30 days'
          AND cuenta.fecha_vencimiento >= v_ahora - interval '60 days'
      ), 0)::numeric AS treinta_sesenta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '60 days'
          AND cuenta.fecha_vencimiento >= v_ahora - interval '90 days'
      ), 0)::numeric AS sesenta_noventa,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '90 days'
      ), 0)::numeric AS mayor_noventa
    FROM public.cuentas_por_cobrar AS cuenta
  ), cxp AS (
    SELECT
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS pendiente,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.fecha_vencimiento >= v_ahora), 0)::numeric AS por_vencer,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.fecha_vencimiento < v_ahora), 0)::numeric AS vencido
    FROM public.gastos AS gasto
  ), salidas AS (
    SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)::numeric AS monto
    FROM public.gastos AS gasto
    WHERE gasto.estado_pago <> 'cancelado'
      AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin
  )
  SELECT jsonb_build_object(
    'cobranza', jsonb_build_object(
      'cobradoMxn', round(pagos.cobrado, 4),
      'arPendienteMxn', round(cartera.pendiente, 4),
      'arVencidoMxn', round(cartera.vencido, 4)
    ),
    'aging', jsonb_build_object(
      'corrienteMxn', round(cartera.corriente, 4),
      'unoTreintaMxn', round(cartera.uno_treinta, 4),
      'treintaSesentaMxn', round(cartera.treinta_sesenta, 4),
      'sesentaNoventaMxn', round(cartera.sesenta_noventa, 4),
      'mayorNoventaMxn', round(cartera.mayor_noventa, 4)
    ),
    'cxp', jsonb_build_object(
      'pendienteMxn', round(cxp.pendiente, 4),
      'porVencerMxn', round(cxp.por_vencer, 4),
      'vencidoMxn', round(cxp.vencido, 4)
    ),
    'flujoCaja', jsonb_build_object(
      'entradasMxn', round(pagos.cobrado, 4),
      'salidasMxn', round(salidas.monto, 4),
      'netoMxn', round(pagos.cobrado - salidas.monto, 4)
    )
  )
  INTO v_actual
  FROM pagos, cartera, cxp, salidas;

  WITH pagos AS (
    SELECT COALESCE(SUM(pago.monto_pagado * pago.tipo_cambio_pago), 0)::numeric AS cobrado
    FROM public.pagos_ar AS pago
    WHERE pago.creado_en >= v_anterior_inicio AND pago.creado_en < v_anterior_fin
  ), salidas AS (
    SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)::numeric AS monto
    FROM public.gastos AS gasto
    WHERE gasto.estado_pago <> 'cancelado'
      AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin
  ), cartera AS (
    SELECT
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
      ), 0)::numeric AS pendiente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento < v_anterior_fin
      ), 0)::numeric AS vencido,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento >= v_anterior_fin
      ), 0)::numeric AS corriente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento < v_anterior_fin
          AND cuenta.fecha_vencimiento >= v_anterior_fin - interval '30 days'
      ), 0)::numeric AS uno_treinta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento < v_anterior_fin - interval '30 days'
          AND cuenta.fecha_vencimiento >= v_anterior_fin - interval '60 days'
      ), 0)::numeric AS treinta_sesenta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento < v_anterior_fin - interval '60 days'
          AND cuenta.fecha_vencimiento >= v_anterior_fin - interval '90 days'
      ), 0)::numeric AS sesenta_noventa,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.creado_en < v_anterior_fin
          AND cuenta.fecha_vencimiento < v_anterior_fin - interval '90 days'
      ), 0)::numeric AS mayor_noventa
    FROM public.cuentas_por_cobrar AS cuenta
  ), cxp AS (
    SELECT
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.creado_en < v_anterior_fin), 0)::numeric AS pendiente,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.creado_en < v_anterior_fin
          AND gasto.fecha_vencimiento >= v_anterior_fin), 0)::numeric AS por_vencer,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.creado_en < v_anterior_fin
          AND gasto.fecha_vencimiento < v_anterior_fin), 0)::numeric AS vencido
    FROM public.gastos AS gasto
  )
  SELECT jsonb_build_object(
    'cobranza', jsonb_build_object(
      'cobradoMxn', round(pagos.cobrado, 4),
      'arPendienteMxn', round(cartera.pendiente, 4),
      'arVencidoMxn', round(cartera.vencido, 4)
    ),
    'aging', jsonb_build_object(
      'corrienteMxn', round(cartera.corriente, 4),
      'unoTreintaMxn', round(cartera.uno_treinta, 4),
      'treintaSesentaMxn', round(cartera.treinta_sesenta, 4),
      'sesentaNoventaMxn', round(cartera.sesenta_noventa, 4),
      'mayorNoventaMxn', round(cartera.mayor_noventa, 4)
    ),
    'cxp', jsonb_build_object(
      'pendienteMxn', round(cxp.pendiente, 4),
      'porVencerMxn', round(cxp.por_vencer, 4),
      'vencidoMxn', round(cxp.vencido, 4)
    ),
    'flujoCaja', jsonb_build_object(
      'entradasMxn', round(pagos.cobrado, 4),
      'salidasMxn', round(salidas.monto, 4),
      'netoMxn', round(pagos.cobrado - salidas.monto, 4)
    )
  )
  INTO v_anterior
  FROM pagos, cartera, cxp, salidas;

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

COMMENT ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz) IS
  'Consolida CxC, aging por buckets, CxP y flujo de caja para Contabilidad; periodo anterior con los mismos cortes.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz)
  TO service_role;
