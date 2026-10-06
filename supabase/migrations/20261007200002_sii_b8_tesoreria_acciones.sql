-- =============================================================================
-- SII-B8 F5 (acciones) — Saldo inicial, transferencias internas y conciliación
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.3 F5; decisiones PO 2026-10-06.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007200001).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(
  p_cuenta_id uuid,
  p_monto numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha date,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cuenta_id uuid,
  monto numeric,
  moneda text,
  tipo_cambio numeric,
  fecha date,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cuenta public.cuentas_bancarias%ROWTYPE;
BEGIN
  IF p_cuenta_id IS NULL OR p_actor_id IS NULL
     OR p_monto IS NULL OR p_monto < 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR p_fecha IS NULL
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_saldo_inicial_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_bancarias AS cuenta
  WHERE cuenta.id = p_cuenta_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_cuenta.activa THEN
    RAISE EXCEPTION 'cuenta_inactiva' USING ERRCODE = 'check_violation';
  END IF;
  IF upper(trim(p_moneda)) <> v_cuenta.moneda THEN
    RAISE EXCEPTION 'moneda_no_corresponde_cuenta' USING ERRCODE = 'check_violation';
  END IF;
  IF upper(trim(p_moneda)) = 'MXN' AND round(p_tipo_cambio, 4) <> 1 THEN
    RAISE EXCEPTION 'tipo_cambio_mxn_invalido' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.saldos_iniciales_tesoreria (
    cuenta_id, monto, moneda, tipo_cambio, fecha, creado_por, actualizado_por
  ) VALUES (
    p_cuenta_id, round(p_monto, 4), upper(trim(p_moneda)), round(p_tipo_cambio, 4),
    p_fecha, p_actor_id, p_actor_id
  )
  ON CONFLICT ON CONSTRAINT saldos_iniciales_tesoreria_pkey DO UPDATE
  SET
    monto = round(excluded.monto, 4),
    moneda = excluded.moneda,
    tipo_cambio = round(excluded.tipo_cambio, 4),
    fecha = excluded.fecha,
    actualizado_por = excluded.actualizado_por,
    actualizado_en = now()
  RETURNING saldos_iniciales_tesoreria.cuenta_id, saldos_iniciales_tesoreria.monto,
    saldos_iniciales_tesoreria.moneda, saldos_iniciales_tesoreria.tipo_cambio,
    saldos_iniciales_tesoreria.fecha, saldos_iniciales_tesoreria.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.registrar_saldo_inicial(uuid, numeric, text, numeric, date, uuid, uuid) IS
'SII-B8 F5: registra/actualiza el saldo inicial de una cuenta activa (moneda de la cuenta, TC a MXN); solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_saldo_inicial(uuid, numeric, text, numeric, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_saldo_inicial(uuid, numeric, text, numeric, date, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_transferencia(
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_monto numeric,
  p_referencia text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  salida_id uuid,
  entrada_id uuid,
  monto numeric,
  moneda text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_origen public.cuentas_bancarias%ROWTYPE;
  v_destino public.cuentas_bancarias%ROWTYPE;
  v_salida_id uuid;
  v_entrada_id uuid;
  v_creado_en timestamptz;
BEGIN
  IF p_cuenta_origen_id IS NULL OR p_cuenta_destino_id IS NULL OR p_actor_id IS NULL
     OR p_cuenta_origen_id = p_cuenta_destino_id
     OR p_monto IS NULL OR p_monto <= 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_transferencia_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock de ambas cuentas en orden de id para evitar ciclos.
  PERFORM 1 FROM public.cuentas_bancarias AS cuenta
  WHERE cuenta.id IN (p_cuenta_origen_id, p_cuenta_destino_id)
  ORDER BY cuenta.id
  FOR SHARE;

  SELECT * INTO v_origen FROM public.cuentas_bancarias AS cuenta WHERE cuenta.id = p_cuenta_origen_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_origen_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_destino FROM public.cuentas_bancarias AS cuenta WHERE cuenta.id = p_cuenta_destino_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_destino_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_origen.activa OR NOT v_destino.activa THEN
    RAISE EXCEPTION 'cuenta_inactiva' USING ERRCODE = 'check_violation';
  END IF;
  IF v_origen.moneda <> v_destino.moneda THEN
    RAISE EXCEPTION 'monedas_distintas' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.movimientos_tesoreria (cuenta_id, tipo, monto, moneda, referencia, creado_por)
  VALUES (p_cuenta_origen_id, 'TRANSFERENCIA_SALIDA', round(p_monto, 4), v_origen.moneda,
    NULLIF(btrim(p_referencia), ''), p_actor_id)
  RETURNING id, creado_en INTO v_salida_id, v_creado_en;

  INSERT INTO public.movimientos_tesoreria (cuenta_id, tipo, monto, moneda, referencia, par_movimiento_id, creado_por)
  VALUES (p_cuenta_destino_id, 'TRANSFERENCIA_ENTRADA', round(p_monto, 4), v_origen.moneda,
    NULLIF(btrim(p_referencia), ''), v_salida_id, p_actor_id)
  RETURNING id INTO v_entrada_id;

  UPDATE public.movimientos_tesoreria
  SET par_movimiento_id = v_entrada_id
  WHERE id = v_salida_id;

  RETURN QUERY SELECT v_salida_id, v_entrada_id, round(p_monto, 4), v_origen.moneda, v_creado_en;
END;
$function$;

COMMENT ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid) IS
'SII-B8 F5: registra una transferencia interna como par SALIDA/ENTRADA enlazado (misma moneda); excluida de ingresos/gastos. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.conciliar_movimiento(
  p_cuenta_id uuid,
  p_entidad text,
  p_entidad_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conciliacion_id uuid,
  conciliado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entidad text := lower(trim(coalesce(p_entidad, '')));
  v_pertenece boolean := false;
  v_conciliacion public.conciliaciones_tesoreria%ROWTYPE;
BEGIN
  IF p_cuenta_id IS NULL OR p_entidad_id IS NULL OR p_actor_id IS NULL
     OR v_entidad NOT IN ('cobro', 'pago_compra', 'gasto', 'transferencia')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_conciliacion_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  IF v_entidad = 'cobro' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.pagos_ar AS pago
      WHERE pago.id = p_entidad_id AND pago.cuenta_bancaria_id = p_cuenta_id
    ) INTO v_pertenece;
  ELSIF v_entidad = 'pago_compra' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.pagos_compra AS pago
      WHERE pago.id = p_entidad_id AND pago.cuenta_bancaria_id = p_cuenta_id
    ) INTO v_pertenece;
  ELSIF v_entidad = 'gasto' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.gastos AS gasto
      WHERE gasto.id = p_entidad_id AND gasto.cuenta_bancaria_id = p_cuenta_id
        AND gasto.estado_pago = 'pagado'
    ) INTO v_pertenece;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.movimientos_tesoreria AS movimiento
      WHERE movimiento.id = p_entidad_id AND movimiento.cuenta_id = p_cuenta_id
    ) INTO v_pertenece;
  END IF;

  IF NOT v_pertenece THEN
    RAISE EXCEPTION 'movimiento_no_corresponde_cuenta' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.conciliaciones_tesoreria AS conciliacion
    WHERE conciliacion.entidad = v_entidad AND conciliacion.entidad_id = p_entidad_id
  ) THEN
    RAISE EXCEPTION 'movimiento_ya_conciliado' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.conciliaciones_tesoreria (cuenta_id, entidad, entidad_id, conciliado_por)
  VALUES (p_cuenta_id, v_entidad, p_entidad_id, p_actor_id)
  RETURNING * INTO v_conciliacion;

  RETURN QUERY SELECT v_conciliacion.id, v_conciliacion.conciliado_en;
END;
$function$;

COMMENT ON FUNCTION public.conciliar_movimiento(uuid, text, uuid, uuid, uuid) IS
'SII-B8 F5: marca un movimiento (cobro/pago de compra/gasto pagado/transferencia) como conciliado con auditoría; solo service_role.';

REVOKE ALL ON FUNCTION public.conciliar_movimiento(uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_movimiento(uuid, text, uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.desconciliar_movimiento(
  p_entidad text,
  p_entidad_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  entidad text,
  entidad_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entidad text := lower(trim(coalesce(p_entidad, '')));
  v_eliminada public.conciliaciones_tesoreria%ROWTYPE;
BEGIN
  IF p_entidad_id IS NULL OR p_actor_id IS NULL
     OR v_entidad NOT IN ('cobro', 'pago_compra', 'gasto', 'transferencia')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_conciliacion_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.conciliaciones_tesoreria AS conciliacion
  WHERE conciliacion.entidad = v_entidad AND conciliacion.entidad_id = p_entidad_id
  RETURNING * INTO v_eliminada;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'movimiento_no_conciliado' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT v_eliminada.entidad, v_eliminada.entidad_id;
END;
$function$;

COMMENT ON FUNCTION public.desconciliar_movimiento(text, uuid, uuid, uuid) IS
'SII-B8 F5: retira la marca de conciliación de un movimiento; solo service_role.';

REVOKE ALL ON FUNCTION public.desconciliar_movimiento(text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desconciliar_movimiento(text, uuid, uuid, uuid)
  TO service_role;
