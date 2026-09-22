-- =============================================================================
-- A03 — La rentabilidad reconoce ingreso NETO (sin IVA) con fuente histórica.
--
-- Hallazgo (auditoría global 2026-09-22): `obtener_rentabilidad_orden` usaba
-- `cuentas_por_cobrar.monto_total`, que incluye IVA, así que la utilidad quedaba
-- inflada por el impuesto (venta 1160 / utilidad 660 donde D-11 pide 1000 / 500).
--
-- Principio de la corrección: **no se deriva el IVA dividiendo por la tasa
-- vigente**. El desglose se persiste cuando el documento comercial lo conoce y,
-- si no existe fuente inequívoca, el ingreso neto se representa como NO
-- CALCULABLE en lugar de inventar un número.
--
--   1. `cuentas_por_cobrar.monto_subtotal` / `monto_iva`: snapshot del desglose
--      en la MONEDA de la cuenta. NULL en ambos = desglose desconocido.
--   2. `aprobar_oportunidad_y_crear_orden` ya calculaba base e IVA para armar el
--      total (D-04): ahora los persiste. No cambia ningún importe existente ni la
--      inmutabilidad de la RFQ ni la regla D-04 (cobrable solo al entregar).
--   3. Reconciliación histórica SOLO cuando la cotización de origen reproduce
--      exactamente el total de la cuenta (misma moneda, diferencia ≤ 0.01). Las
--      cuentas manuales o sin coincidencia quedan en NULL = desconocido.
--   4. `obtener_rentabilidad_orden` devuelve venta neta, venta facturada e IVA;
--      si alguna cuenta del periodo carece de desglose, la venta neta, la
--      utilidad y el margen salen NULL con `venta_desglose_conocido = false`.
--
-- Aditiva e idempotente. La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Snapshot del desglose comercial en la cuenta.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS monto_subtotal numeric(12, 4);
ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS monto_iva numeric(12, 4);

COMMENT ON COLUMN public.cuentas_por_cobrar.monto_subtotal IS
  'A03: base gravable histórica en la moneda de la cuenta (descuentos ya restados); NULL = desglose desconocido, el ingreso neto no es calculable.';
COMMENT ON COLUMN public.cuentas_por_cobrar.monto_iva IS
  'A03: IVA histórico en la moneda de la cuenta; NULL = desglose desconocido. Nunca se recalcula con la tasa vigente.';

ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_desglose_iva_coherente;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_desglose_iva_coherente CHECK (
    (monto_subtotal IS NULL) = (monto_iva IS NULL)
    AND (
      monto_subtotal IS NULL
      OR (
        monto_subtotal >= 0
        AND monto_iva >= 0
        AND abs(monto_subtotal + monto_iva - monto_total) <= 0.01
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Reconciliación histórica con fuente inequívoca (cotización de origen).
--    Solo toca cuentas cuyo total coincide con el documento comercial.
-- -----------------------------------------------------------------------------
WITH comercial AS (
  SELECT
    cuenta.id AS cuenta_id,
    round(coalesce(sum(
      CASE WHEN linea.es_descuento THEN -1 ELSE 1 END
        * linea.cantidad * linea.precio_unitario
    ), 0), 2) AS base,
    max(pipeline.iva_porcentaje) AS iva_porcentaje,
    max(pipeline.moneda) AS moneda
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  INNER JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
  LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
  WHERE cuenta.monto_subtotal IS NULL
  GROUP BY cuenta.id
), calculado AS (
  SELECT
    comercial.cuenta_id,
    comercial.base,
    round(comercial.base * coalesce(comercial.iva_porcentaje, 16) / 100, 2) AS iva,
    CASE WHEN comercial.moneda = 'USD' THEN 'USD' ELSE 'MXN' END AS moneda
  FROM comercial
)
UPDATE public.cuentas_por_cobrar AS cuenta
SET
  monto_subtotal = calculado.base,
  monto_iva = calculado.iva
FROM calculado
WHERE cuenta.id = calculado.cuenta_id
  AND calculado.base > 0
  AND cuenta.moneda = calculado.moneda
  -- Mismo predicado que el CHECK `cuentas_por_cobrar_desglose_iva_coherente`:
  -- redondear `monto_total` (numeric(12,4)) admitiría hasta 0.015 de desviación
  -- real y el UPDATE abortaría la migración con check_violation.
  AND abs(calculado.base + calculado.iva - cuenta.monto_total) <= 0.01;

-- -----------------------------------------------------------------------------
-- 3. Aprobación comercial: persiste el desglose que ya calculaba.
--    Base: 20260921000001 (que a su vez extiende 20260919000005 / D-04).
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
  -- D-04: importe comercial congelado en la AR no cobrable.
  v_iva_porcentaje numeric(4, 2);
  v_moneda text;
  v_bruto numeric(18, 4);
  v_descuento numeric(18, 4);
  v_base numeric(18, 4);
  v_iva numeric(18, 4);
  v_total numeric(18, 4);
  v_tipo_cambio numeric(10, 4);
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad, es_orden_interna, iva_porcentaje, moneda
  INTO v_etapa, v_prioridad, v_es_interna, v_iva_porcentaje, v_moneda
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

  -- Solo las líneas fabricables se convierten en partidas: una línea de
  -- descuento (RFQ-03) es un concepto comercial y no se produce.
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
      -- OBS-04: el equipo/estación capturado en la cotización se hereda.
      'maquina_asignada', nullif(btrim(coalesce(linea.estacion_codigo, '')), ''),
      'area_trabajo_codigo', linea.area_trabajo_codigo,
      'procesos', to_jsonb(linea.procesos),
      'es_externo', linea.es_externo,
      'proveedor_externo', CASE
        WHEN linea.es_externo THEN linea.proveedor_externo
        ELSE NULL
      END
    )
    ORDER BY linea.orden, linea.id
  )
  INTO v_partidas
  FROM public.cotizacion_lineas AS linea
  WHERE linea.pipeline_id = p_pipeline_id
    AND linea.es_descuento = false;

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

  -- D-04: la AR puede nacer al aprobar, pero nace NO cobrable. Se activa al
  -- archivar la orden por entrega total (OBS-21). El importe usa las mismas
  -- reglas del documento comercial (descuento restado, IVA de la oportunidad)
  -- y la moneda/TC vigentes quedan congelados en la cuenta. Una cuenta fuera
  -- del rango de numeric(12,4) se omite igual que antes de D-04: la orden no
  -- se bloquea por un importe que el esquema de cobranza no admite.
  IF NOT coalesce(v_es_interna, false) THEN
    SELECT
      coalesce(sum(CASE WHEN linea.es_descuento THEN 0 ELSE linea.cantidad * linea.precio_unitario END), 0),
      coalesce(sum(CASE WHEN linea.es_descuento THEN linea.cantidad * linea.precio_unitario ELSE 0 END), 0)
    INTO v_bruto, v_descuento
    FROM public.cotizacion_lineas AS linea
    WHERE linea.pipeline_id = p_pipeline_id;

    v_base := round(v_bruto - v_descuento, 2);
    v_iva := round(v_base * coalesce(v_iva_porcentaje, 16) / 100, 2);
    v_total := round(v_base + v_iva, 2);

    IF v_total > 0 AND v_total <= 99999999.9999 THEN
      SELECT config.tipo_cambio_usd
      INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config
      LIMIT 1;

      IF v_moneda = 'USD' AND (v_tipo_cambio IS NULL OR v_tipo_cambio <= 0) THEN
        RAISE EXCEPTION 'tipo_cambio_usd_requerido' USING ERRCODE = 'check_violation';
      END IF;

      -- A03: el desglose viaja con la cuenta. Es la única fuente histórica del
      -- ingreso neto; nunca se reconstruye con la tasa de IVA vigente.
      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, monto_subtotal, monto_iva,
        saldo_pendiente, moneda, tipo_cambio_origen, estado,
        fecha_vencimiento, cobrable_desde
      ) VALUES (
        v_orden_id, p_cliente_id, round(v_total, 4), round(v_base, 4), round(v_iva, 4),
        round(v_total, 4),
        CASE WHEN v_moneda = 'USD' THEN 'USD' ELSE 'MXN' END,
        CASE WHEN v_moneda = 'USD' THEN round(v_tipo_cambio, 4) ELSE 1 END,
        'pendiente', NULL, NULL
      );
    END IF;
  END IF;

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera la orden desde sus líneas fabricables (heredando equipo/estación OBS-04) y le crea la AR no cobrable con el total comercial y su desglose base/IVA (D-04 + A03); excluye TI. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Rentabilidad sobre ingreso neto. Base: 20260921000003 (OBS-29).
--    La firma cambia (venta neta nullable + columnas de desglose): se recrea.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_rentabilidad_orden(uuid);

CREATE FUNCTION public.obtener_rentabilidad_orden(p_orden_id uuid)
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
