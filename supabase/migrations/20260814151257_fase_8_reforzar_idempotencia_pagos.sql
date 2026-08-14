-- Refuerza las funciones ya aplicadas antes de que la migración 8.1 ampliara
-- el monedero a (14,4). En una instalación nueva la definición base ya trae
-- estos cambios; en la base enlazada se transforma la definición anterior y
-- se falla explícitamente si no coincide con ninguna versión esperada.
DO $migracion$
DECLARE
  v_definicion text;
  v_reemplazo_pago text := $pago$
  ) ON CONFLICT (solicitud_id) DO NOTHING
  RETURNING id INTO v_pago_id;

  -- Si otra transacción ganó la misma llave, se devuelve su resultado sin
  -- aplicar un segundo pago.
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
$pago$;
  v_reemplazo_saldo text := $saldo$
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

    pago_id := v_pago_existente.id;
    folio_recibo := v_pago_existente.folio_recibo;
    ar_id := v_pago_existente.ar_id;
    monto_aplicado_ar := v_pago_existente.monto_aplicado_ar;
    idempotente := true;
    RETURN NEXT;
    RETURN;
  END IF;
$saldo$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.registrar_pago_ar_atomico(uuid,numeric,text,numeric,text,text,uuid,uuid,text,uuid)'::regprocedure
  ) INTO v_definicion;

  IF position('v_credito_mxn numeric(12, 4);' IN v_definicion) > 0 THEN
    IF position('v_saldo_a_favor numeric(12, 4);' IN v_definicion) = 0
       OR position(') RETURNING id INTO v_pago_id;' IN v_definicion) = 0 THEN
      RAISE EXCEPTION 'definicion_inesperada_registrar_pago_ar_atomico';
    END IF;

    v_definicion := replace(v_definicion, 'v_credito_mxn numeric(12, 4);', 'v_credito_mxn numeric(14, 4);');
    v_definicion := replace(v_definicion, 'v_saldo_a_favor numeric(12, 4);', 'v_saldo_a_favor numeric(14, 4);');
    v_definicion := replace(v_definicion, ') RETURNING id INTO v_pago_id;', v_reemplazo_pago);
    EXECUTE v_definicion;
  ELSIF position('v_credito_mxn numeric(14, 4);' IN v_definicion) = 0
     OR position('ON CONFLICT (solicitud_id) DO NOTHING' IN v_definicion) = 0 THEN
    RAISE EXCEPTION 'definicion_inesperada_registrar_pago_ar_atomico';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.aplicar_saldo_favor_ar(uuid,uuid,numeric,uuid,uuid)'::regprocedure
  ) INTO v_definicion;

  IF position('v_saldo_a_favor numeric(12, 4);' IN v_definicion) > 0 THEN
    IF position(') RETURNING id INTO v_pago_id;' IN v_definicion) = 0 THEN
      RAISE EXCEPTION 'definicion_inesperada_aplicar_saldo_favor_ar';
    END IF;

    v_definicion := replace(v_definicion, 'v_saldo_a_favor numeric(12, 4);', 'v_saldo_a_favor numeric(14, 4);');
    v_definicion := replace(v_definicion, ') RETURNING id INTO v_pago_id;', v_reemplazo_saldo);
    EXECUTE v_definicion;
  ELSIF position('v_saldo_a_favor numeric(14, 4);' IN v_definicion) = 0
     OR position('ON CONFLICT (solicitud_id) DO NOTHING' IN v_definicion) = 0 THEN
    RAISE EXCEPTION 'definicion_inesperada_aplicar_saldo_favor_ar';
  END IF;
END;
$migracion$;

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
