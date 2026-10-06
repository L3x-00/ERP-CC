-- =============================================================================
-- SII-B8 F3 (ajuste) — Aplicaciones sin cláusula ON CONFLICT ambigua
--
-- pago_id es parámetro OUT de ambos motores y la cláusula de inferencia de
-- conflicto lo resolvía como variable. La aplicación recién insertada en la misma
-- transacción no puede chocar, así que el ON CONFLICT sobra.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007180002).
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
  VALUES (v_pago_id, v_ar.id, v_monto_aplicado_ar);

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

REVOKE ALL ON FUNCTION public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid) TO service_role;

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
  VALUES (v_pago_id, v_ar.id, v_monto_aplicado_ar);

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

REVOKE ALL ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid) TO service_role;
