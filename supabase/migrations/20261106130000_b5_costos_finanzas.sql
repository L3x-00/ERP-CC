-- =============================================================================
-- B5 - Costos, conciliacion financiera y pagos a proveedores
-- Hallazgos: AUD-07 (C14), AUD-08 (retrabajo en C10.2/C10.3), AUD-15 (pagos).
--
-- Solo lectura en los reportes + idempotencia transaccional en el pago.
-- No toca inventario manual (AUD-03), cierre de sesiones, cantidades producidas
-- ni la distribucion de materials de corridas integradas.
--
-- Criterio unico de retrabajo aplicado en los tres reportes:
--   * material: (cantidad_usada + cantidad_scrap) * costo_unitario_momento, que
--     es el costo MXN congelado en el momento del retrabajo.
--   * mano de obra: minutos / 60 a la tarifa historica que ya usa cada reporte
--     (C14: tarifa del ruteo de la propuesta, para seguir comparando contra su
--     estimado; C10.2/C10.3: costo_hora_interno congelado en la sesion).
--   * cada retrabajo suma una sola vez: nunca se suma dos veces al mismo rubro.
--
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUD-15 - Clave de idempotencia en pagos a proveedor.
--    Nullable para conservar los pagos historicos; unica cuando existe.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pagos_compra
  ADD COLUMN IF NOT EXISTS solicitud_id uuid;

COMMENT ON COLUMN public.pagos_compra.solicitud_id IS
  'AUD-15: clave de idempotencia por intencion de pago. Nullable en pagos historicos; unica cuando no es NULL.';

DO $b5_pago_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pagos_compra'::regclass
      AND conname = 'pagos_compra_solicitud_id_key'
  ) THEN
    ALTER TABLE public.pagos_compra
      ADD CONSTRAINT pagos_compra_solicitud_id_key UNIQUE (solicitud_id);
  END IF;
END;
$b5_pago_key$;

-- -----------------------------------------------------------------------------
-- 2. AUD-15 - pagar_compra idempotente.
--    Se cambia la firma (9 argumentos) para recibir la clave; se elimina la
--    version de 8 argumentos para que no quede un camino sin idempotencia.
--    Orden de bloqueo: compra (FOR UPDATE) -> lectura de la solicitud -> resto.
--    Un reintento con la misma clave devuelve el pago original sin insertar ni
--    volver a descontar el saldo.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid);

CREATE FUNCTION public.pagar_compra(
  p_compra_id uuid,
  p_monto numeric,
  p_metodo_pago text,
  p_referencia text,
  p_cuenta_bancaria_id uuid,
  p_notas text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pago_id uuid,
  compra_id uuid,
  estado text,
  saldo_pendiente numeric,
  actualizado_en timestamptz,
  idempotente boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_pago public.pagos_compra%ROWTYPE;
  v_pago_id uuid;
  v_saldo numeric(14, 4);
  v_estado text;
  v_metodo text := lower(trim(coalesce(p_metodo_pago, '')));
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL OR p_solicitud_id IS NULL
     OR p_monto IS NULL OR p_monto <= 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_metodo NOT IN ('transferencia', 'efectivo', 'cheque', 'tarjeta')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_pago_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  -- 1) Bloqueo de la compra: serializa pagos concurrentes de la misma compra.
  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- 2) Reintento valido: la solicitud ya se aplico. Se devuelve el resultado
  --    original sin insertar ni descontar saldo otra vez.
  SELECT * INTO v_pago FROM public.pagos_compra AS pago
  WHERE pago.solicitud_id = p_solicitud_id;
  IF FOUND THEN
    IF v_pago.compra_id <> p_compra_id
       OR v_pago.monto <> round(p_monto, 4)
       OR v_pago.metodo_pago <> v_metodo THEN
      RAISE EXCEPTION 'solicitud_pago_conflicto' USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY
    SELECT v_pago.id, v_compra.id, v_compra.estado,
           v_compra.saldo_pendiente, v_compra.actualizado_en, true;
    RETURN;
  END IF;

  -- 3) Validaciones de negocio, ya con la compra bloqueada.
  IF v_compra.estado NOT IN ('CONFIRMADA', 'RECIBIDA') THEN
    RAISE EXCEPTION 'compra_no_pagable' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
  END IF;
  IF round(p_monto, 4) > v_compra.saldo_pendiente THEN
    RAISE EXCEPTION 'monto_excede_saldo' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id AND usuario.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_bancarias AS banco
    WHERE banco.id = p_cuenta_bancaria_id AND banco.activa
      AND banco.moneda = v_compra.moneda
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_bancaria_no_disponible' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.pagos_compra (
    compra_id, monto, metodo_pago, referencia, cuenta_bancaria_id, notas,
    creado_por, solicitud_id
  ) VALUES (
    p_compra_id, round(p_monto, 4), v_metodo,
    NULLIF(btrim(p_referencia), ''), p_cuenta_bancaria_id, NULLIF(btrim(p_notas), ''),
    p_actor_id, p_solicitud_id
  ) RETURNING id INTO v_pago_id;

  v_saldo := round(v_compra.saldo_pendiente - round(p_monto, 4), 4);
  v_estado := CASE WHEN v_saldo <= 0 THEN 'PAGADA' ELSE v_compra.estado END;

  RETURN QUERY
  UPDATE public.compras AS compra
  SET saldo_pendiente = v_saldo, estado = v_estado
  WHERE compra.id = p_compra_id
  RETURNING v_pago_id, compra.id, compra.estado, compra.saldo_pendiente,
            compra.actualizado_en, false;
EXCEPTION
  WHEN unique_violation THEN
    -- Carrera entre dos solicitudes con la misma clave: gana la primera; el
    -- reintento devuelve la ganadora si coincide con la intencion.
    SELECT * INTO v_pago FROM public.pagos_compra AS pago
    WHERE pago.solicitud_id = p_solicitud_id;
    IF FOUND
       AND v_pago.compra_id = p_compra_id
       AND v_pago.monto = round(p_monto, 4)
       AND v_pago.metodo_pago = v_metodo THEN
      RETURN QUERY
      SELECT v_pago.id, v_compra.id, v_compra.estado,
             v_compra.saldo_pendiente, v_compra.actualizado_en, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'solicitud_pago_conflicto' USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid, uuid) IS
  'SII-B8 F4 + AUD-15: registra un pago (parcial/total) de la compra en su moneda y deriva PAGADA al saldar. Idempotente por solicitud_id: un reintento devuelve el pago original sin duplicar saldo. Solo service_role.';

REVOKE ALL ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagar_compra(uuid, numeric, text, text, uuid, text, uuid, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. AUD-08 - Conciliacion C10.2: incluye retrabajo en material y fabricacion.
--    Misma firma y mismo contrato de salida; el aviso nuevo es aditivo.
-- -----------------------------------------------------------------------------
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
  v_retrabajo_material numeric := 0;
  v_retrabajo_mano_obra numeric := 0;
  v_retrabajo_sin_sesion_n integer := 0;
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

  -- Estimado por categoria desde la revision aceptada (congelada).
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

  -- Real de compras de servicios: RECIBIDA o PAGADA con recepcion congelada.
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

  -- Real de Material: consumo real de Produccion, valuado al costo congelado.
  SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
    * consumo.costo_unitario_momento), 0)
  INTO v_real_material
  FROM public.registros_consumo_material AS consumo
  INNER JOIN public.partidas_orden_produccion AS partida
    ON partida.id = consumo.partida_id
  WHERE partida.orden_id = p_orden_id;

  -- Real de Fabricacion: horas netas de sesiones pausadas/finalizadas.
  SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
  INTO v_real_fabricacion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.orden_id = p_orden_id
    AND sesion.estado_sesion IN ('pausada', 'finalizada');

  -- AUD-08: retrabajo. Material a costo congelado y minutos a la tarifa
  -- historica de la sesion que lo declaro. Cada fila suma una sola vez.
  SELECT
    COALESCE(SUM((retrabajo.cantidad_usada + retrabajo.cantidad_scrap)
      * retrabajo.costo_unitario_momento), 0),
    COALESCE(SUM((retrabajo.minutos / 60.0)
      * COALESCE(sesion.costo_hora_interno, 0)), 0),
    COUNT(*) FILTER (WHERE retrabajo.sesion_id IS NULL)
  INTO v_retrabajo_material, v_retrabajo_mano_obra, v_retrabajo_sin_sesion_n
  FROM public.retrabajos_produccion AS retrabajo
  LEFT JOIN public.sesiones_trabajo AS sesion ON sesion.id = retrabajo.sesion_id
  WHERE retrabajo.orden_id = p_orden_id;

  v_real_material := round(v_real_material + v_retrabajo_material, 4);
  v_real_fabricacion := round(v_real_fabricacion + v_retrabajo_mano_obra, 4);

  -- Real de gastos: maquila_externa a subcontratacion; el resto a gastos
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
        'importe', round(v_gastos_incluidos_importe, 4)),
      'retrabajos', jsonb_build_object(
        'material', round(v_retrabajo_material, 4),
        'manoObra', round(v_retrabajo_mano_obra, 4),
        'sinSesion', v_retrabajo_sin_sesion_n)
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.obtener_conciliacion_costos_orden(uuid) IS
  'C10.2: conciliacion Estimado (Propuesta aceptada) / Comprometido (compras confirmadas) / Real (consumo, retrabajo, sesiones, gastos y compras de servicios recibidas) por Orden. Material real = consumo + retrabajo (F-01 A); PAGADA sin recepcion no es real (F-02); retrabajo incluido una sola vez (AUD-08). Solo lectura, solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_conciliacion_costos_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_conciliacion_costos_orden(uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. AUD-08 - Rentabilidad C10.3: incluye retrabajo en material y mano de obra.
--    Misma firma y mismas columnas de salida.
-- -----------------------------------------------------------------------------
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
  v_retrabajo_material numeric(18, 4);
  v_retrabajo_mano_obra numeric(18, 4);
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

  -- AUD-08: retrabajo en los mismos rubros que usa la rentabilidad.
  SELECT
    COALESCE(SUM((retrabajo.cantidad_usada + retrabajo.cantidad_scrap)
      * retrabajo.costo_unitario_momento), 0),
    COALESCE(SUM((retrabajo.minutos / 60.0)
      * COALESCE(sesion.costo_hora_interno, 0)), 0)
  INTO v_retrabajo_material, v_retrabajo_mano_obra
  FROM public.retrabajos_produccion AS retrabajo
  LEFT JOIN public.sesiones_trabajo AS sesion ON sesion.id = retrabajo.sesion_id
  WHERE retrabajo.orden_id = p_orden_id;

  v_materiales := round(v_materiales + v_retrabajo_material, 4);
  v_mano_obra := round(v_mano_obra + v_retrabajo_mano_obra, 4);

  -- OBS-29: materia_prima y nomina ya viven en material y mano de obra.
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
  'Rentabilidad en MXN sobre ingreso NETO historico (A03/D-11). Material incluye consumo + retrabajo y mano de obra incluye sesiones + retrabajo, cada uno una sola vez (AUD-08). Ingreso solo de AR cobrables (D-04); gastos materia_prima/nomina no suman (OBS-29). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. AUD-07/AUD-08 - Desglose de rentabilidad: resuelve catalogo nuevo y
--    legado, e incluye el retrabajo en los mismos rubros del total.
--    Misma firma y mismas columnas de salida.
-- -----------------------------------------------------------------------------
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
  ), hechos_mano_obra AS (
    -- Sesiones reales.
    SELECT programacion.recurso_id,
           sesion.costo_hora_interno AS tarifa,
           sesion.horas_netas AS horas
    FROM public.sesiones_trabajo AS sesion
    INNER JOIN public.programacion_areas AS programacion
      ON programacion.id = sesion.programacion_id
    WHERE sesion.orden_id = p_orden_id
      AND sesion.estado_sesion IN ('pausada', 'finalizada')
    UNION ALL
    -- AUD-08: minutos de retrabajo a la tarifa historica de su sesion.
    SELECT programacion.recurso_id,
           sesion.costo_hora_interno,
           retrabajo.minutos / 60.0
    FROM public.retrabajos_produccion AS retrabajo
    INNER JOIN public.sesiones_trabajo AS sesion ON sesion.id = retrabajo.sesion_id
    INNER JOIN public.programacion_areas AS programacion
      ON programacion.id = sesion.programacion_id
    WHERE retrabajo.orden_id = p_orden_id
  ), mano_obra_por_tarifa AS (
    SELECT
      recurso.id AS recurso_id,
      recurso.codigo,
      recurso.nombre,
      hechos.tarifa,
      COALESCE(estimadas.horas, 0) AS horas_programadas,
      SUM(hechos.horas) AS horas_reales,
      round(SUM(hechos.horas * hechos.tarifa), 4) AS costo
    FROM hechos_mano_obra AS hechos
    INNER JOIN public.recursos_planeacion AS recurso
      ON recurso.id = hechos.recurso_id
    LEFT JOIN estimadas ON estimadas.recurso_id = recurso.id
    GROUP BY recurso.id, recurso.codigo, recurso.nombre,
      hechos.tarifa, estimadas.horas
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
  ), materiales_hechos AS (
    -- AUD-07: consumo nuevo (catalogo) y legado (materiales) resueltos por id.
    SELECT
      COALESCE(consumo.catalogo_material_id, consumo.material_id) AS clave,
      catalogo.nombre AS catalogo_nombre,
      catalogo.codigo AS catalogo_codigo,
      material.nombre AS material_nombre,
      material.codigo AS material_codigo,
      (consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento AS monto
    FROM public.registros_consumo_material AS consumo
    INNER JOIN public.partidas_orden_produccion AS partida
      ON partida.id = consumo.partida_id
    LEFT JOIN public.catalogo_materiales AS catalogo
      ON catalogo.id = consumo.catalogo_material_id
    LEFT JOIN public.materiales AS material
      ON material.id = consumo.material_id
    WHERE partida.orden_id = p_orden_id
    UNION ALL
    -- AUD-08: material del retrabajo, misma clave y mismo costo congelado.
    SELECT
      retrabajo.material_id,
      NULL,
      NULL,
      material.nombre,
      material.codigo,
      (retrabajo.cantidad_usada + retrabajo.cantidad_scrap)
        * retrabajo.costo_unitario_momento
    FROM public.retrabajos_produccion AS retrabajo
    LEFT JOIN public.materiales AS material ON material.id = retrabajo.material_id
    WHERE retrabajo.orden_id = p_orden_id
  )
  -- Mano de obra por estacion y tarifa historica.
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

  -- Material realmente consumido y retrabajado, por material.
  SELECT
    'material'::text,
    COALESCE(max(catalogo_nombre), max(material_nombre), 'Material sin catalogo'),
    COALESCE(max(catalogo_codigo), max(material_codigo)),
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    round(SUM(monto), 4),
    NULL::text
  FROM materiales_hechos
  GROUP BY clave

  UNION ALL

  -- Gastos directos por categoria (si suman al costo).
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

COMMENT ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid) IS
  'OBS-29 + AUD-07/AUD-08: desglose por estacion/rubro. Material resuelve catalogo nuevo y legado; incluye retrabajo. Mano de obra suma minutos de retrabajo a la tarifa historica de la sesion. Los rubros suman exactamente el costo de obtener_rentabilidad_orden. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_desglose_rentabilidad_orden(uuid) TO service_role;
