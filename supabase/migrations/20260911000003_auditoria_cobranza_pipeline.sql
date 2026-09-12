-- =============================================================================
-- Auditoría 2026-09-11 — Correcciones de Cobranza y Pipeline.
--
-- Hallazgos corregidos:
--   A) `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` solo validaban
--      usuario activo, no el permiso financiero (`registrar_pagos` /
--      `aplicar_saldos`). La Server Action lo valida, pero la RPC era la última
--      línea de defensa y un fallo de la acción habilitaba cobros sin permiso.
--   B) `aplicar_saldo_favor_ar` devolvía `idempotente=true` con saldos NULL si
--      el reintento traía un `p_cliente_id` que no correspondía a la AR.
--   C) Un pago MXN con tipo de cambio distinto de 1 acreditaba de más.
--   D) `aprobar_oportunidad_y_crear_orden`, si la OP ya existía, salía sin
--      re-marcar la etapa `ganada`: tras una reversión de admin el flujo
--      reportaba éxito con la oportunidad en negociación.
--   E) La política INSERT de `pipeline` permitía fabricar `folio_op` directo
--      por PostgREST, fuera de la SEQUENCE y del folio de servidor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A+B+C) Motor de pagos: permiso explícito y validación de moneda/TC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pago_ar_atomico(
  p_ar_id uuid,
  p_monto_pagado numeric,
  p_moneda_pago text,
  p_tipo_cambio_pago numeric,
  p_metodo_pago text,
  p_referencia text,
  p_usuario_id uuid,
  p_solicitud_id uuid,
  p_notas text DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pago_id uuid,
  folio_recibo text,
  ar_id uuid,
  saldo_pendiente numeric,
  estado_ar text,
  monto_aplicado_ar numeric,
  monto_sobrepago_ar numeric,
  saldo_a_favor_mxn numeric,
  idempotente boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ar public.cuentas_por_cobrar%ROWTYPE;
  v_pago_existente public.pagos_ar%ROWTYPE;
  v_equivalente_ar numeric(18, 6);
  v_monto_aplicado_ar numeric(12, 4);
  v_monto_sobrepago_ar numeric(12, 4);
  v_credito_mxn numeric(14, 4);
  v_folio_recibo text;
  v_pago_id uuid;
  v_saldo_a_favor numeric(14, 4);
BEGIN
  IF p_ar_id IS NULL OR p_usuario_id IS NULL OR p_solicitud_id IS NULL
     OR p_monto_pagado IS NULL OR p_monto_pagado <= 0
     OR p_monto_pagado IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_tipo_cambio_pago IS NULL OR p_tipo_cambio_pago <= 0
     OR p_tipo_cambio_pago IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR upper(trim(coalesce(p_moneda_pago, ''))) NOT IN ('USD', 'MXN')
     OR lower(trim(coalesce(p_metodo_pago, ''))) NOT IN ('transferencia', 'efectivo', 'cheque', 'tarjeta') THEN
    RAISE EXCEPTION 'datos_pago_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  -- Una moneda MXN no puede venir con tipo de cambio distinto de 1: inflaría
  -- el equivalente acreditado a la cuenta por cobrar.
  IF upper(trim(p_moneda_pago)) = 'MXN' AND round(p_tipo_cambio_pago, 4) <> 1 THEN
    RAISE EXCEPTION 'tipo_cambio_mxn_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Permiso financiero explícito. Sin lock de fila para no alterar el orden
  -- AR → usuario → cliente documentado abajo.
  PERFORM 1
  FROM public.usuarios AS usuario
  INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
    AND permiso.permiso = 'registrar_pagos';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_pagos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Un reintento de la misma intención no crea otro recibo ni vuelve a tocar saldos.
  SELECT pago.*
  INTO v_pago_existente
  FROM public.pagos_ar AS pago
  WHERE pago.solicitud_id = p_solicitud_id
  FOR KEY SHARE;

  IF FOUND THEN
    IF v_pago_existente.ar_id <> p_ar_id OR v_pago_existente.creado_por <> p_usuario_id THEN
      RAISE EXCEPTION 'solicitud_pago_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT ar.saldo_pendiente, ar.estado, cliente.saldo_a_favor
    INTO saldo_pendiente, estado_ar, saldo_a_favor_mxn
    FROM public.cuentas_por_cobrar AS ar
    JOIN public.clientes AS cliente ON cliente.id = ar.cliente_id
    WHERE ar.id = p_ar_id;

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    ar_id := v_pago_existente.ar_id;
    monto_aplicado_ar := v_pago_existente.monto_aplicado_ar;
    monto_sobrepago_ar := v_pago_existente.monto_sobrepago_ar;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ar.*
  INTO v_ar
  FROM public.cuentas_por_cobrar AS ar
  WHERE ar.id = p_ar_id
  FOR UPDATE;

  IF NOT FOUND OR v_ar.estado NOT IN ('pendiente', 'parcial') OR v_ar.saldo_pendiente <= 0 THEN
    RAISE EXCEPTION 'cuenta_no_disponible_para_pago' USING ERRCODE = 'check_violation';
  END IF;

  -- Una AR en MXN debe tener TC 1; cualquier otra combinación es drift de datos
  -- que distorsionaría aging, crédito usado y rentabilidad.
  IF v_ar.moneda = 'MXN' AND round(v_ar.tipo_cambio_origen, 4) <> 1 THEN
    RAISE EXCEPTION 'cuenta_mxn_tipo_cambio_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- El lock de cliente se toma después de la cuenta, igual que aplicar_saldo_favor_ar.
  SELECT cliente.saldo_a_favor
  INTO v_saldo_a_favor
  FROM public.clientes AS cliente
  WHERE cliente.id = v_ar.cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  v_equivalente_ar := p_monto_pagado * p_tipo_cambio_pago / v_ar.tipo_cambio_origen;
  IF v_equivalente_ar IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_equivalente_ar <= 0 THEN
    RAISE EXCEPTION 'conversion_pago_invalida' USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  v_monto_aplicado_ar := round(least(v_equivalente_ar, v_ar.saldo_pendiente), 4);
  v_monto_sobrepago_ar := round(greatest(v_equivalente_ar - v_ar.saldo_pendiente, 0), 4);
  v_folio_recibo := public.generar_folio_recibo('REC');

  INSERT INTO public.pagos_ar (
    ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
    monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, referencia_bancaria,
    cuenta_bancaria_id, notas, creado_por
  ) VALUES (
    v_ar.id, v_folio_recibo, p_solicitud_id, round(p_monto_pagado, 4), upper(trim(p_moneda_pago)),
    round(p_tipo_cambio_pago, 4), v_monto_aplicado_ar, v_monto_sobrepago_ar,
    lower(trim(p_metodo_pago)), NULLIF(btrim(p_referencia), ''), p_cuenta_bancaria_id,
    NULLIF(btrim(p_notas), ''), p_usuario_id
  ) ON CONFLICT (solicitud_id) DO NOTHING
  RETURNING id INTO v_pago_id;

  IF NOT FOUND THEN
    SELECT pago.*
    INTO v_pago_existente
    FROM public.pagos_ar AS pago
    WHERE pago.solicitud_id = p_solicitud_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'conflicto_idempotencia_no_resuelto' USING ERRCODE = 'serialization_failure';
    END IF;

    IF v_pago_existente.ar_id <> p_ar_id OR v_pago_existente.creado_por <> p_usuario_id THEN
      RAISE EXCEPTION 'solicitud_pago_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT ar.saldo_pendiente, ar.estado, cliente.saldo_a_favor
    INTO saldo_pendiente, estado_ar, saldo_a_favor_mxn
    FROM public.cuentas_por_cobrar AS ar
    JOIN public.clientes AS cliente ON cliente.id = ar.cliente_id
    WHERE ar.id = p_ar_id;

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    ar_id := v_pago_existente.ar_id;
    monto_aplicado_ar := v_pago_existente.monto_aplicado_ar;
    monto_sobrepago_ar := v_pago_existente.monto_sobrepago_ar;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.cuentas_por_cobrar AS ar
  SET
    saldo_pendiente = round(ar.saldo_pendiente - v_monto_aplicado_ar, 4),
    estado = CASE
      WHEN round(ar.saldo_pendiente - v_monto_aplicado_ar, 4) = 0 THEN 'pagado'
      ELSE 'parcial'
    END
  WHERE ar.id = v_ar.id
  RETURNING ar.saldo_pendiente, ar.estado INTO saldo_pendiente, estado_ar;

  IF v_monto_sobrepago_ar > 0 THEN
    v_credito_mxn := round(v_monto_sobrepago_ar * v_ar.tipo_cambio_origen, 4);
    INSERT INTO public.movimientos_saldo_favor (
      cliente_id, ar_id_origen, pago_ar_id, monto, moneda, tipo, descripcion, creado_por
    ) VALUES (
      v_ar.cliente_id, v_ar.id, v_pago_id, v_credito_mxn, 'MXN', 'credito_sobrepago',
      'Crédito por sobrepago del recibo ' || v_folio_recibo, p_usuario_id
    );

    UPDATE public.clientes AS cliente
    SET saldo_a_favor = round(cliente.saldo_a_favor + v_credito_mxn, 4)
    WHERE cliente.id = v_ar.cliente_id
    RETURNING cliente.saldo_a_favor INTO v_saldo_a_favor;
  END IF;

  pago_id := v_pago_id;
  folio_recibo := v_folio_recibo;
  ar_id := v_ar.id;
  monto_aplicado_ar := v_monto_aplicado_ar;
  monto_sobrepago_ar := v_monto_sobrepago_ar;
  saldo_a_favor_mxn := v_saldo_a_favor;
  idempotente := false;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor_ar(
  p_cliente_id uuid,
  p_ar_id uuid,
  p_monto_mxn numeric,
  p_usuario_id uuid,
  p_solicitud_id uuid
)
RETURNS TABLE (
  pago_id uuid,
  folio_recibo text,
  ar_id uuid,
  saldo_pendiente numeric,
  estado_ar text,
  monto_aplicado_ar numeric,
  saldo_a_favor_mxn numeric,
  idempotente boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ar public.cuentas_por_cobrar%ROWTYPE;
  v_pago_existente public.pagos_ar%ROWTYPE;
  v_saldo_a_favor numeric(14, 4);
  v_equivalente_ar numeric(18, 6);
  v_monto_aplicado_ar numeric(12, 4);
  v_folio_recibo text;
  v_pago_id uuid;
BEGIN
  IF p_cliente_id IS NULL OR p_ar_id IS NULL OR p_usuario_id IS NULL OR p_solicitud_id IS NULL
     OR p_monto_mxn IS NULL OR p_monto_mxn <= 0
     OR p_monto_mxn IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'datos_aplicacion_saldo_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  -- Permiso financiero explícito (mismo criterio que registrar_pago_ar_atomico).
  PERFORM 1
  FROM public.usuarios AS usuario
  INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
    AND permiso.permiso = 'aplicar_saldos';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_saldos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT pago.*
  INTO v_pago_existente
  FROM public.pagos_ar AS pago
  WHERE pago.solicitud_id = p_solicitud_id
  FOR KEY SHARE;

  IF FOUND THEN
    IF v_pago_existente.ar_id <> p_ar_id
       OR v_pago_existente.creado_por <> p_usuario_id
       OR v_pago_existente.metodo_pago <> 'saldo_a_favor' THEN
      RAISE EXCEPTION 'solicitud_aplicacion_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT ar.saldo_pendiente, ar.estado, cliente.saldo_a_favor
    INTO saldo_pendiente, estado_ar, saldo_a_favor_mxn
    FROM public.cuentas_por_cobrar AS ar
    JOIN public.clientes AS cliente ON cliente.id = ar.cliente_id
    WHERE ar.id = p_ar_id
      AND ar.cliente_id = p_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'solicitud_aplicacion_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    ar_id := v_pago_existente.ar_id;
    monto_aplicado_ar := v_pago_existente.monto_aplicado_ar;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ar.*
  INTO v_ar
  FROM public.cuentas_por_cobrar AS ar
  WHERE ar.id = p_ar_id
    AND ar.cliente_id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND OR v_ar.estado NOT IN ('pendiente', 'parcial') OR v_ar.saldo_pendiente <= 0 THEN
    RAISE EXCEPTION 'cuenta_no_disponible_para_aplicacion' USING ERRCODE = 'check_violation';
  END IF;

  IF v_ar.moneda = 'MXN' AND round(v_ar.tipo_cambio_origen, 4) <> 1 THEN
    RAISE EXCEPTION 'cuenta_mxn_tipo_cambio_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cliente.saldo_a_favor
  INTO v_saldo_a_favor
  FROM public.clientes AS cliente
  WHERE cliente.id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND OR v_saldo_a_favor < round(p_monto_mxn, 4) THEN
    RAISE EXCEPTION 'saldo_a_favor_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_equivalente_ar := p_monto_mxn / v_ar.tipo_cambio_origen;
  v_monto_aplicado_ar := round(least(v_equivalente_ar, v_ar.saldo_pendiente), 4);
  IF v_monto_aplicado_ar <= 0 THEN
    RAISE EXCEPTION 'aplicacion_saldo_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Nunca debita más MXN de los que realmente quedaron aplicados tras redondear.
  p_monto_mxn := round(v_monto_aplicado_ar * v_ar.tipo_cambio_origen, 4);
  IF p_monto_mxn > v_saldo_a_favor THEN
    RAISE EXCEPTION 'saldo_a_favor_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_folio_recibo := public.generar_folio_recibo('REC');
  INSERT INTO public.pagos_ar (
    ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
    monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, referencia_bancaria, creado_por
  ) VALUES (
    v_ar.id, v_folio_recibo, p_solicitud_id, p_monto_mxn, 'MXN', 1.0000,
    v_monto_aplicado_ar, 0, 'saldo_a_favor', 'Aplicación de monedero', p_usuario_id
  ) ON CONFLICT (solicitud_id) DO NOTHING
  RETURNING id INTO v_pago_id;

  IF NOT FOUND THEN
    SELECT pago.*
    INTO v_pago_existente
    FROM public.pagos_ar AS pago
    WHERE pago.solicitud_id = p_solicitud_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'conflicto_idempotencia_no_resuelto' USING ERRCODE = 'serialization_failure';
    END IF;

    IF v_pago_existente.ar_id <> p_ar_id
       OR v_pago_existente.creado_por <> p_usuario_id
       OR v_pago_existente.metodo_pago <> 'saldo_a_favor' THEN
      RAISE EXCEPTION 'solicitud_aplicacion_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT ar.saldo_pendiente, ar.estado, cliente.saldo_a_favor
    INTO saldo_pendiente, estado_ar, saldo_a_favor_mxn
    FROM public.cuentas_por_cobrar AS ar
    JOIN public.clientes AS cliente ON cliente.id = ar.cliente_id
    WHERE ar.id = p_ar_id
      AND ar.cliente_id = p_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'solicitud_aplicacion_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    ar_id := v_pago_existente.ar_id;
    monto_aplicado_ar := v_pago_existente.monto_aplicado_ar;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.movimientos_saldo_favor (
    cliente_id, ar_id_origen, pago_ar_id, monto, moneda, tipo, descripcion, creado_por
  ) VALUES (
    p_cliente_id, v_ar.id, v_pago_id, -p_monto_mxn, 'MXN', 'aplicacion_pago',
    'Aplicación a cuenta AR mediante recibo ' || v_folio_recibo, p_usuario_id
  );

  UPDATE public.clientes AS cliente
  SET saldo_a_favor = round(cliente.saldo_a_favor - p_monto_mxn, 4)
  WHERE cliente.id = p_cliente_id
  RETURNING cliente.saldo_a_favor INTO v_saldo_a_favor;

  UPDATE public.cuentas_por_cobrar AS ar
  SET
    saldo_pendiente = round(ar.saldo_pendiente - v_monto_aplicado_ar, 4),
    estado = CASE
      WHEN round(ar.saldo_pendiente - v_monto_aplicado_ar, 4) = 0 THEN 'pagado'
      ELSE 'parcial'
    END
  WHERE ar.id = v_ar.id
  RETURNING ar.saldo_pendiente, ar.estado INTO saldo_pendiente, estado_ar;

  pago_id := v_pago_id;
  folio_recibo := v_folio_recibo;
  ar_id := v_ar.id;
  monto_aplicado_ar := v_monto_aplicado_ar;
  saldo_a_favor_mxn := v_saldo_a_favor;
  idempotente := false;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_ar_atomico(
  uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_ar_atomico(
  uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- C bis) Refuerzo declarativo: MXN siempre con TC 1, incluso en escrituras
--        futuras que no pasen por las RPC. NOT VALID no bloquea datos ya
--        existentes; solo aplica a filas nuevas/actualizadas.
-- -----------------------------------------------------------------------------
DO $auditoria$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cuentas_por_cobrar_mxn_tc_uno'
  ) THEN
    ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT cuentas_por_cobrar_mxn_tc_uno
      CHECK (moneda <> 'MXN' OR tipo_cambio_origen = 1) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pagos_ar_mxn_tc_uno'
  ) THEN
    ALTER TABLE public.pagos_ar
      ADD CONSTRAINT pagos_ar_mxn_tc_uno
      CHECK (moneda_pago <> 'MXN' OR tipo_cambio_pago = 1) NOT VALID;
  END IF;
END;
$auditoria$;

-- -----------------------------------------------------------------------------
-- D) Ganar una oportunidad cuya OP ya existe debe reconciliar etapa/cliente.
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
  v_orden_id uuid;
  v_folio text;
  v_orden_cliente_id uuid;
  v_partidas jsonb;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad
  INTO v_etapa, v_prioridad
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
    -- La OP ya existe: es un reintento (o una reversión admin volvió a ganar).
    -- Se exige el mismo cliente y se reconcilia la etapa para no reportar un
    -- éxito sobre una oportunidad que quedó fuera de `ganada`.
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

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera una orden desde sus líneas y marca ganada en una transacción; reconcilia reintentos. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- E) Sin INSERT directo de `authenticated` en pipeline: todo folio OP pasa por
--    la SEQUENCE y la Server Action auditada. La Server Action usa service_role
--    (sin RLS) y no depende de esta política.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pipeline_insertar ON public.pipeline;
