-- =============================================================================
-- C10.2/F01-F05/F07 — Conciliación por Orden: Estimado / Comprometido / Real.
--
-- Decisiones del cliente que mandan (PLAN-REVISADO 2026-10-15):
--   * F-01 A: el Material real es SIEMPRE el consumo de Producción; la compra
--     de material no se suma al real (solo al comprometido).
--   * F-02: PAGADA sin recepción NO es real. Se añade `compras.recibida_en`,
--     que se congela al pasar a RECIBIDA; así una PAGADA directa desde
--     CONFIRMADA no cuenta como real.
--   * F-04: el margen estimado usa la venta de la Propuesta aceptada (snapshot
--     de la Orden); el margen real usa la venta de la AR (subtotal sin IVA),
--     aunque todavía no sea cobrable. C10.2b la cambiará a venta facturada.
--   * F-05: subcontratación se estima y se compara con gastos maquila_externa
--     y compras con rubro subcontratacion.
--
-- La función es de solo lectura: no escribe, no crea tablas ni RLS.
-- Aplicar SOLO local; el PO la aplica en remoto ANTES del despliegue.
-- =============================================================================

-- 0. Recepción explícita de la compra (F-02). Nullable para históricas.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS recibida_en timestamptz;

COMMENT ON COLUMN public.compras.recibida_en IS
  'C10.2/F-02: momento en que la compra pasó a RECIBIDA. Una PAGADA directa desde CONFIRMADA conserva NULL y no cuenta como real.';

-- Se recrea cambiar_estado_compra con la misma firma para congelar la recepción.
CREATE OR REPLACE FUNCTION public.cambiar_estado_compra(
  p_compra_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_estado_destino text,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_destino text := upper(trim(coalesce(p_estado_destino, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_destino NOT IN ('CONFIRMADA', 'RECIBIDA', 'CANCELADA')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'compra_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_destino = 'CONFIRMADA' THEN
    IF v_compra.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
  ELSIF v_destino = 'RECIBIDA' THEN
    IF v_compra.estado <> 'CONFIRMADA' THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
  ELSE
    IF v_compra.estado NOT IN ('BORRADOR', 'CONFIRMADA') THEN
      RAISE EXCEPTION 'transicion_compra_invalida' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
    END IF;
    IF v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 300 THEN
      RAISE EXCEPTION 'motivo_cancelacion_invalido' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pagos_compra AS pago WHERE pago.compra_id = p_compra_id) THEN
      RAISE EXCEPTION 'compra_con_pagos' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.compras AS compra
  SET
    estado = v_destino,
    recibida_en = CASE WHEN v_destino = 'RECIBIDA'
      THEN COALESCE(compra.recibida_en, now()) ELSE compra.recibida_en END,
    motivo_cancelacion = CASE WHEN v_destino = 'CANCELADA' THEN v_motivo ELSE compra.motivo_cancelacion END,
    cancelada_en = CASE WHEN v_destino = 'CANCELADA' THEN now() ELSE compra.cancelada_en END
  WHERE compra.id = p_compra_id
  RETURNING compra.id, compra.estado, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid) IS
  'SII-B8 F4 + C10.2: confirma, recibe (congela recibida_en) o cancela una compra; solo service_role.';

REVOKE ALL ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_compra(uuid, timestamptz, text, text, uuid, uuid)
  TO service_role;

-- 1. Conciliación (solo lectura).
CREATE OR REPLACE FUNCTION public.obtener_conciliacion_costos_orden(p_orden_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_es_interna boolean;
  v_tiene_estimado boolean;
  v_tc_snapshot numeric := 1;
  v_venta_estimado numeric;
  v_venta_real numeric;
  v_estimado_total numeric;
  v_est_material numeric;
  v_est_fabricacion numeric;
  v_est_subcontratacion numeric;
  v_est_gastos numeric;
  v_comp_material numeric := 0;
  v_comp_subcontratacion numeric := 0;
  v_comp_gastos numeric := 0;
  v_comp_sin_rubro_n integer := 0;
  v_comp_sin_rubro_importe numeric := 0;
  v_comp_pagadas_sin_recepcion_n integer := 0;
  v_comp_pagadas_sin_recepcion_importe numeric := 0;
  v_real_material numeric := 0;
  v_real_fabricacion numeric := 0;
  v_real_subcontratacion numeric := 0;
  v_real_gastos numeric := 0;
  v_real_sub_gastos numeric := 0;
  v_real_sub_compras numeric := 0;
  v_real_gastos_gastos numeric := 0;
  v_real_gastos_compras numeric := 0;
  v_gastos_incluidos_n integer := 0;
  v_gastos_incluidos_importe numeric := 0;
  v_real_total numeric;
  v_margen_estimado numeric;
  v_margen_real numeric;
  v_variacion_total numeric;
  v_variacion_total_pct numeric;
BEGIN
  IF p_orden_id IS NULL THEN
    RAISE EXCEPTION 'orden_id_requerido' USING ERRCODE = 'null_value_not_allowed';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  v_es_interna := COALESCE(v_orden.es_interna, false);
  v_tiene_estimado := v_orden.propuesta_revision_id IS NOT NULL;
  v_tc_snapshot := COALESCE(
    (v_orden.snapshot_json -> 'totales' ->> 'tipo_cambio')::numeric, 1);

  -- Venta base estimada: snapshot de la Propuesta aceptada, sin IVA.
  v_venta_estimado := (v_orden.snapshot_json -> 'totales' ->> 'subtotal')::numeric
    * v_tc_snapshot;

  -- Venta base real: subtotal de la AR (sin IVA), aunque no sea cobrable.
  -- Si alguna AR no tiene desglose o TC histórico, el margen no es calculable.
  SELECT
    CASE WHEN COUNT(*) FILTER (
      WHERE cuenta.monto_subtotal IS NULL OR cuenta.tipo_cambio_origen IS NULL
    ) > 0 THEN NULL
    ELSE COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_subtotal
           ELSE cuenta.monto_subtotal * cuenta.tipo_cambio_origen END
    ), 0)
    END
  INTO v_venta_real
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
    AND cuenta.estado <> 'cancelado';

  -- Estimado por categoría desde la revisión aceptada (congelada).
  IF v_tiene_estimado THEN
    SELECT
      COALESCE(SUM(costo.monto) FILTER (WHERE costo.categoria = 'material'), 0),
      COALESCE(SUM(costo.monto) FILTER (WHERE costo.categoria = 'subcontratacion'), 0),
      COALESCE(SUM(costo.monto) FILTER (WHERE costo.categoria = 'gastos_directos'), 0)
    INTO v_est_material, v_est_subcontratacion, v_est_gastos
    FROM public.propuesta_revision_costos AS costo
    WHERE costo.revision_id = v_orden.propuesta_revision_id;

    v_est_material := round(v_est_material * v_tc_snapshot, 4);
    v_est_subcontratacion := round(v_est_subcontratacion * v_tc_snapshot, 4);
    v_est_gastos := round(v_est_gastos * v_tc_snapshot, 4);

    v_estimado_total := round(
      COALESCE((public.calcular_totales_revision(v_orden.propuesta_revision_id)
        ->> 'costoTotal')::numeric, 0) * v_tc_snapshot, 4);
    -- Fabricación = total de la Propuesta menos los rubros ya separados:
    -- así maquina, mano_obra y ruteo quedan en fabricación y la suma cuadra.
    v_est_fabricacion := round(v_estimado_total - v_est_material
      - v_est_subcontratacion - v_est_gastos, 4);
  END IF;

  -- Comprometido: compras con Orden confirmadas, recibidas o pagadas.
  SELECT
    COALESCE(SUM(CASE WHEN compra.rubro_costo = 'material' THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0),
    COALESCE(SUM(CASE WHEN compra.rubro_costo = 'subcontratacion' THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0),
    COALESCE(SUM(CASE WHEN compra.rubro_costo = 'gastos_directos' THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0),
    COUNT(*) FILTER (WHERE compra.rubro_costo IS NULL),
    COALESCE(SUM(CASE WHEN compra.rubro_costo IS NULL THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0),
    COUNT(*) FILTER (WHERE compra.estado = 'PAGADA' AND compra.recibida_en IS NULL),
    COALESCE(SUM(CASE WHEN compra.estado = 'PAGADA' AND compra.recibida_en IS NULL THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0)
  INTO v_comp_material, v_comp_subcontratacion, v_comp_gastos,
    v_comp_sin_rubro_n, v_comp_sin_rubro_importe,
    v_comp_pagadas_sin_recepcion_n, v_comp_pagadas_sin_recepcion_importe
  FROM public.compras AS compra
  WHERE compra.orden_id = p_orden_id
    AND compra.estado IN ('CONFIRMADA', 'RECIBIDA', 'PAGADA');

  v_comp_material := round(v_comp_material, 4);
  v_comp_subcontratacion := round(v_comp_subcontratacion, 4);
  v_comp_gastos := round(v_comp_gastos, 4);

  -- Real de compras de servicios: RECIBIDA o PAGADA con recepción congelada.
  -- Material nunca se suma aquí: F-01 A manda el consumo de Producción.
  SELECT
    COALESCE(SUM(CASE WHEN compra.rubro_costo = 'subcontratacion' THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0),
    COALESCE(SUM(CASE WHEN compra.rubro_costo = 'gastos_directos' THEN
      compra.monto_subtotal * CASE WHEN compra.moneda = 'MXN' THEN 1 ELSE compra.tipo_cambio END
    END), 0)
  INTO v_real_sub_compras, v_real_gastos_compras
  FROM public.compras AS compra
  WHERE compra.orden_id = p_orden_id
    AND (compra.estado = 'RECIBIDA'
      OR (compra.estado = 'PAGADA' AND compra.recibida_en IS NOT NULL));

  -- Real de Material: consumo real de Producción, valuado al costo congelado.
  SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
    * consumo.costo_unitario_momento), 0)
  INTO v_real_material
  FROM public.registros_consumo_material AS consumo
  INNER JOIN public.partidas_orden_produccion AS partida
    ON partida.id = consumo.partida_id
  WHERE partida.orden_id = p_orden_id;

  -- Real de Fabricación: horas netas de sesiones pausadas/finalizadas.
  SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
  INTO v_real_fabricacion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion IN ('pausada', 'finalizada');

  -- Real de gastos: maquila_externa a subcontratación; el resto a gastos
  -- directos. materia_prima/nomina no suman y se avisan.
  SELECT
    COALESCE(SUM(CASE WHEN gasto.categoria = 'maquila_externa' THEN
      gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
    END), 0),
    COALESCE(SUM(CASE WHEN gasto.categoria NOT IN ('materia_prima', 'nomina', 'maquila_externa') THEN
      gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
    END), 0),
    COUNT(*) FILTER (WHERE gasto.categoria IN ('materia_prima', 'nomina')),
    COALESCE(SUM(CASE WHEN gasto.categoria IN ('materia_prima', 'nomina') THEN
      gasto.monto_subtotal * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
    END), 0)
  INTO v_real_sub_gastos, v_real_gastos_gastos, v_gastos_incluidos_n, v_gastos_incluidos_importe
  FROM public.gastos AS gasto
  WHERE gasto.orden_id = p_orden_id
    AND gasto.estado_pago <> 'cancelado';

  v_real_material := round(v_real_material, 4);
  v_real_fabricacion := round(v_real_fabricacion, 4);
  v_real_subcontratacion := round(v_real_sub_gastos + v_real_sub_compras, 4);
  v_real_gastos := round(v_real_gastos_gastos + v_real_gastos_compras, 4);
  v_real_total := round(v_real_material + v_real_fabricacion
    + v_real_subcontratacion + v_real_gastos, 4);

  v_variacion_total := CASE WHEN v_tiene_estimado
    THEN round(v_real_total - v_estimado_total, 4) ELSE NULL END;
  v_variacion_total_pct := CASE
    WHEN v_variacion_total IS NULL OR v_estimado_total IS NULL OR v_estimado_total = 0
      THEN NULL
    ELSE round(v_variacion_total / v_estimado_total * 100, 4) END;

  v_margen_estimado := CASE
    WHEN v_tiene_estimado AND v_venta_estimado IS NOT NULL AND v_venta_estimado > 0
      THEN round((v_venta_estimado - v_estimado_total) / v_venta_estimado * 100, 4)
    ELSE NULL END;
  v_margen_real := CASE
    WHEN v_venta_real IS NOT NULL AND v_venta_real > 0
      THEN round((v_venta_real - v_real_total) / v_venta_real * 100, 4)
    ELSE NULL END;

  RETURN jsonb_build_object(
    'ordenId', p_orden_id,
    'esInterna', v_es_interna,
    'tieneEstimado', v_tiene_estimado,
    'moneda', v_orden.snapshot_json -> 'totales' ->> 'moneda',
    'tipoCambio', v_tc_snapshot,
    'ventaBaseEstimadoMxn', round(v_venta_estimado, 4),
    'ventaBaseRealMxn', round(v_venta_real, 4),
    'conceptos', jsonb_build_array(
      jsonb_build_object(
        'concepto', 'material',
        'estimado', v_est_material,
        'comprometido', v_comp_material,
        'real', v_real_material,
        'variacionAbs', CASE WHEN v_tiene_estimado
          THEN round(v_real_material - v_est_material, 4) ELSE NULL END,
        'variacionPct', CASE WHEN v_tiene_estimado AND v_est_material <> 0
          THEN round((v_real_material - v_est_material) / v_est_material * 100, 4) ELSE NULL END,
        'fuentes', COALESCE((SELECT jsonb_agg(f.fuente ORDER BY f.orden)
          FROM (VALUES (1, 'compra', v_comp_material > 0),
                       (2, 'consumo', v_real_material > 0)) AS f(orden, fuente, incluir)
          WHERE f.incluir), '[]'::jsonb)
      ),
      jsonb_build_object(
        'concepto', 'fabricacion',
        'estimado', v_est_fabricacion,
        'comprometido', 0,
        'real', v_real_fabricacion,
        'variacionAbs', CASE WHEN v_tiene_estimado
          THEN round(v_real_fabricacion - v_est_fabricacion, 4) ELSE NULL END,
        'variacionPct', CASE WHEN v_tiene_estimado AND v_est_fabricacion <> 0
          THEN round((v_real_fabricacion - v_est_fabricacion) / v_est_fabricacion * 100, 4) ELSE NULL END,
        'fuentes', COALESCE((SELECT jsonb_agg(f.fuente ORDER BY f.orden)
          FROM (VALUES (1, 'sesion', v_real_fabricacion > 0)) AS f(orden, fuente, incluir)
          WHERE f.incluir), '[]'::jsonb)
      ),
      jsonb_build_object(
        'concepto', 'subcontratacion',
        'estimado', v_est_subcontratacion,
        'comprometido', v_comp_subcontratacion,
        'real', v_real_subcontratacion,
        'variacionAbs', CASE WHEN v_tiene_estimado
          THEN round(v_real_subcontratacion - v_est_subcontratacion, 4) ELSE NULL END,
        'variacionPct', CASE WHEN v_tiene_estimado AND v_est_subcontratacion <> 0
          THEN round((v_real_subcontratacion - v_est_subcontratacion) / v_est_subcontratacion * 100, 4) ELSE NULL END,
        'fuentes', COALESCE((SELECT jsonb_agg(f.fuente ORDER BY f.orden)
          FROM (VALUES (1, 'gasto', v_real_sub_gastos > 0),
                       (2, 'compra', v_real_sub_compras > 0)) AS f(orden, fuente, incluir)
          WHERE f.incluir), '[]'::jsonb)
      ),
      jsonb_build_object(
        'concepto', 'gastos_directos',
        'estimado', v_est_gastos,
        'comprometido', v_comp_gastos,
        'real', v_real_gastos,
        'variacionAbs', CASE WHEN v_tiene_estimado
          THEN round(v_real_gastos - v_est_gastos, 4) ELSE NULL END,
        'variacionPct', CASE WHEN v_tiene_estimado AND v_est_gastos <> 0
          THEN round((v_real_gastos - v_est_gastos) / v_est_gastos * 100, 4) ELSE NULL END,
        'fuentes', COALESCE((SELECT jsonb_agg(f.fuente ORDER BY f.orden)
          FROM (VALUES (1, 'gasto', v_real_gastos_gastos > 0),
                       (2, 'compra', v_real_gastos_compras > 0)) AS f(orden, fuente, incluir)
          WHERE f.incluir), '[]'::jsonb)
      )
    ),
    'totales', jsonb_build_object(
      'estimado', CASE WHEN v_tiene_estimado THEN v_estimado_total ELSE NULL END,
      'comprometido', round(v_comp_material + v_comp_subcontratacion + v_comp_gastos, 4),
      'real', v_real_total,
      'variacionAbs', v_variacion_total,
      'variacionPct', v_variacion_total_pct
    ),
    'margenEstimadoPct', v_margen_estimado,
    'margenRealPct', v_margen_real,
    'avisos', jsonb_build_object(
      'comprasSinRubro', jsonb_build_object(
        'n', v_comp_sin_rubro_n,
        'importe', round(v_comp_sin_rubro_importe, 4)),
      'comprasPagadasSinRecepcion', jsonb_build_object(
        'n', v_comp_pagadas_sin_recepcion_n,
        'importe', round(v_comp_pagadas_sin_recepcion_importe, 4)),
      'gastosIncluidosEnRubros', jsonb_build_object(
        'n', v_gastos_incluidos_n,
        'importe', round(v_gastos_incluidos_importe, 4))
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.obtener_conciliacion_costos_orden(uuid) IS
  'C10.2: conciliación Estimado (Propuesta aceptada) / Comprometido (compras confirmadas) / Real (consumo, sesiones, gastos y compras de servicios recibidas) por Orden. Material real = consumo (F-01 A); PAGADA sin recepción no es real (F-02); margen estimado con venta de la Propuesta y real con venta de la AR (F-04). Solo lectura, solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_conciliacion_costos_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_conciliacion_costos_orden(uuid)
  TO service_role;
