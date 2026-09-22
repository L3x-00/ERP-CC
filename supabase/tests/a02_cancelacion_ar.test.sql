-- A02: cancelar una orden cancela su cuenta por cobrar en la misma transacción,
-- conserva el importe original y se detiene si hay cobranza registrada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

-- Fixtures: un usuario real (para los recibos) y tres órdenes con su AR.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-4000-8000-0000000a0201',
  'a02@prueba.local',
  '{"nombre_completo":"Prueba A02"}'::jsonb
);

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000a0202', 'Cliente A02', 'Cliente A02');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000000a0210', 'OP-990201',
   '00000000-0000-4000-8000-0000000a0202', 'programada', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000a0211', 'OP-990202',
   '00000000-0000-4000-8000-0000000a0202', 'programada', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000a0212', 'OP-990203',
   '00000000-0000-4000-8000-0000000a0202', 'cancelada', now() + interval '10 days');

-- AR cobrable sin cobranza (se debe cancelar con la orden).
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
  tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
) VALUES (
  '00000000-0000-4000-8000-0000000a0220', '00000000-0000-4000-8000-0000000a0210',
  '00000000-0000-4000-8000-0000000a0202', 1160, 1160, 'MXN', 1, 'pendiente',
  now() + interval '30 days', now()
);

-- AR no cobrable con anticipo aplicado (barrera: no se puede cancelar).
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
  tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
) VALUES (
  '00000000-0000-4000-8000-0000000a0221', '00000000-0000-4000-8000-0000000a0211',
  '00000000-0000-4000-8000-0000000a0202', 1160, 960, 'MXN', 1, 'parcial', NULL, NULL
);

INSERT INTO public.pagos_ar (
  ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
  monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, creado_por
) VALUES (
  '00000000-0000-4000-8000-0000000a0221', 'REC-990201',
  '00000000-0000-4000-8000-0000000a0230', 200, 'MXN', 1, 200, 0, 'transferencia',
  '00000000-0000-4000-8000-0000000a0201'
);

-- Orden ya cancelada cuya AR quedó viva (interrupción a medio camino).
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
  tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
) VALUES (
  '00000000-0000-4000-8000-0000000a0222', '00000000-0000-4000-8000-0000000a0212',
  '00000000-0000-4000-8000-0000000a0202', 500, 500, 'MXN', 1, 'pendiente',
  now() + interval '30 days', now()
);

-- 1-4. Cancelación sin pagos: la deuda muere con la orden y conserva su importe.
SELECT lives_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0210'::uuid, 'programada', 'cancelada', 'Cliente desistió'
  )
$$, 'Cancelar una orden sin cobranza no falla');

SELECT lives_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0210'::uuid, 'programada', 'cancelada', 'Cliente desistió'
  )
$$, 'Repetir la misma solicitud original es idempotente aunque su estado esperado sea anterior');

SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a0220'),
  'cancelado',
  'La AR de la orden cancelada queda cancelada'
);

SELECT is(
  (SELECT saldo_pendiente FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a0220'),
  0::numeric,
  'La AR cancelada deja de tener saldo exigible'
);

SELECT is(
  (SELECT monto_total FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a0220'),
  1160::numeric,
  'La AR cancelada conserva su importe original (no se borra historia)'
);

-- 5. Crédito/cartera: la deuda cancelada ya no ocupa límite de crédito.
SELECT is(
  (SELECT coalesce(sum(saldo_pendiente * tipo_cambio_origen), 0)
     FROM public.cuentas_por_cobrar
    WHERE cliente_id = '00000000-0000-4000-8000-0000000a0202'
      AND estado IN ('pendiente', 'parcial')
      AND orden_id = '00000000-0000-4000-8000-0000000a0210'),
  0::numeric,
  'El crédito usado ya no incluye la deuda de la orden cancelada'
);

-- 6-9. Con anticipo: se rechaza y NADA se modifica.
SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0211'::uuid, 'programada', 'cancelada', 'Cambio de alcance'
  )
$$, '23514', 'orden_con_cobranza_registrada',
  'Cancelar una orden con anticipo se rechaza con mensaje explícito');

SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000a0211'),
  'programada',
  'La orden con anticipo no cambia de estado'
);

SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a0221'),
  'parcial',
  'La AR con anticipo conserva su estado'
);

SELECT is(
  (SELECT count(*)::integer FROM public.pagos_ar
    WHERE ar_id = '00000000-0000-4000-8000-0000000a0221'),
  1,
  'El anticipo sigue registrado: no se inventa devolución ni se borra el recibo'
);

-- 10-11. Reintento idempotente sobre una orden ya cancelada: reconcilia la AR.
SELECT lives_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0212'::uuid, 'cancelada', 'cancelada', 'Reintento de cancelación'
  )
$$, 'Reintentar la cancelación de una orden ya cancelada es idempotente');

SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a0222'),
  'cancelado',
  'El reintento cancela la AR que había quedado viva'
);

-- 12. Diagnóstico: la AR con cobranza de una orden cancelada queda listada.
UPDATE public.ordenes_produccion
SET estado = 'cancelada', motivo_cancelacion = 'Forzada fuera de la RPC'
WHERE id = '00000000-0000-4000-8000-0000000a0211';

SELECT is(
  (SELECT count(*)::integer FROM public.obtener_ar_ordenes_canceladas_con_cobranza()
    WHERE cuenta_id = '00000000-0000-4000-8000-0000000a0221'),
  1,
  'El diagnóstico expone la AR viva de una orden cancelada con cobranza'
);

SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0210'::uuid, NULL, 'cancelada', 'Estado esperado ausente'
  )
$$, '40001', 'estado_conflicto', 'El reintento no permite estado esperado NULL');

SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000a0210'::uuid, 'cancelada', NULL, NULL
  )
$$, '23514', 'transicion_no_permitida', 'El estado nuevo NULL no elude la validación');

SELECT * FROM finish();
ROLLBACK;
