-- SII-B8 F5 — Tesorería: saldo inicial, transferencias internas enlazadas y
-- conciliación manual auditada. Verifica pares, validaciones, pertenencia y
-- privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000d101', 'sii-b8-f5-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000d102', 'sii-b8-f5-vend@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B8 F5'
WHERE id = '00000000-0000-4000-8000-00000000d101';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B8 F5'
WHERE id = '00000000-0000-4000-8000-00000000d102';

INSERT INTO public.cuentas_bancarias (id, banco, numero_cuenta, moneda, titular, activa, tipo) VALUES
  ('00000000-0000-4000-8000-00000000d103', 'Banco F5', '0000111122223333', 'MXN', 'ORCA', true, 'banco'),
  ('00000000-0000-4000-8000-00000000d104', 'Efectivo F5', 'CAJA-01', 'MXN', 'ORCA', true, 'efectivo'),
  ('00000000-0000-4000-8000-00000000d105', 'Banco USD F5', '0000999988887777', 'USD', 'ORCA', true, 'banco'),
  ('00000000-0000-4000-8000-00000000d106', 'Banco Inactivo F5', '0000555544443333', 'MXN', 'ORCA', false, 'banco');

INSERT INTO public.pagos_ar (
  ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
  monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, cuenta_bancaria_id, creado_por
) VALUES (
  NULL, 'REC-900001', gen_random_uuid(), 500, 'MXN', 1, 500, 0, 'transferencia',
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d101'
);

INSERT INTO public.proveedores (id, nombre_comercial, razon_social, contacto_nombre, correo, telefono)
VALUES ('00000000-0000-4000-8000-00000000d107', 'Proveedor F5', 'Proveedor F5 SA',
  'Contacto F5', 'proveedor-f5@prueba.local', '5555555555');
INSERT INTO public.compras (
  folio_sii, proveedor_id, estado, monto_subtotal, monto_iva, monto_total, moneda,
  tipo_cambio, saldo_pendiente, creado_por
) VALUES (
  'CG-9999_0001', '00000000-0000-4000-8000-00000000d107', 'RECIBIDA', 200, 0, 200, 'MXN',
  1, 100, '00000000-0000-4000-8000-00000000d101'
);
INSERT INTO public.pagos_compra (compra_id, monto, metodo_pago, cuenta_bancaria_id, creado_por)
SELECT compra.id, 100, 'transferencia', '00000000-0000-4000-8000-00000000d103',
  '00000000-0000-4000-8000-00000000d101'
FROM public.compras AS compra WHERE compra.folio_sii = 'CG-9999_0001';

INSERT INTO public.gastos (
  folio, categoria, descripcion, monto_subtotal, monto_iva, monto_total, moneda,
  tipo_cambio, estado_pago, cuenta_bancaria_id, creado_por
) VALUES
  ('GTO-900001', 'servicios', 'Gasto pagado F5', 100, 0, 100, 'MXN', 1, 'pagado',
   '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d101'),
  ('GTO-900002', 'servicios', 'Gasto pendiente F5', 50, 0, 50, 'MXN', 1, 'pendiente',
   '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d101');

CREATE TEMP TABLE f5 (clave text PRIMARY KEY, valor jsonb);
SELECT plan(27);

-- 1-4. Saldo inicial: upsert validado.
INSERT INTO f5 (clave, valor)
SELECT 'saldo1', to_jsonb(saldo.*) FROM public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d103', 1000, 'MXN', 1, current_date,
  '00000000-0000-4000-8000-00000000d101') AS saldo;
SELECT is((SELECT (valor ->> 'monto')::numeric FROM f5 WHERE clave = 'saldo1'), 1000::numeric,
  'El saldo inicial se registra');
UPDATE f5 SET valor = valor || to_jsonb(saldo.*)
FROM public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d103', 1500, 'MXN', 1, current_date,
  '00000000-0000-4000-8000-00000000d101') AS saldo
WHERE f5.clave = 'saldo1';
SELECT is((SELECT (valor ->> 'monto')::numeric FROM f5 WHERE clave = 'saldo1'), 1500::numeric,
  'Repetir el saldo inicial actualiza la misma fila');
SELECT is((SELECT count(*) FROM public.saldos_iniciales_tesoreria
  WHERE cuenta_id = '00000000-0000-4000-8000-00000000d103'), 1::bigint,
  'No se duplica el saldo inicial');
SELECT throws_ok($$SELECT * FROM public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d105', 100, 'MXN', 1, current_date,
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'moneda_no_corresponde_cuenta', 'La moneda debe ser la de la cuenta');
SELECT throws_ok($$SELECT * FROM public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d103', 100, 'MXN', 18.5, current_date,
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'tipo_cambio_mxn_invalido', 'MXN exige tipo de cambio 1');

-- 6-7. Transferencia: par enlazado misma moneda.
INSERT INTO f5 (clave, valor)
SELECT 'transf1', to_jsonb(transf.*) FROM public.registrar_transferencia(
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d104',
  200, 'Traspaso a caja', '00000000-0000-4000-8000-00000000d101') AS transf;
SELECT is((SELECT valor ->> 'moneda' FROM f5 WHERE clave = 'transf1'), 'MXN',
  'La transferencia conserva la moneda común');
SELECT ok((
  SELECT salida.par_movimiento_id = entrada.id AND entrada.par_movimiento_id = salida.id
  FROM public.movimientos_tesoreria AS salida
  JOIN public.movimientos_tesoreria AS entrada ON entrada.id = salida.par_movimiento_id
  WHERE salida.id = (SELECT (valor ->> 'salida_id')::uuid FROM f5 WHERE clave = 'transf1')
), 'El par de transferencia queda enlazado en ambos sentidos');
SELECT ok((
  SELECT salida.tipo = 'TRANSFERENCIA_SALIDA' AND entrada.tipo = 'TRANSFERENCIA_ENTRADA'
  FROM public.movimientos_tesoreria AS salida
  JOIN public.movimientos_tesoreria AS entrada ON entrada.id = salida.par_movimiento_id
  WHERE salida.id = (SELECT (valor ->> 'salida_id')::uuid FROM f5 WHERE clave = 'transf1')
), 'Los tipos del par son salida y entrada');

-- 9-11. Validaciones de transferencia.
SELECT throws_ok($$SELECT * FROM public.registrar_transferencia(
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d103',
  10, NULL, '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'datos_transferencia_invalidos', 'No hay transferencia a la misma cuenta');
SELECT throws_ok($$SELECT * FROM public.registrar_transferencia(
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d105',
  10, NULL, '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'monedas_distintas', 'La transferencia exige misma moneda');
SELECT throws_ok($$SELECT * FROM public.registrar_transferencia(
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d106',
  10, NULL, '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'cuenta_inactiva', 'No se transfiere a/desde cuentas inactivas');

-- 12-17. Conciliación por entidad con pertenencia.
INSERT INTO f5 (clave, valor)
SELECT 'conc1', to_jsonb(conc.*) FROM public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d103', 'cobro',
  (SELECT pago.id FROM public.pagos_ar AS pago WHERE pago.folio_recibo = 'REC-900001'),
  '00000000-0000-4000-8000-00000000d101') AS conc;
SELECT ok((SELECT valor ->> 'conciliacion_id' IS NOT NULL FROM f5 WHERE clave = 'conc1'),
  'El cobro se marca conciliado');
SELECT throws_ok($$SELECT * FROM public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d103', 'cobro',
  (SELECT pago.id FROM public.pagos_ar AS pago WHERE pago.folio_recibo = 'REC-900001'),
  '00000000-0000-4000-8000-00000000d101')$$,
  '23505', 'movimiento_ya_conciliado', 'No se concilia dos veces el mismo movimiento');
SELECT throws_ok($$SELECT * FROM public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d104', 'cobro',
  (SELECT pago.id FROM public.pagos_ar AS pago WHERE pago.folio_recibo = 'REC-900001'),
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'movimiento_no_corresponde_cuenta', 'El cobro pertenece a otra cuenta');
SELECT ok((SELECT (public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d103', 'pago_compra',
  (SELECT pago.id FROM public.pagos_compra AS pago
   JOIN public.compras AS compra ON compra.id = pago.compra_id
   WHERE compra.folio_sii = 'CG-9999_0001'),
  '00000000-0000-4000-8000-00000000d101')).conciliacion_id IS NOT NULL),
  'El pago a proveedor se concilia');
SELECT ok((SELECT (public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d103', 'gasto',
  (SELECT gasto.id FROM public.gastos AS gasto WHERE gasto.folio = 'GTO-900001'),
  '00000000-0000-4000-8000-00000000d101')).conciliacion_id IS NOT NULL),
  'El gasto pagado se concilia');
SELECT ok((SELECT (public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d104', 'transferencia',
  (SELECT (f5.valor ->> 'entrada_id')::uuid FROM f5 WHERE f5.clave = 'transf1'),
  '00000000-0000-4000-8000-00000000d101')).conciliacion_id IS NOT NULL),
  'La transferencia (entrada) se concilia');
SELECT throws_ok($$SELECT * FROM public.conciliar_movimiento(
  '00000000-0000-4000-8000-00000000d103', 'gasto',
  (SELECT gasto.id FROM public.gastos AS gasto WHERE gasto.folio = 'GTO-900002'),
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'movimiento_no_corresponde_cuenta', 'Un gasto pendiente no es movimiento de tesorería');

-- 18-19. Desconciliación.
SELECT ok((SELECT (public.desconciliar_movimiento(
  'cobro',
  (SELECT pago.id FROM public.pagos_ar AS pago WHERE pago.folio_recibo = 'REC-900001'),
  '00000000-0000-4000-8000-00000000d101')).entidad_id IS NOT NULL),
  'La conciliación se retira');
SELECT throws_ok($$SELECT * FROM public.desconciliar_movimiento(
  'cobro',
  (SELECT pago.id FROM public.pagos_ar AS pago WHERE pago.folio_recibo = 'REC-900001'),
  '00000000-0000-4000-8000-00000000d101')$$,
  'P0002', 'movimiento_no_conciliado', 'No se desconcilia un movimiento sin marca');
-- 20-22. Permisos y privilegios.
SELECT throws_ok($$SELECT * FROM public.registrar_transferencia(
  '00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000d104',
  10, NULL, '00000000-0000-4000-8000-00000000d102')$$,
  '23514', 'datos_transferencia_invalidos', 'Sin permiso de pagos no se transfiere');
SELECT throws_ok($$SELECT * FROM public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d103', 10, 'MXN', 1, current_date,
  '00000000-0000-4000-8000-00000000d102')$$,
  '23514', 'datos_saldo_inicial_invalidos', 'Sin permiso de pagos no se fija saldo inicial');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_transferencia(uuid,uuid,numeric,text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
  'public.conciliar_movimiento(uuid,text,uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta transferencias ni conciliaciones');

-- 23-24. Categoría del dinero: transferencias fuera de ingresos/gastos.
SELECT ok((
  SELECT bool_and(movimiento.tipo IN ('TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA'))
  FROM public.movimientos_tesoreria AS movimiento
), 'Solo existen transferencias internas en movimientos_tesoreria');
SELECT is((SELECT count(*) FROM public.conciliaciones_tesoreria
  WHERE cuenta_id = '00000000-0000-4000-8000-00000000d103'), 2::bigint,
  'Quedan las conciliaciones vigentes del fixture');

-- 25-26. Saldo inicial de la caja (efectivo) y RLS de lectura.
SELECT ok((SELECT (public.registrar_saldo_inicial(
  '00000000-0000-4000-8000-00000000d104', 300, 'MXN', 1, current_date,
  '00000000-0000-4000-8000-00000000d101')).monto = 300),
  'La cuenta de efectivo admite saldo inicial');
SELECT ok(has_table_privilege('authenticated', 'public.movimientos_tesoreria', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.movimientos_tesoreria', 'INSERT')
  AND has_table_privilege('authenticated', 'public.conciliaciones_tesoreria', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.conciliaciones_tesoreria', 'UPDATE'),
  'Tesorería es solo lectura para authenticated');

SELECT * FROM finish();
ROLLBACK;
