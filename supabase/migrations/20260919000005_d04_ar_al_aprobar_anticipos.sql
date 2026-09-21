-- =============================================================================
-- Migración: D-04 — la AR nace al aprobar (no cobrable) y es cobrable al
-- entregar; anticipos por orden con la AR aún no cobrable.
-- ORCA MFG ERP — Cobranza.
--
-- Decisión del cliente (2ª ronda de backlog): la cuenta por cobrar puede nacer
-- al aprobar la oportunidad, pero NO es exigible hasta la entrega; se admiten
-- anticipos sobre la orden según sus términos. Cambios:
--
--   1. `cuentas_por_cobrar.cobrable_desde`: NULL = aún no cobrable (anticipos
--      permitidos); no NULL = cuenta exigible. Se permite
--      `fecha_vencimiento` NULL mientras no sea cobrable y una restricción
--      mantiene la coherencia (cobrable ⇔ vencimiento fijado). El relleno de
--      filas históricas usa `fecha_emision`, que es el momento en que se
--      abrían antes de esta migración; su lectura no cambia.
--   2. `aprobar_oportunidad_y_crear_orden` crea la AR no cobrable con el total
--      comercial (descuento restado, IVA de la oportunidad, TC vigente), salvo
--      trabajos internos (TI) y totales no representables en numeric(12,4).
--   3. `abrir_cuenta_por_cobrar` se vuelve la vía de activación: si la AR ya
--      existe y aún no es cobrable, la activa con el vencimiento capturado; si
--      ya era cobrable conserva el rechazo `cuenta_por_cobrar_ya_existe`.
--   4. `archivar_orden_al_entregar` (OBS-21) activa además la AR pendiente:
--      `cobrable_desde = now()` y vencimiento = entrega + plazo del cliente
--      (contado 0; 15_dias 15; 30_dias y credito 30; sin captura 30).
--   5. Rentabilidad y dashboard solo reconocen ingreso/cartera de cuentas
--      cobrables; el anticipo se ve en Cobranza, no como cartera vencida.
--
-- Aditiva y con reemplazos de misma firma; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cobrabilidad explícita de la cuenta (D-04).
-- -----------------------------------------------------------------------------
ALTER TABLE public.cuentas_por_cobrar
  ALTER COLUMN fecha_vencimiento DROP NOT NULL;

ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS cobrable_desde timestamptz;

COMMENT ON COLUMN public.cuentas_por_cobrar.cobrable_desde IS
  'D-04: fecha en que la cuenta se volvió exigible (entrega); NULL = no cobrable, admite anticipos.';
COMMENT ON COLUMN public.cuentas_por_cobrar.fecha_vencimiento IS
  'D-04: vencimiento exigible; NULL mientras la cuenta no sea cobrable.';

-- Filas históricas: antes de D-04 toda AR se abría ya cobrable.
UPDATE public.cuentas_por_cobrar
SET cobrable_desde = fecha_emision
WHERE cobrable_desde IS NULL
  AND fecha_vencimiento IS NOT NULL;

ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_cobrabilidad_coherente;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_cobrabilidad_coherente CHECK (
    (cobrable_desde IS NULL) = (fecha_vencimiento IS NULL)
  );

-- -----------------------------------------------------------------------------
-- 2. Apertura/activación manual (Contabilidad). Misma firma que 20260916000002.
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
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
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

  -- D-04: la cuenta pudo nacer no cobrable al aprobar. El lock de AR va antes
  -- del lock de cliente para conservar el orden AR → cliente de los pagos.
  SELECT cuenta.*
  INTO v_cuenta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
  FOR UPDATE;

  IF FOUND AND v_cuenta.cobrable_desde IS NOT NULL THEN
    RAISE EXCEPTION 'cuenta_por_cobrar_ya_existe' USING ERRCODE = 'unique_violation';
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

  -- La cuenta creada al aprobar es inmutable en importe (D-04): aquí solo se
  -- activa. El importe capturado en el formulario queda ignorado a propósito.
  IF v_cuenta.id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      cobrable_desde = now(),
      fecha_vencimiento = p_fecha_vencimiento,
      folio_factura_remision = coalesce(
        cuenta.folio_factura_remision,
        NULLIF(btrim(p_folio_factura_remision), '')
      )
    WHERE cuenta.id = v_cuenta.id
    RETURNING
      cuenta.id,
      cuenta.cliente_id,
      cuenta.saldo_pendiente,
      cuenta.moneda,
      cuenta.estado;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.cuentas_por_cobrar (
    orden_id, cliente_id, folio_factura_remision, monto_total, saldo_pendiente,
    moneda, tipo_cambio_origen, estado, fecha_emision, fecha_vencimiento, cobrable_desde
  ) VALUES (
    p_orden_id, v_cliente_id, NULLIF(btrim(p_folio_factura_remision), ''),
    round(p_monto_total, 4), round(p_monto_total, 4), upper(trim(p_moneda)),
    round(p_tipo_cambio_origen, 4), 'pendiente', now(), p_fecha_vencimiento, now()
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
  'Activa una AR creada al aprobar (D-04) o abre una AR cobrable para una OP completada; rechaza TI y cuentas ya cobrables. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Aprobación comercial: la orden nace con su AR no cobrable.
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
      'maquina_asignada', NULL,
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

      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
        tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
      ) VALUES (
        v_orden_id, p_cliente_id, round(v_total, 4), round(v_total, 4),
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
  'Bloquea Pipeline, genera la orden desde sus líneas fabricables y le crea la AR no cobrable con el total comercial (D-04); excluye TI. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Entrega total: archiva la orden y activa su AR con el plazo del cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archivar_orden_al_entregar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_pendientes integer;
BEGIN
  SELECT nota.orden_id INTO v_orden_id
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF v_orden_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_orden_id
    AND coalesce(
      (
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        WHERE renglon.partida_id = partida.id
      ),
      0
    ) < partida.cantidad_solicitada;

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = coalesce(archivada_en, now())
    WHERE id = v_orden_id;

    -- D-04: la entrega total vuelve cobrable la AR aún no cobrable. Plazo del
    -- cliente: contado 0; 15_dias 15; 30_dias/credito o sin captura 30 días.
    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      cobrable_desde = now(),
      fecha_vencimiento = now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        ELSE 30
      END)
    FROM public.clientes AS cliente
    WHERE cuenta.orden_id = v_orden_id
      AND cuenta.cliente_id = cliente.id
      AND cuenta.cobrable_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archivar_orden_al_entregar() IS
  'OBS-21/D-04: archiva la orden al cubrir la entrega total y activa su AR con vencimiento a plazo del cliente (idempotente).';

DROP TRIGGER IF EXISTS trigger_archivar_orden_al_entregar
  ON public.partidas_nota_entrega;
CREATE TRIGGER trigger_archivar_orden_al_entregar
  AFTER INSERT ON public.partidas_nota_entrega
  FOR EACH ROW
  EXECUTE FUNCTION public.archivar_orden_al_entregar();

-- -----------------------------------------------------------------------------
-- 5. Rentabilidad: el ingreso se reconoce con la entrega (cuenta cobrable).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_rentabilidad_orden(p_orden_id uuid)
RETURNS TABLE (
  orden_id uuid,
  monto_venta_mxn numeric,
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
  gastos_excluidos integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_venta numeric(18, 4);
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
  SELECT COALESCE(SUM(
    CASE
      WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
      ELSE cuenta.monto_total * cuenta.tipo_cambio_origen
    END
  ), 0)
  INTO v_venta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.cobrable_desde IS NOT NULL;

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

  SELECT
    COALESCE(SUM(
      gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END
    ) FILTER (WHERE gasto.estado_pago <> 'cancelado'), 0),
    COUNT(*) FILTER (WHERE gasto.estado_pago <> 'cancelado')::integer,
    COUNT(*) FILTER (WHERE gasto.estado_pago = 'cancelado')::integer
  INTO v_gastos, v_gastos_count, v_gastos_excluidos_count
  FROM public.gastos AS gasto
  WHERE gasto.orden_id = p_orden_id;

  v_costo_total := round(v_materiales + v_mano_obra + v_gastos, 4);
  v_utilidad := round(v_venta - v_costo_total, 4);

  RETURN QUERY
  SELECT
    p_orden_id,
    round(v_venta, 4),
    round(v_materiales, 4),
    round(v_mano_obra, 4),
    round(v_gastos, 4),
    v_costo_total,
    v_utilidad,
    CASE WHEN v_venta > 0 THEN round(v_utilidad / v_venta * 100, 4) ELSE NULL END,
    v_venta > 0,
    v_materiales_count,
    v_sesiones_count,
    v_sesiones_sin_tarifa_count,
    v_gastos_count,
    v_gastos_excluidos_count;
END;
$$;

COMMENT ON FUNCTION public.obtener_rentabilidad_orden(uuid) IS
  'Calcula rentabilidad en MXN; el ingreso solo proviene de AR cobrables (D-04), más consumos, sesiones y gastos no cancelados.';

REVOKE EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_rentabilidad_orden(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Dashboard ejecutivo: ingreso y cartera solo de cuentas cobrables.
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
      AND cuenta.cobrable_desde IS NOT NULL
      AND cuenta.cobrable_desde >= p_fecha_inicio
      AND cuenta.cobrable_desde < p_fecha_fin
  ), cotizado AS (
    -- Excluye trabajos internos: no son venta/cotizado comercial (DAS-01).
    -- El descuento (RFQ-03) viene en positivo y aquí se resta del cotizado.
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
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
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL
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
      AND cuenta.cobrable_desde IS NOT NULL
      AND cuenta.cobrable_desde >= v_anterior_inicio
      AND cuenta.cobrable_desde < v_anterior_fin
  ), cotizado AS (
    -- El descuento (RFQ-03) viene en positivo y aquí se resta del cotizado.
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
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
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.cobrable_desde IS NOT NULL
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
  'Ventas comerciales (excluye TI) reconocidas al volverse cobrables (D-04), tiempo de respuesta y %<=24h, órdenes (incl. TI), finanzas con gasto del periodo y distribución por categoría, en MXN.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  TO service_role;
