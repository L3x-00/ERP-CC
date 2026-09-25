BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a2091', 'a20factura@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2091';
INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000a2092', 'Cliente factura A20', 'Cliente factura A20');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000000a2093', 'OP-992091', '00000000-0000-4000-8000-0000000a2092', 'completada', now() + interval '1 day'),
  ('00000000-0000-4000-8000-0000000a2094', 'OP-992092', '00000000-0000-4000-8000-0000000a2092', 'en_proceso', now() + interval '1 day'),
  ('00000000-0000-4000-8000-0000000a2095', 'OP-992093', '00000000-0000-4000-8000-0000000a2092', 'cancelada', now() + interval '1 day');
INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado, cobrable_desde, fecha_vencimiento)
VALUES
  ('00000000-0000-4000-8000-0000000a2096', '00000000-0000-4000-8000-0000000a2093', '00000000-0000-4000-8000-0000000a2092', 116, 116, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000a2097', '00000000-0000-4000-8000-0000000a2094', '00000000-0000-4000-8000-0000000a2092', 58, 58, 'MXN', 'pendiente', NULL, NULL),
  ('00000000-0000-4000-8000-0000000a2098', '00000000-0000-4000-8000-0000000a2095', '00000000-0000-4000-8000-0000000a2092', 25, 25, 'MXN', 'cancelado', now(), now() + interval '1 day');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_factura_ar(uuid,timestamptz,text,timestamptz,uuid)', 'EXECUTE'),
  'RPC no es accesible directamente con JWT');
SELECT ok(NOT has_table_privilege('authenticated', 'public.cuentas_por_cobrar', 'UPDATE'),
  'JWT no puede saltar la RPC editando directamente la AR');
SELECT is((SELECT cuenta_id FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2096',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2096'),
  'FAC-A20', now() + interval '45 days', '00000000-0000-4000-8000-0000000a2091')),
  '00000000-0000-4000-8000-0000000a2096'::uuid,
  'Factura se adjunta a la AR existente');
SELECT is((SELECT folio_factura_remision FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2096'),
  'FAC-A20', 'Folio fiscal persiste');
SELECT is((SELECT monto_total FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2096'),
  116::numeric, 'Importe de la AR no cambia');
SELECT throws_ok($$SELECT * FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2096', '2000-01-01'::timestamptz,
  'OTRA', now() + interval '45 days', '00000000-0000-4000-8000-0000000a2091')$$,
  '23514', 'cuenta_desactualizada', 'CAS evita sobrescribir una edición concurrente');
SELECT throws_ok($$SELECT * FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2097',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2097'),
  'FAC-ANT', now() + interval '45 days', '00000000-0000-4000-8000-0000000a2091')$$,
  '23514', 'vencimiento_no_corresponde_cobrabilidad', 'Factura no activa cobro antes de entrega');
SELECT is((SELECT folio_factura FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2097',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2097'),
  'FAC-ANT', NULL, '00000000-0000-4000-8000-0000000a2091')),
  'FAC-ANT', 'Folio previo a entrega mantiene AR no cobrable');
SELECT throws_ok($$SELECT * FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2098',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2098'),
  'FAC-CANCELADA', now() + interval '45 days', '00000000-0000-4000-8000-0000000a2091')$$,
  '23514', 'cuenta_cancelada', 'AR cancelada no admite nueva factura');
UPDATE public.usuarios SET activo = false WHERE id = '00000000-0000-4000-8000-0000000a2091';
SELECT throws_ok($$SELECT * FROM public.registrar_factura_ar(
  '00000000-0000-4000-8000-0000000a2096',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2096'),
  'OTRA', now() + interval '45 days', '00000000-0000-4000-8000-0000000a2091')$$,
  '42501', 'sin_permiso_factura', 'Actor inactivo pierde permiso aunque invoque service_role');

SELECT * FROM finish();
ROLLBACK;
