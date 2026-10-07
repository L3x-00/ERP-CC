-- =============================================================================
-- B8 F3 (corrección de auditoría) — Reverso del cobro y promesa de pago
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.7 (F3.4).
--
-- Defecto: `registrar_pago_ar_atomico`/`aplicar_saldo_favor_ar`/
-- `registrar_cobro_multiple` marcan la promesa CUMPLIDA al quedar pagada la AR,
-- pero `reversar_pago_ar` no la reactivaba: tras el reverso la promesa seguía
-- CUMPLIDA (y `procesar_recordatorios_promesas` la mantenía), inflando KPIs y
-- ocultando la promesa real. Ahora, si la AR deja de estar pagada, la promesa
-- vuelve a VIGENTE (o VENCIDA si su fecha ya pasó).
--
-- Se recrea `reversar_pago_ar` sin cambiar firma ni contrato.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007230004).
-- =============================================================================
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

    -- La promesa que se cumplió con este cobro vuelve a estar activa si la AR
    -- dejó de estar pagada (evita promesas CUMPLIDAS fantasma tras el reverso).
    IF v_estado <> 'pagado' THEN
      UPDATE public.promesas_pago AS promesa
      SET estado = CASE WHEN promesa.fecha_prometida >= current_date THEN 'VIGENTE' ELSE 'VENCIDA' END
      WHERE promesa.cuenta_id = v_cuenta.id
        AND promesa.estado = 'CUMPLIDA';
    END IF;

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