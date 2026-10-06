-- =============================================================================
-- SII-B8 F3 (motores) — Cobros repartidos, reverso por aplicaciones y promesas
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.2/§8.3 F3; decisiones PO 2026-10-06.
-- Recrea registrar_pago_ar_atomico/aplicar_saldo_favor_ar (registro de la
-- aplicación N:M y promesa cumplida al pagar) y reversar_pago_ar (reverso por
-- aplicaciones, legacy y repartido). Además: folio RP-MMYY_0000-YY,
-- registrar_cobro_multiple y promesas con recordatorios internos.
-- Corrige los literales con acentos del motor recreado en 20261007160001.
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

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

  -- Serializa reintentos de esta intención antes de revisar estado/saldo.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_solicitud_id::text, 0));

  -- Un reintento de la misma intención no crea otro recibo ni vuelve a tocar saldos.
  SELECT pago.*
  INTO v_pago_existente
  FROM public.pagos_ar AS pago
  WHERE pago.solicitud_id = p_solicitud_id
  FOR KEY SHARE;

  IF FOUND THEN
    IF v_pago_existente.ar_id <> p_ar_id OR v_pago_existente.creado_por <> p_usuario_id
       OR v_pago_existente.monto_pagado IS DISTINCT FROM round(p_monto_pagado, 4)
       OR v_pago_existente.moneda_pago IS DISTINCT FROM upper(trim(p_moneda_pago))
       OR v_pago_existente.tipo_cambio_pago IS DISTINCT FROM round(p_tipo_cambio_pago, 4)
       OR v_pago_existente.metodo_pago IS DISTINCT FROM lower(trim(p_metodo_pago))
       OR v_pago_existente.referencia_bancaria IS DISTINCT FROM nullif(btrim(p_referencia), '')
       OR v_pago_existente.cuenta_bancaria_id IS DISTINCT FROM p_cuenta_bancaria_id
       OR v_pago_existente.notas IS DISTINCT FROM nullif(btrim(p_notas), '') THEN
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

  -- Se valida solo un pago nuevo: desactivar el banco no invalida sus recibos.
  -- SHARE también bloquea cambios no clave (activa/moneda) hasta el commit.
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_bancarias AS banco
    WHERE banco.id = p_cuenta_bancaria_id AND banco.activa
      AND banco.moneda = upper(trim(p_moneda_pago))
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_bancaria_no_disponible' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_equivalente_ar := p_monto_pagado * p_tipo_cambio_pago / v_ar.tipo_cambio_origen;
  IF v_equivalente_ar IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_equivalente_ar <= 0 THEN
    RAISE EXCEPTION 'conversion_pago_invalida' USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  v_monto_aplicado_ar := round(least(v_equivalente_ar, v_ar.saldo_pendiente), 4);
  v_monto_sobrepago_ar := round(greatest(v_equivalente_ar - v_ar.saldo_pendiente, 0), 4);
  -- SII-B8 F1: folio RP-MMYY_XX-YY (espejo del NE) cuando la orden tiene
  -- folio_sii; órdenes históricas sin folio conservan REC-######.
  v_folio_recibo := privado.siguiente_folio_recibo(v_ar.orden_id);
  IF v_folio_recibo IS NULL THEN
    v_folio_recibo := public.generar_folio_recibo('REC');
  END IF;

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

    IF v_pago_existente.ar_id <> p_ar_id OR v_pago_existente.creado_por <> p_usuario_id
       OR v_pago_existente.monto_pagado IS DISTINCT FROM round(p_monto_pagado, 4)
       OR v_pago_existente.moneda_pago IS DISTINCT FROM upper(trim(p_moneda_pago))
       OR v_pago_existente.tipo_cambio_pago IS DISTINCT FROM round(p_tipo_cambio_pago, 4)
       OR v_pago_existente.metodo_pago IS DISTINCT FROM lower(trim(p_metodo_pago))
       OR v_pago_existente.referencia_bancaria IS DISTINCT FROM nullif(btrim(p_referencia), '')
       OR v_pago_existente.cuenta_bancaria_id IS DISTINCT FROM p_cuenta_bancaria_id
       OR v_pago_existente.notas IS DISTINCT FROM nullif(btrim(p_notas), '') THEN
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

  -- SII-B8 F3: aplicación N:M del recibo sobre su AR.
  INSERT INTO public.aplicaciones_pago (pago_id, cuenta_id, monto)
  VALUES (v_pago_id, v_ar.id, v_monto_aplicado_ar)
  ON CONFLICT (pago_id, cuenta_id) DO NOTHING;

  UPDATE public.cuentas_por_cobrar AS ar
  SET
    saldo_pendiente = round(ar.saldo_pendiente - v_monto_aplicado_ar, 4),
    estado = CASE
      WHEN round(ar.saldo_pendiente - v_monto_aplicado_ar, 4) = 0 THEN 'pagado'
      ELSE 'parcial'
    END
  WHERE ar.id = v_ar.id
  RETURNING ar.saldo_pendiente, ar.estado INTO saldo_pendiente, estado_ar;

  IF saldo_pendiente <= 0 THEN
    UPDATE public.promesas_pago
    SET estado = 'CUMPLIDA'
    WHERE cuenta_id = v_ar.id AND estado IN ('VIGENTE', 'VENCIDA');
  END IF;

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

COMMENT ON FUNCTION public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid) IS
'SII-B8 F1/F3: registra el pago con folio RP derivado (REC en históricos), su aplicación N:M y la promesa cumplida al pagar; idempotente por solicitud_id. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid)
  TO service_role;

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

  -- SII-B8 F1: folio RP-MMYY_XX-YY (espejo del NE) cuando la orden tiene
  -- folio_sii; órdenes históricas sin folio conservan REC-######.
  v_folio_recibo := privado.siguiente_folio_recibo(v_ar.orden_id);
  IF v_folio_recibo IS NULL THEN
    v_folio_recibo := public.generar_folio_recibo('REC');
  END IF;
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

  -- SII-B8 F3: aplicación N:M del recibo de monedero sobre su AR.
  INSERT INTO public.aplicaciones_pago (pago_id, cuenta_id, monto)
  VALUES (v_pago_id, v_ar.id, v_monto_aplicado_ar)
  ON CONFLICT (pago_id, cuenta_id) DO NOTHING;

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

  IF saldo_pendiente <= 0 THEN
    UPDATE public.promesas_pago
    SET estado = 'CUMPLIDA'
    WHERE cuenta_id = v_ar.id AND estado IN ('VIGENTE', 'VENCIDA');
  END IF;

  pago_id := v_pago_id;
  folio_recibo := v_folio_recibo;
  ar_id := v_ar.id;
  monto_aplicado_ar := v_monto_aplicado_ar;
  saldo_a_favor_mxn := v_saldo_a_favor;
  idempotente := false;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid) IS
'SII-B8 F1/F3: aplica monedero con folio RP derivado (REC en históricos), su aplicación N:M y la promesa cumplida al pagar; idempotente por solicitud_id. Solo service_role.';

REVOKE ALL ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid)
  TO service_role;


-- -----------------------------------------------------------------------------
-- Folio de recibos repartidos: RP-MMYY_0000-YY (contador global del periodo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.siguiente_folio_recibo_multiple()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_periodo text := to_char(now(), 'MMYY');
  v_consecutivo integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('recibo-multiple:' || v_periodo, 0));

  SELECT count(*) + 1
  INTO v_consecutivo
  FROM public.pagos_ar AS pago
  WHERE pago.ar_id IS NULL
    AND pago.folio_recibo LIKE 'RP-' || v_periodo || '_0000-%';

  RETURN 'RP-' || v_periodo || '_0000-' ||
    CASE WHEN v_consecutivo < 100
      THEN lpad(v_consecutivo::text, 2, '0')
      ELSE v_consecutivo::text
    END;
END;
$function$;

COMMENT ON FUNCTION privado.siguiente_folio_recibo_multiple() IS
'SII-B8 F3: RP-MMYY_0000-YY para recibos repartidos entre varias AR (contador global del periodo, CASE para 100+).';

REVOKE ALL ON FUNCTION privado.siguiente_folio_recibo_multiple()
  FROM PUBLIC, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- AR-08/F3: reverso atómico por aplicaciones (soporta recibos repartidos).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reversar_pago_ar(
  p_pago_id uuid,
  p_motivo text,
  p_actor_id uuid
)
RETURNS TABLE (
  pago_id uuid,
  ar_id uuid,
  folio_recibo text,
  saldo_pendiente numeric,
  estado_ar text,
  monedero_revertido_mxn numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pago public.pagos_ar%ROWTYPE;
  v_aplicacion record;
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_credito_mxn numeric(14, 4) := 0;
  v_suma_aplicada_mxn numeric(14, 4) := 0;
  v_saldo numeric;
  v_estado text;
  v_primera_ar uuid;
  v_primera_saldo numeric;
  v_primera_estado text;
  v_contador integer := 0;
BEGIN
  IF p_pago_id IS NULL OR p_actor_id IS NULL
     OR length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'reverso_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_registrar_pagos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_pago FROM public.pagos_ar AS pago
  WHERE pago.id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reversos_pago_ar AS reverso WHERE reverso.pago_id = p_pago_id) THEN
    RAISE EXCEPTION 'pago_ya_reversado' USING ERRCODE = 'unique_violation';
  END IF;

  -- Todas las AR tocadas por el recibo, en orden de id para evitar ciclos de locks.
  FOR v_aplicacion IN
    SELECT aplicacion.cuenta_id, aplicacion.monto
    FROM public.aplicaciones_pago AS aplicacion
    WHERE aplicacion.pago_id = p_pago_id
    ORDER BY aplicacion.cuenta_id
    FOR UPDATE
  LOOP
    SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.id = v_aplicacion.cuenta_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_cuenta.estado = 'cancelado' THEN
      RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
    END IF;

    v_saldo := least(round(v_cuenta.saldo_pendiente + v_aplicacion.monto, 4), v_cuenta.monto_total);
    v_estado := CASE
      WHEN v_saldo <= 0 THEN 'pagado'
      WHEN v_saldo < v_cuenta.monto_total THEN 'parcial'
      ELSE 'pendiente'
    END;

    UPDATE public.cuentas_por_cobrar AS cuenta
    SET saldo_pendiente = v_saldo, estado = v_estado
    WHERE cuenta.id = v_cuenta.id;

    IF v_contador = 0 THEN
      v_primera_ar := v_cuenta.id;
      v_primera_saldo := v_saldo;
      v_primera_estado := v_estado;
    END IF;
    v_contador := v_contador + 1;
    v_suma_aplicada_mxn := v_suma_aplicada_mxn
      + round(v_aplicacion.monto * v_cuenta.tipo_cambio_origen, 4);
  END LOOP;

  IF v_contador = 0 THEN
    RAISE EXCEPTION 'pago_sin_aplicaciones' USING ERRCODE = 'no_data_found';
  END IF;

  -- El crédito en monedero del reverso es la diferencia entre lo pagado y lo
  -- aplicado (mismo valor que acreditó el alta, para legacy y repartidos).
  v_credito_mxn := greatest(
    round(v_pago.monto_pagado * v_pago.tipo_cambio_pago - v_suma_aplicada_mxn, 4), 0);

  IF v_credito_mxn > 0 THEN
    PERFORM 1 FROM public.clientes AS cliente
    WHERE cliente.id = v_cuenta.cliente_id AND cliente.saldo_a_favor >= v_credito_mxn
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'saldo_favor_insuficiente' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.clientes AS cliente
    SET saldo_a_favor = cliente.saldo_a_favor - v_credito_mxn
    WHERE cliente.id = v_cuenta.cliente_id;
    INSERT INTO public.movimientos_saldo_favor (
      cliente_id, ar_id_origen, monto, moneda, tipo, descripcion, creado_por
    ) VALUES (
      v_cuenta.cliente_id, v_primera_ar, -v_credito_mxn, 'MXN', 'ajuste_manual',
      'Reverso de ' || v_pago.folio_recibo, p_actor_id
    );
  END IF;

  INSERT INTO public.reversos_pago_ar (
    pago_id, ar_id, motivo, monto_aplicado_reverso, monto_sobrepago_reverso,
    monedero_revertido_mxn, creado_por
  ) VALUES (
    v_pago.id, v_primera_ar, v_motivo, v_pago.monto_aplicado_ar,
    v_pago.monto_sobrepago_ar, v_credito_mxn, p_actor_id
  );

  RETURN QUERY SELECT v_pago.id, v_primera_ar, v_pago.folio_recibo,
    v_primera_saldo, v_primera_estado, v_credito_mxn;
END;
$function$;

COMMENT ON FUNCTION public.reversar_pago_ar(uuid, text, uuid) IS
'SII-B8 F3: revierte un pago con motivo, restituye saldo/estado de cada AR aplicada y el monedero; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.reversar_pago_ar(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reversar_pago_ar(uuid, text, uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- F3: cobro repartido — un recibo RP aplicado a varias AR del mismo cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_cobro_multiple(
  p_cliente_id uuid,
  p_monto_pagado numeric,
  p_moneda_pago text,
  p_tipo_cambio_pago numeric,
  p_metodo_pago text,
  p_referencia text,
  p_cuenta_bancaria_id uuid,
  p_notas text,
  p_aplicaciones jsonb,
  p_usuario_id uuid,
  p_solicitud_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pago_id uuid,
  folio_recibo text,
  aplicado_pago numeric,
  sobrepago_pago numeric,
  saldo_a_favor_mxn numeric,
  aplicaciones integer,
  idempotente boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pago_existente public.pagos_ar%ROWTYPE;
  v_saldo_a_favor numeric(14, 4);
  v_aplicado_mxn numeric(18, 6) := 0;
  v_aplicado_pago numeric(14, 4);
  v_sobrepago_pago numeric(14, 4);
  v_credito_mxn numeric(14, 4);
  v_entrada record;
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_folio text;
  v_pago_id uuid;
  v_contador integer := 0;
  v_credito_final numeric(14, 4) := 0;
  v_estado text;
  v_ya_existia integer;
BEGIN
  IF p_cliente_id IS NULL OR p_usuario_id IS NULL OR p_solicitud_id IS NULL
     OR p_monto_pagado IS NULL OR p_monto_pagado <= 0
     OR p_monto_pagado IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_tipo_cambio_pago IS NULL OR p_tipo_cambio_pago <= 0
     OR p_tipo_cambio_pago IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR upper(trim(coalesce(p_moneda_pago, ''))) NOT IN ('USD', 'MXN')
     OR lower(trim(coalesce(p_metodo_pago, ''))) NOT IN ('transferencia', 'efectivo', 'cheque', 'tarjeta')
     OR p_aplicaciones IS NULL OR jsonb_typeof(p_aplicaciones) <> 'array'
     OR jsonb_array_length(p_aplicaciones) = 0 THEN
    RAISE EXCEPTION 'datos_cobro_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  IF upper(trim(p_moneda_pago)) = 'MXN' AND round(p_tipo_cambio_pago, 4) <> 1 THEN
    RAISE EXCEPTION 'tipo_cambio_mxn_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
  WHERE usuario.id = p_usuario_id
    AND usuario.activo = true
    AND permiso.permiso = 'registrar_pagos';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso_pagos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_solicitud_id::text, 0));

  SELECT pago.* INTO v_pago_existente
  FROM public.pagos_ar AS pago
  WHERE pago.solicitud_id = p_solicitud_id
  FOR KEY SHARE;

  IF FOUND THEN
    IF v_pago_existente.creado_por <> p_usuario_id
       OR v_pago_existente.monto_pagado IS DISTINCT FROM round(p_monto_pagado, 4)
       OR v_pago_existente.moneda_pago IS DISTINCT FROM upper(trim(p_moneda_pago))
       OR v_pago_existente.tipo_cambio_pago IS DISTINCT FROM round(p_tipo_cambio_pago, 4)
       OR v_pago_existente.metodo_pago IS DISTINCT FROM lower(trim(p_metodo_pago)) THEN
      RAISE EXCEPTION 'solicitud_cobro_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*)::integer INTO v_ya_existia
    FROM public.aplicaciones_pago AS aplicacion
    WHERE aplicacion.pago_id = v_pago_existente.id;

    SELECT cliente.saldo_a_favor INTO v_saldo_a_favor
    FROM public.clientes AS cliente WHERE cliente.id = p_cliente_id;

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    aplicado_pago := v_pago_existente.monto_aplicado_ar;
    sobrepago_pago := v_pago_existente.monto_sobrepago_ar;
    saldo_a_favor_mxn := v_saldo_a_favor;
    aplicaciones := v_ya_existia;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Validación de aplicaciones: sin duplicados, montos positivos y AR del cliente.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_aplicaciones) AS entrada(cuenta_id uuid, monto numeric)
    GROUP BY entrada.cuenta_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'aplicacion_duplicada' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_aplicaciones) AS entrada(cuenta_id uuid, monto numeric)
    WHERE entrada.cuenta_id IS NULL OR entrada.monto IS NULL
       OR entrada.monto <= 0
       OR entrada.monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ) THEN
    RAISE EXCEPTION 'aplicacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock de todas las AR en orden de id (evita ciclos con el flujo 1-AR).
  FOR v_entrada IN
    SELECT entrada.cuenta_id, entrada.monto
    FROM jsonb_to_recordset(p_aplicaciones) AS entrada(cuenta_id uuid, monto numeric)
    ORDER BY entrada.cuenta_id
  LOOP
    SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.id = v_entrada.cuenta_id FOR UPDATE;
    IF NOT FOUND OR v_cuenta.cliente_id <> p_cliente_id THEN
      RAISE EXCEPTION 'cuenta_no_corresponde_cliente' USING ERRCODE = 'check_violation';
    END IF;
    IF v_cuenta.estado NOT IN ('pendiente', 'parcial') OR v_cuenta.saldo_pendiente <= 0 THEN
      RAISE EXCEPTION 'cuenta_no_disponible_para_pago' USING ERRCODE = 'check_violation';
    END IF;
    IF round(v_entrada.monto, 4) > v_cuenta.saldo_pendiente THEN
      RAISE EXCEPTION 'monto_excede_saldo' USING ERRCODE = 'check_violation';
    END IF;
    v_aplicado_mxn := v_aplicado_mxn + round(v_entrada.monto * v_cuenta.tipo_cambio_origen, 6);
    v_contador := v_contador + 1;
  END LOOP;

  v_aplicado_pago := round(v_aplicado_mxn / p_tipo_cambio_pago, 4);
  IF v_aplicado_pago > round(p_monto_pagado, 4) THEN
    RAISE EXCEPTION 'aplicaciones_exceden_pago' USING ERRCODE = 'check_violation';
  END IF;
  v_sobrepago_pago := round(p_monto_pagado - v_aplicado_pago, 4);
  v_credito_mxn := round(v_sobrepago_pago * p_tipo_cambio_pago, 4);

  PERFORM 1 FROM public.usuarios AS usuario
  WHERE usuario.id = p_usuario_id AND usuario.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.clientes AS cliente
  WHERE cliente.id = p_cliente_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_bancarias AS banco
    WHERE banco.id = p_cuenta_bancaria_id AND banco.activa
      AND banco.moneda = upper(trim(p_moneda_pago))
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cuenta_bancaria_no_disponible' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_folio := privado.siguiente_folio_recibo_multiple();

  INSERT INTO public.pagos_ar (
    ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
    monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, referencia_bancaria,
    cuenta_bancaria_id, notas, creado_por
  ) VALUES (
    NULL, v_folio, p_solicitud_id, round(p_monto_pagado, 4), upper(trim(p_moneda_pago)),
    round(p_tipo_cambio_pago, 4), v_aplicado_pago, v_sobrepago_pago,
    lower(trim(p_metodo_pago)), NULLIF(btrim(p_referencia), ''), p_cuenta_bancaria_id,
    NULLIF(btrim(p_notas), ''), p_usuario_id
  ) ON CONFLICT (solicitud_id) DO NOTHING
  RETURNING id INTO v_pago_id;

  IF NOT FOUND THEN
    SELECT pago.* INTO v_pago_existente
    FROM public.pagos_ar AS pago
    WHERE pago.solicitud_id = p_solicitud_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conflicto_idempotencia_no_resuelto' USING ERRCODE = 'serialization_failure';
    END IF;
    SELECT count(*)::integer INTO v_ya_existia
    FROM public.aplicaciones_pago AS aplicacion
    WHERE aplicacion.pago_id = v_pago_existente.id;
    SELECT cliente.saldo_a_favor INTO v_saldo_a_favor
    FROM public.clientes AS cliente WHERE cliente.id = p_cliente_id;
    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    aplicado_pago := v_pago_existente.monto_aplicado_ar;
    sobrepago_pago := v_pago_existente.monto_sobrepago_ar;
    saldo_a_favor_mxn := v_saldo_a_favor;
    aplicaciones := v_ya_existia;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Aplicación por AR (locks ya tomados en orden).
  FOR v_entrada IN
    SELECT entrada.cuenta_id, entrada.monto
    FROM jsonb_to_recordset(p_aplicaciones) AS entrada(cuenta_id uuid, monto numeric)
    ORDER BY entrada.cuenta_id
  LOOP
    SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.id = v_entrada.cuenta_id;

    v_estado := CASE
      WHEN round(v_cuenta.saldo_pendiente - round(v_entrada.monto, 4), 4) = 0 THEN 'pagado'
      ELSE 'parcial'
    END;

    UPDATE public.cuentas_por_cobrar AS cuenta
    SET saldo_pendiente = round(cuenta.saldo_pendiente - round(v_entrada.monto, 4), 4),
        estado = v_estado
    WHERE cuenta.id = v_cuenta.id;

    INSERT INTO public.aplicaciones_pago (pago_id, cuenta_id, monto)
    VALUES (v_pago_id, v_cuenta.id, round(v_entrada.monto, 4));

    IF v_estado = 'pagado' THEN
      UPDATE public.promesas_pago
      SET estado = 'CUMPLIDA'
      WHERE cuenta_id = v_cuenta.id AND estado IN ('VIGENTE', 'VENCIDA');
    END IF;
  END LOOP;

  IF v_credito_mxn > 0 THEN
    INSERT INTO public.movimientos_saldo_favor (
      cliente_id, ar_id_origen, pago_ar_id, monto, moneda, tipo, descripcion, creado_por
    ) VALUES (
      p_cliente_id, NULL, v_pago_id, v_credito_mxn, 'MXN', 'credito_sobrepago',
      'Crédito por sobrepago del recibo ' || v_folio, p_usuario_id
    );
    UPDATE public.clientes AS cliente
    SET saldo_a_favor = round(cliente.saldo_a_favor + v_credito_mxn, 4)
    WHERE cliente.id = p_cliente_id
    RETURNING cliente.saldo_a_favor INTO v_saldo_a_favor;
    v_credito_final := v_credito_mxn;
  ELSE
    SELECT cliente.saldo_a_favor INTO v_saldo_a_favor
    FROM public.clientes AS cliente WHERE cliente.id = p_cliente_id;
  END IF;

  pago_id := v_pago_id;
  folio_recibo := v_folio;
  aplicado_pago := v_aplicado_pago;
  sobrepago_pago := v_sobrepago_pago;
  saldo_a_favor_mxn := v_saldo_a_favor;
  aplicaciones := v_contador;
  idempotente := false;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.registrar_cobro_multiple(uuid, numeric, text, numeric, text, text, uuid, text, jsonb, uuid, uuid, uuid) IS
'SII-B8 F3: registra un recibo RP-MMYY_0000-YY aplicado a varias AR del mismo cliente; excedente al monedero; idempotente por solicitud_id. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_cobro_multiple(uuid, numeric, text, numeric, text, text, uuid, text, jsonb, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cobro_multiple(uuid, numeric, text, numeric, text, text, uuid, text, jsonb, uuid, uuid, uuid)
  TO service_role;


-- -----------------------------------------------------------------------------
-- F3: promesas de pago con recordatorios (2 días antes y al vencer).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_promesa_pago(
  p_cuenta_id uuid,
  p_fecha_prometida date,
  p_monto numeric,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cuenta_id uuid,
  fecha_prometida date,
  monto numeric,
  estado text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_promesa public.promesas_pago%ROWTYPE;
BEGIN
  IF p_cuenta_id IS NULL OR p_actor_id IS NULL OR p_fecha_prometida IS NULL
     OR p_monto IS NULL OR p_monto <= 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_fecha_prometida < current_date
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_promesa_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' OR v_cuenta.saldo_pendiente <= 0 THEN
    RAISE EXCEPTION 'cuenta_no_disponible_para_promesa' USING ERRCODE = 'check_violation';
  END IF;
  IF round(p_monto, 4) > v_cuenta.saldo_pendiente THEN
    RAISE EXCEPTION 'monto_excede_saldo' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.promesas_pago AS promesa
    WHERE promesa.cuenta_id = p_cuenta_id AND promesa.estado IN ('VIGENTE', 'VENCIDA')
  ) THEN
    RAISE EXCEPTION 'promesa_ya_existe' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.promesas_pago (cuenta_id, fecha_prometida, monto, estado, creado_por)
  VALUES (p_cuenta_id, p_fecha_prometida, round(p_monto, 4), 'VIGENTE', p_actor_id)
  RETURNING * INTO v_promesa;

  RETURN QUERY SELECT v_promesa.id, v_promesa.cuenta_id, v_promesa.fecha_prometida,
    v_promesa.monto, v_promesa.estado, v_promesa.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid) IS
'SII-B8 F3: registra la promesa de pago de una AR (una activa por cuenta); solo service_role.';

REVOKE ALL ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancelar_promesa_pago(
  p_promesa_id uuid,
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
  v_promesa public.promesas_pago%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_promesa_id IS NULL OR p_actor_id IS NULL
     OR v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 300
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_cancelacion_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_promesa FROM public.promesas_pago AS promesa
  WHERE promesa.id = p_promesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promesa_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_promesa.estado NOT IN ('VIGENTE', 'VENCIDA') THEN
    RAISE EXCEPTION 'promesa_no_cancelable' USING ERRCODE = 'check_violation', DETAIL = v_promesa.estado;
  END IF;

  RETURN QUERY
  UPDATE public.promesas_pago AS promesa
  SET estado = 'CANCELADA', motivo_cancelacion = v_motivo
  WHERE promesa.id = p_promesa_id
  RETURNING promesa.id, promesa.estado, promesa.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_promesa_pago(uuid, text, uuid, uuid) IS
'SII-B8 F3: cancela una promesa vigente/vencida con motivo; solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_promesa_pago(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_promesa_pago(uuid, text, uuid, uuid) TO service_role;

-- Marca CUMPLIDA/VENCIDA y crea recordatorios internos una sola vez por promesa.
CREATE OR REPLACE FUNCTION public.procesar_recordatorios_promesas(
  p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cumplidas integer,
  vencidas integer,
  recordatorios_previos integer,
  recordatorios_vencidas integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cumplidas integer := 0;
  v_vencidas integer := 0;
  v_previos integer := 0;
  v_vencidas_notificadas integer := 0;
BEGIN
  IF p_actor_id IS NOT NULL
     AND NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos')
     AND NOT privado.actor_con_permiso(p_actor_id, 'ver_finanzas') THEN
    RAISE EXCEPTION 'sin_permiso_promesas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- CUMPLIDA automática: la AR quedó pagada.
  UPDATE public.promesas_pago AS promesa
  SET estado = 'CUMPLIDA'
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE promesa.cuenta_id = cuenta.id
    AND promesa.estado IN ('VIGENTE', 'VENCIDA')
    AND cuenta.estado = 'pagado';
  GET DIAGNOSTICS v_cumplidas = ROW_COUNT;

  -- Recordatorio 2 días antes (una vez por promesa y destinatario).
  WITH objetivo AS (
    UPDATE public.promesas_pago
    SET recordatorio_previo_en = now()
    WHERE estado = 'VIGENTE'
      AND recordatorio_previo_en IS NULL
      AND fecha_prometida >= current_date
      AND fecha_prometida <= current_date + 2
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           destino.usuario_id
    FROM objetivo
    CROSS JOIN LATERAL (
      SELECT objetivo.creado_por AS usuario_id
      UNION
      SELECT usuario.id
      FROM public.usuarios AS usuario
      JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
      WHERE usuario.activo AND permiso.permiso = 'registrar_pagos'
    ) AS destino
  )
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, enlace)
  SELECT destino.usuario_id, 'promesa_pago', 'Promesa de pago por vencer',
    'La promesa de $' || destino.monto::text || ' vence el ' || destino.fecha_prometida::text
      || ' (cuenta ' || destino.cuenta_id::text || ').',
    '/cobranza'
  FROM destinos AS destino;
  GET DIAGNOSTICS v_previos = ROW_COUNT;

  -- Vencidas: transición única (la bandera evita re-notificar).
  WITH objetivo AS (
    UPDATE public.promesas_pago
    SET estado = 'VENCIDA', recordatorio_vencida_en = now()
    WHERE estado = 'VIGENTE'
      AND fecha_prometida < current_date
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           destino.usuario_id
    FROM objetivo
    CROSS JOIN LATERAL (
      SELECT objetivo.creado_por AS usuario_id
      UNION
      SELECT usuario.id
      FROM public.usuarios AS usuario
      JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
      WHERE usuario.activo AND permiso.permiso = 'registrar_pagos'
    ) AS destino
  )
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, enlace)
  SELECT destino.usuario_id, 'promesa_pago', 'Promesa de pago vencida',
    'La promesa de $' || destino.monto::text || ' venció el ' || destino.fecha_prometida::text
      || ' y la cuenta sigue con saldo (cuenta ' || destino.cuenta_id::text || ').',
    '/cobranza'
  FROM destinos AS destino;
  GET DIAGNOSTICS v_vencidas_notificadas = ROW_COUNT;

  SELECT count(*)::integer INTO v_vencidas
  FROM public.promesas_pago AS promesa
  WHERE promesa.estado = 'VENCIDA';

  RETURN QUERY SELECT v_cumplidas, v_vencidas, v_previos, v_vencidas_notificadas;
END;
$function$;

COMMENT ON FUNCTION public.procesar_recordatorios_promesas(uuid) IS
'SII-B8 F3: marca promesas cumplidas/vencidas y genera recordatorios internos idempotentes (2 días antes y al vencer). Solo service_role.';

REVOKE ALL ON FUNCTION public.procesar_recordatorios_promesas(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_recordatorios_promesas(uuid) TO service_role;
