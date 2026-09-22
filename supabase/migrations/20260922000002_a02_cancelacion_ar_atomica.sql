-- =============================================================================
-- A02 — Cancelar una orden cancela su cuenta por cobrar en la misma transacción.
--
-- Hallazgo (auditoría global 2026-09-22): `cambiar_estado_orden` dejaba la orden
-- en `cancelada` y la AR en `pendiente` con saldo completo, por lo que la deuda
-- seguía ocupando crédito, estado de cuenta y cartera.
--
-- Reglas de esta migración:
--   1. La cancelación de la orden y la de su AR ocurren en la misma transacción,
--      bajo el orden de locks existente orden → AR (los pagos toman AR → cliente,
--      así que no se introduce ciclo).
--   2. La AR cancelada conserva `monto_total`, fechas e historial: solo pasa a
--      `estado = 'cancelado'` con `saldo_pendiente = 0`. No se borra nada.
--   3. Barrera conservadora: si la cuenta tiene CUALQUIER pago, anticipo o
--      aplicación de saldo a favor, la cancelación se rechaza con
--      `orden_con_cobranza_registrada`. No se inventan devoluciones ni notas de
--      crédito; el reverso trazable es trabajo posterior.
--   4. Reintento idempotente: pedir `cancelada → cancelada` no falla; revalida el
--      motivo y reconcilia la AR que hubiera quedado sin cancelar.
--   5. Backfill acotado: AR de órdenes ya canceladas SIN cobranza alguna. Las que
--      tienen pagos se dejan intactas y se listan con una función de diagnóstico.
--
-- Aditiva e idempotente. No cambia RLS ni los grants (las RPC siguen siendo
-- exclusivas de `service_role`). La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper transaccional: cancela la AR de una orden o explica por qué no puede.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.cancelar_cuenta_de_orden(p_orden_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_pagos integer;
  v_aplicaciones integer;
BEGIN
  -- `cuentas_por_cobrar.orden_id` es UNIQUE: a lo sumo una fila. El lock se toma
  -- ANTES de contar pagos para que un cobro concurrente no se cuele entre la
  -- comprobación y la cancelación.
  SELECT cuenta.*
  INTO v_cuenta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'sin_cuenta';
  END IF;

  IF v_cuenta.estado = 'cancelado' THEN
    RETURN 'ya_cancelada';
  END IF;

  SELECT count(*)::integer
  INTO v_pagos
  FROM public.pagos_ar AS pago
  WHERE pago.ar_id = v_cuenta.id;

  SELECT count(*)::integer
  INTO v_aplicaciones
  FROM public.movimientos_saldo_favor AS movimiento
  WHERE movimiento.ar_id_origen = v_cuenta.id;

  -- Un saldo distinto del importe original también significa dinero aplicado,
  -- aunque el recibo no esté (drift). Se trata igual: no se cancela en automático.
  IF v_pagos > 0
     OR v_aplicaciones > 0
     OR round(v_cuenta.saldo_pendiente, 4) <> round(v_cuenta.monto_total, 4) THEN
    RAISE EXCEPTION 'orden_con_cobranza_registrada'
      USING ERRCODE = 'check_violation',
        DETAIL = format(
          'Cuenta %s: %s pago(s), %s movimiento(s) de saldo, saldo %s de %s.',
          v_cuenta.id, v_pagos, v_aplicaciones,
          v_cuenta.saldo_pendiente, v_cuenta.monto_total
        ),
        HINT = 'Reversa o reembolsa la cobranza registrada antes de cancelar la orden.';
  END IF;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    estado = 'cancelado',
    saldo_pendiente = 0
  WHERE cuenta.id = v_cuenta.id;

  RETURN 'cancelada';
END;
$$;

COMMENT ON FUNCTION privado.cancelar_cuenta_de_orden(uuid) IS
  'A02: cancela la AR de una orden conservando monto original e historial; rechaza con orden_con_cobranza_registrada si hay pagos, anticipos o aplicaciones de saldo.';

REVOKE EXECUTE ON FUNCTION privado.cancelar_cuenta_de_orden(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. `cambiar_estado_orden`: cancelar arrastra la AR. Base: 20260911000002.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_orden(
  p_orden_id uuid,
  p_estado_actual text,
  p_estado_nuevo text,
  p_motivo_cancelacion text DEFAULT NULL
)
RETURNS TABLE (id uuid, estado text, fecha_inicio timestamptz, fecha_fin timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo_cancelacion, '')), '');
BEGIN
  SELECT ordenes_produccion.estado
  INTO v_estado
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_estado IS DISTINCT FROM p_estado_actual AND NOT coalesce((
    v_estado = 'cancelada' AND p_estado_nuevo = 'cancelada'
    AND p_estado_actual IN ('borrador', 'programada', 'en_proceso', 'pausada')
  ), false) THEN
    RAISE EXCEPTION 'estado_conflicto' USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_estado_nuevo = 'cancelada' AND (v_motivo IS NULL OR char_length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'motivo_cancelacion_requerido' USING ERRCODE = 'check_violation';
  END IF;

  -- A02: reintento idempotente de la cancelación. No es una transición nueva;
  -- revalida el motivo (arriba) y reconcilia una AR que hubiera quedado viva si
  -- una ejecución anterior se interrumpió. Si esa AR ya tiene cobranza, vuelve a
  -- rechazar con el mismo error explícito.
  IF p_estado_nuevo = 'cancelada' AND v_estado = 'cancelada' THEN
    PERFORM privado.cancelar_cuenta_de_orden(p_orden_id);

    RETURN QUERY
    SELECT
      ordenes_produccion.id,
      ordenes_produccion.estado,
      ordenes_produccion.fecha_inicio,
      ordenes_produccion.fecha_fin
    FROM public.ordenes_produccion
    WHERE ordenes_produccion.id = p_orden_id;
    RETURN;
  END IF;

  IF NOT coalesce((
    (v_estado = 'borrador' AND p_estado_nuevo IN ('programada', 'cancelada'))
    OR (v_estado = 'programada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
    OR (v_estado = 'en_proceso' AND p_estado_nuevo IN ('pausada', 'completada', 'cancelada'))
    OR (v_estado = 'pausada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
  ), false) THEN
    RAISE EXCEPTION 'transicion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  -- `completada` implica que no queda ninguna partida pendiente: es la misma
  -- condición que exige `abrir_cuenta_por_cobrar` antes de facturar.
  IF p_estado_nuevo = 'completada' AND EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_con_partidas_pendientes' USING ERRCODE = 'check_violation';
  END IF;

  -- A02: la deuda muere con la orden, en la misma transacción. Se resuelve antes
  -- de escribir la orden para que un rechazo por cobranza no deje trabajo a medias
  -- (la transacción aborta completa de todos modos).
  IF p_estado_nuevo = 'cancelada' THEN
    PERFORM privado.cancelar_cuenta_de_orden(p_orden_id);
  END IF;

  RETURN QUERY
  UPDATE public.ordenes_produccion
  SET
    estado = p_estado_nuevo,
    fecha_inicio = CASE
      WHEN p_estado_nuevo = 'en_proceso' THEN coalesce(ordenes_produccion.fecha_inicio, clock_timestamp())
      ELSE ordenes_produccion.fecha_inicio
    END,
    fecha_fin = CASE
      WHEN p_estado_nuevo = 'completada' THEN coalesce(ordenes_produccion.fecha_fin, clock_timestamp())
      ELSE ordenes_produccion.fecha_fin
    END,
    motivo_cancelacion = CASE
      WHEN p_estado_nuevo = 'cancelada' THEN v_motivo
      ELSE ordenes_produccion.motivo_cancelacion
    END
  WHERE ordenes_produccion.id = p_orden_id
  RETURNING
    ordenes_produccion.id,
    ordenes_produccion.estado,
    ordenes_produccion.fecha_inicio,
    ordenes_produccion.fecha_fin;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) IS
  'Cambia estado con bloqueo y compare-and-set; completar exige todas las partidas producidas; cancelar exige motivo y cancela la AR en la misma transacción (A02), rechazando si hay cobranza registrada. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Backfill acotado: AR vivas de órdenes ya canceladas y SIN cobranza alguna.
--    Las cuentas con pagos/anticipos no se tocan (ver función de diagnóstico).
-- -----------------------------------------------------------------------------
UPDATE public.cuentas_por_cobrar AS cuenta
SET
  estado = 'cancelado',
  saldo_pendiente = 0
FROM public.ordenes_produccion AS orden
WHERE orden.id = cuenta.orden_id
  AND orden.estado = 'cancelada'
  AND cuenta.estado IN ('pendiente', 'parcial')
  AND round(cuenta.saldo_pendiente, 4) = round(cuenta.monto_total, 4)
  AND NOT EXISTS (
    SELECT 1 FROM public.pagos_ar AS pago WHERE pago.ar_id = cuenta.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_saldo_favor AS movimiento
    WHERE movimiento.ar_id_origen = cuenta.id
  );

-- -----------------------------------------------------------------------------
-- 4. Diagnóstico: órdenes canceladas cuya AR sigue viva porque tiene cobranza.
--    Requieren decisión humana (reembolso, nota de crédito o saldo a favor).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_ar_ordenes_canceladas_con_cobranza()
RETURNS TABLE (
  orden_id uuid,
  folio text,
  cuenta_id uuid,
  cliente_id uuid,
  moneda text,
  monto_total numeric,
  saldo_pendiente numeric,
  estado_cuenta text,
  pagos integer,
  aplicaciones_saldo integer,
  cobrado_moneda_cuenta numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    orden.id,
    orden.folio,
    cuenta.id,
    cuenta.cliente_id,
    cuenta.moneda,
    cuenta.monto_total,
    cuenta.saldo_pendiente,
    cuenta.estado,
    (SELECT count(*)::integer FROM public.pagos_ar AS pago WHERE pago.ar_id = cuenta.id),
    (SELECT count(*)::integer FROM public.movimientos_saldo_favor AS movimiento
      WHERE movimiento.ar_id_origen = cuenta.id),
    round(cuenta.monto_total - cuenta.saldo_pendiente, 4)
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  WHERE orden.estado = 'cancelada'
    AND cuenta.estado <> 'cancelado'
  ORDER BY orden.folio;
$$;

COMMENT ON FUNCTION public.obtener_ar_ordenes_canceladas_con_cobranza() IS
  'A02: cuentas por cobrar vivas de órdenes canceladas que conservan cobranza; requieren decisión humana de reverso. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.obtener_ar_ordenes_canceladas_con_cobranza()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_ar_ordenes_canceladas_con_cobranza()
  TO service_role;
