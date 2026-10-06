-- =============================================================================
-- SII-B8 F5 (ajuste) — RETURNING calificado en registrar_transferencia
--
-- id y creado_en son columnas OUT de la función y la cláusula RETURNING
-- las resolvía como ambiguas. Se califica con el alias de la tabla.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007200002).
-- =============================================================================

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

  INSERT INTO public.movimientos_tesoreria AS movimiento (cuenta_id, tipo, monto, moneda, referencia, creado_por)
  VALUES (p_cuenta_origen_id, 'TRANSFERENCIA_SALIDA', round(p_monto, 4), v_origen.moneda,
    NULLIF(btrim(p_referencia), ''), p_actor_id)
  RETURNING movimiento.id, movimiento.creado_en INTO v_salida_id, v_creado_en;

  INSERT INTO public.movimientos_tesoreria AS movimiento (cuenta_id, tipo, monto, moneda, referencia, par_movimiento_id, creado_por)
  VALUES (p_cuenta_destino_id, 'TRANSFERENCIA_ENTRADA', round(p_monto, 4), v_origen.moneda,
    NULLIF(btrim(p_referencia), ''), v_salida_id, p_actor_id)
  RETURNING movimiento.id INTO v_entrada_id;

  UPDATE public.movimientos_tesoreria
  SET par_movimiento_id = v_entrada_id
  WHERE id = v_salida_id;

  RETURN QUERY SELECT v_salida_id, v_entrada_id, round(p_monto, 4), v_origen.moneda, v_creado_en;
END;
$function$;
COMMENT ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid) IS
'SII-B8 F5: registra una transferencia interna como par SALIDA/ENTRADA enlazado (misma moneda); excluida de ingresos/gastos. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, numeric, text, uuid, uuid) TO service_role;
