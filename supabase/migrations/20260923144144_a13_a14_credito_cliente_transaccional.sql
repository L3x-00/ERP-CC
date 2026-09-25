-- A13-A14: serializar crédito por cliente y conservar identidad comercial.
-- Base: implementación vigente de 20260922000003; no se edita la migración anterior.

-- Si la ejecución no fuese transaccional, la firma anterior deja de ser
-- invocable antes de introducir el gate nuevo. Al final se vuelve a otorgar.
REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.aprobar_oportunidad_y_crear_orden(
  p_pipeline_id uuid,
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz,
  p_autorizar_sobregiro boolean,
  p_actor_id uuid
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
  v_cliente_vinculado uuid;
  v_estado_cliente text;
  v_limite_credito numeric(18, 4);
  v_credito_utilizado numeric(18, 4);
  v_credito_nuevo numeric(18, 4);
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

  SELECT etapa, prioridad, es_orden_interna, iva_porcentaje, moneda, cliente_id
  INTO v_etapa, v_prioridad, v_es_interna, v_iva_porcentaje, v_moneda, v_cliente_vinculado
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

  IF v_cliente_vinculado IS NOT NULL AND v_cliente_vinculado IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION 'cliente_no_corresponde_oportunidad' USING ERRCODE = 'check_violation';
  END IF;

  -- A13: dos RFQ distintas se serializan por la misma fila de cliente. El
  -- FOR UPDATE también entra en conflicto con el KEY SHARE del FK de otras
  -- inserciones de AR, antes de consultar el saldo. Nunca leer saldo antes.
  SELECT cliente.estado, cliente.limite_credito
  INTO v_estado_cliente, v_limite_credito
  FROM public.clientes AS cliente
  WHERE cliente.id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND OR v_estado_cliente IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(p_autorizar_sobregiro, false) AND NOT EXISTS (
    SELECT 1 FROM public.usuarios AS actor
    WHERE actor.id = p_actor_id AND actor.rol = 'admin' AND actor.activo = true
  ) THEN
    RAISE EXCEPTION 'sobregiro_requiere_admin_activo' USING ERRCODE = 'check_violation';
  END IF;

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

    IF v_moneda = 'USD' THEN
      SELECT config.tipo_cambio_usd INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config LIMIT 1;
      IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
        RAISE EXCEPTION 'tipo_cambio_usd_requerido' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_credito_nuevo := round(v_base * CASE WHEN v_moneda = 'USD' THEN v_tipo_cambio ELSE 1 END, 2);
    IF coalesce(v_limite_credito, 0) > 0 THEN
      SELECT coalesce(round(sum(
        cuenta.saldo_pendiente * CASE WHEN cuenta.moneda = 'USD' THEN cuenta.tipo_cambio_origen ELSE 1 END
      ), 2), 0)
      INTO v_credito_utilizado
      FROM public.cuentas_por_cobrar AS cuenta
      WHERE cuenta.cliente_id = p_cliente_id
        AND cuenta.estado IN ('pendiente', 'parcial');

      IF v_credito_utilizado + v_credito_nuevo > v_limite_credito
         AND NOT coalesce(p_autorizar_sobregiro, false) THEN
        RAISE EXCEPTION 'credito_limite_excedido' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
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
    IF v_total > 0 AND v_total <= 99999999.9999 THEN
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

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz, boolean, uuid) IS
  'A13-A14: bloquea Pipeline y cliente, conserva el cliente seleccionado, evalúa crédito antes de crear OP/AR y exige admin activo para sobregiro. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz, boolean, uuid)
  TO service_role;

-- La firma antigua sigue siendo un camino de compatibilidad para callers y
-- pruebas existentes, pero ya no conserva el cuerpo inseguro: delega al gate
-- sin autorización de sobregiro. No quedan dos rutas de aprobación.
CREATE OR REPLACE FUNCTION public.aprobar_oportunidad_y_crear_orden(
  p_pipeline_id uuid,
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, ya_existia boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.aprobar_oportunidad_y_crear_orden(
    p_pipeline_id, p_cliente_id, p_fecha_compromiso, false, NULL::uuid
  );
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'A13: firma compatible que delega al gate transaccional de crédito sin sobregiro. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;
