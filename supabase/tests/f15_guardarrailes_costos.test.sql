-- C10.3/F-15 + F-17/F-18 — Guardarraíles de costos:
--   * un gasto indirecto grande no cambia la conciliación ni la rentabilidad
--     de ninguna Orden;
--   * una compra/pago de compra y un movimiento de tesorería tampoco;
--   * Facturación y CxC funcionan en una Orden sin Propuesta ni costos;
--   * las funciones de costos son STABLE y no dependen de facturas/cobros.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000f1501', 'f15-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin F15'
WHERE id = '00000000-0000-4000-8000-0000000f1501';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000f1502', 'Cliente F15', 'Cliente F15 SA', 'activo');

INSERT INTO public.ordenes_produccion
  (id, folio, cliente_id, estado, fecha_compromiso, snapshot_json)
VALUES
  ('00000000-0000-4000-8000-0000000f1503', 'OP-991501',
   '00000000-0000-4000-8000-0000000f1502', 'completada', now() + interval '5 days', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000f1505', 'OP-991502',
   '00000000-0000-4000-8000-0000000f1502', 'completada', now() + interval '5 days', '{}'::jsonb);

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, monto_subtotal, monto_iva, saldo_pendiente,
   moneda, tipo_cambio_origen, estado, cobrable_desde, fecha_vencimiento)
VALUES
  ('00000000-0000-4000-8000-0000000f1504', '00000000-0000-4000-8000-0000000f1503',
   '00000000-0000-4000-8000-0000000f1502', 116, 100, 16, 116, 'MXN', 1, 'pendiente',
   now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000f1506', '00000000-0000-4000-8000-0000000f1505',
   '00000000-0000-4000-8000-0000000f1502', 116, 100, 16, 116, 'MXN', 1, 'pendiente',
   now(), now() + interval '30 days');

-- Gasto indirecto grande: no tiene Orden y no debe repartirse.
INSERT INTO public.gastos (folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago,
  fecha_gasto, creado_por)
VALUES ('GTO-991501', NULL, 'servicios_generales', 'Indirecto grande F15',
  1000000, 0, 1000000, 'MXN', 1, 'pendiente', now(), '00000000-0000-4000-8000-0000000f1501');

-- Compra con Orden A y su pago: el pago no debe alterar la conciliación.
INSERT INTO public.proveedores (id, nombre_comercial, razon_social, contacto_nombre, correo, telefono)
VALUES ('00000000-0000-4000-8000-0000000f1509', 'Proveedor F15', 'Proveedor F15 SA',
  'Contacto F15', 'proveedor-f15@prueba.local', '5555555555');
INSERT INTO public.compras (id, folio_sii, proveedor_id, orden_id, estado,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, saldo_pendiente,
  creado_por, rubro_costo)
VALUES ('00000000-0000-4000-8000-0000000f1510', 'CG-9915_0001',
  '00000000-0000-4000-8000-0000000f1509', '00000000-0000-4000-8000-0000000f1503',
  'CONFIRMADA', 100, 16, 116, 'MXN', 1, 116,
  '00000000-0000-4000-8000-0000000f1501', 'gastos_directos');

INSERT INTO public.pagos_compra (id, compra_id, monto, fecha_pago, metodo_pago,
  referencia, creado_por)
VALUES ('00000000-0000-4000-8000-0000000f1511', '00000000-0000-4000-8000-0000000f1510',
  100, now(), 'transferencia', 'PAGO-F15', '00000000-0000-4000-8000-0000000f1501');

-- Movimiento de tesorería: no debe alterar costos.
INSERT INTO public.cuentas_bancarias (id, banco, numero_cuenta, moneda, titular, activa, tipo)
VALUES ('00000000-0000-4000-8000-0000000f1512', 'Banco F15', '0000000015', 'MXN',
  'ORCA F15', true, 'banco');
INSERT INTO public.movimientos_tesoreria (id, cuenta_id, tipo, monto, moneda,
  referencia, creado_por)
VALUES ('00000000-0000-4000-8000-0000000f1513', '00000000-0000-4000-8000-0000000f1512',
  'TRANSFERENCIA_SALIDA', 50, 'MXN', 'TRANSF-F15', '00000000-0000-4000-8000-0000000f1501');

-- Facturación/CxC en Orden B sin Propuesta ni costos (independencia).
INSERT INTO public.notas_entrega (id, folio, orden_id, recibido_por, creado_por)
VALUES ('00000000-0000-4000-8000-0000000f1507', 'NE-991501',
  '00000000-0000-4000-8000-0000000f1505', 'Recepción F15',
  '00000000-0000-4000-8000-0000000f1501');
CREATE TEMP TABLE f15 (clave text PRIMARY KEY, valor jsonb);
INSERT INTO f15 (clave, valor)
SELECT 'factura', to_jsonb(factura.*) FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-0000000f1507', '{"subtotal":100,"iva":16,"total":116}'::jsonb,
  '00000000-0000-4000-8000-0000000f1501') AS factura;
UPDATE f15 SET valor = valor || to_jsonb(factura.*)
FROM public.emitir_factura(
  (SELECT (valor ->> 'id')::uuid FROM f15 WHERE clave = 'factura'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f15 WHERE clave = 'factura'),
  'FAC-F15-1', NULL, NULL, '00000000-0000-4000-8000-0000000f1501') AS factura
WHERE f15.clave = 'factura';
INSERT INTO public.pagos_ar (id, ar_id, folio_recibo, solicitud_id, monto_pagado,
  moneda_pago, tipo_cambio_pago, monto_aplicado_ar, monto_sobrepago_ar, metodo_pago,
  creado_por)
VALUES ('00000000-0000-4000-8000-0000000f1514', '00000000-0000-4000-8000-0000000f1506',
  'REC-991501', gen_random_uuid(), 10, 'MXN', 1, 10, 0, 'efectivo',
  '00000000-0000-4000-8000-0000000f1501');
INSERT INTO public.aplicaciones_pago (id, pago_id, cuenta_id, monto)
VALUES ('00000000-0000-4000-8000-0000000f1515', '00000000-0000-4000-8000-0000000f1514',
  '00000000-0000-4000-8000-0000000f1506', 10);

SET LOCAL ROLE service_role;

-- 1-2. Línea base sin costos.
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'totales' ->> 'real')::numeric),
  0::numeric, 'La Orden A nace sin costo real');
SELECT is((SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000f1503') AS r), 0::numeric,
  'La rentabilidad de A nace en cero');

-- 3-4. El gasto indirecto grande no se reparte.
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'totales' ->> 'real')::numeric),
  0::numeric, 'El gasto indirecto no entra a la conciliación de A');
SELECT is((SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000f1503') AS r), 0::numeric,
  'El gasto indirecto no entra a la rentabilidad de A');

-- 5-8. Compra y pago de compra: el comprometido no cambia por pagar.
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'conceptos' -> 3 ->> 'comprometido')::numeric),
  100::numeric, 'La compra confirmada compromete 100');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'conceptos' -> 3 ->> 'comprometido')::numeric),
  100::numeric, 'El pago de la compra no duplica el comprometido');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'conceptos' -> 3 ->> 'real')::numeric),
  0::numeric, 'La compra confirmada no es real (sin recepción)');
SELECT is((SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000f1503') AS r), 0::numeric,
  'El pago de compra no entra a la rentabilidad');

-- 9-10. Movimiento de tesorería neutro.
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1503') -> 'totales' ->> 'real')::numeric),
  0::numeric, 'El movimiento de tesorería no entra a la conciliación');
SELECT is((SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000f1503') AS r), 0::numeric,
  'El movimiento de tesorería no entra a la rentabilidad');

-- 11-12. Orden B sin Propuesta: factura y cobro funcionan; costo cero.
SELECT ok((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1505') ->> 'esInterna')::boolean = false
  AND NOT (public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1505') ->> 'tieneEstimado')::boolean
  AND (public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f1505') -> 'totales' ->> 'real')::numeric = 0,
  'La Orden B sin Propuesta se factura y cobra sin costo real');
SELECT is((SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000f1505') AS r), 0::numeric,
  'La rentabilidad de B sigue en cero tras facturar y cobrar');

-- 13-14. Ambas funciones son STABLE.
SELECT ok((SELECT provolatile = 's' FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'obtener_conciliacion_costos_orden'),
  'La conciliación es STABLE');
SELECT ok((SELECT provolatile = 's' FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'obtener_rentabilidad_orden'),
  'La rentabilidad es STABLE');

SELECT * FROM finish();
ROLLBACK;
