BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a2201', 'a20excepcion@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2201';
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000a2202', 'Cliente excepción AR', 'Cliente excepción AR', 'activo');
INSERT INTO public.ordenes_produccion
  (id, folio, cliente_id, estado, fecha_compromiso, archivada_en, es_interna)
VALUES
  ('00000000-0000-4000-8000-0000000a2203', 'OP-992201', '00000000-0000-4000-8000-0000000a2202', 'completada', now(), now(), false),
  ('00000000-0000-4000-8000-0000000a2204', 'OP-992202', '00000000-0000-4000-8000-0000000a2202', 'completada', now(), NULL, false),
  ('00000000-0000-4000-8000-0000000a2205', 'OP-992203', '00000000-0000-4000-8000-0000000a2202', 'completada', now(), now(), true),
  ('00000000-0000-4000-8000-0000000a2206', 'OP-992204', '00000000-0000-4000-8000-0000000a2202', 'completada', now(), now(), false);
INSERT INTO public.cuentas_por_cobrar
  (orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado, cobrable_desde, fecha_vencimiento)
VALUES
  ('00000000-0000-4000-8000-0000000a2206', '00000000-0000-4000-8000-0000000a2202', 116, 116, 'MXN', 'pendiente', now(), now() + interval '30 days');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.abrir_ar_excepcion_entregada(uuid,numeric,text,numeric,timestamptz,text,uuid)', 'EXECUTE'),
  'JWT no puede abrir AR de excepción directamente');
SELECT is((SELECT cliente_id FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2203', 220, 'MXN', 1,
  now() + interval '30 days', 'FAC-EXCEPCION', '00000000-0000-4000-8000-0000000a2201')),
  '00000000-0000-4000-8000-0000000a2202'::uuid,
  'Alta vincula cliente de la orden entregada');
SELECT ok((SELECT referencia_interna FROM public.cuentas_por_cobrar
  WHERE orden_id = '00000000-0000-4000-8000-0000000a2203') ~ '^INVCNC-[0-9]{7}$',
  'Excepción recibe referencia interna');
SELECT is((SELECT monto_total FROM public.cuentas_por_cobrar
  WHERE orden_id = '00000000-0000-4000-8000-0000000a2203'),
  220::numeric, 'Importe confirmado persiste');
SELECT is((SELECT folio_factura_remision FROM public.cuentas_por_cobrar
  WHERE orden_id = '00000000-0000-4000-8000-0000000a2203'),
  'FAC-EXCEPCION', 'Folio fiscal persiste');
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2203', 220, 'MXN', 1,
  now() + interval '30 days', 'OTRA', '00000000-0000-4000-8000-0000000a2201')$$,
  '23505', 'cuenta_por_cobrar_ya_existe', 'Reintento no duplica AR');
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2204', 220, 'MXN', 1,
  now() + interval '30 days', 'SIN-ENTREGA', '00000000-0000-4000-8000-0000000a2201')$$,
  '23514', 'orden_no_entregada_para_ar', 'Orden sin entrega final no es facturable');
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2205', 220, 'MXN', 1,
  now() + interval '30 days', 'INTERNA', '00000000-0000-4000-8000-0000000a2201')$$,
  '23514', 'orden_no_entregada_para_ar', 'TI no genera cuenta por cobrar');
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2206', 220, 'MXN', 1,
  now() + interval '30 days', 'DUPLICADA', '00000000-0000-4000-8000-0000000a2201')$$,
  '23505', 'cuenta_por_cobrar_ya_existe', 'AR comercial existente queda intacta');
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2204', 220, 'MXN', 1,
  now() + interval '30 days', NULL, '00000000-0000-4000-8000-0000000a2201')$$,
  '23514', 'datos_ar_excepcion_invalidos', 'Nueva factura exige número fiscal');
UPDATE public.usuarios SET activo = false WHERE id = '00000000-0000-4000-8000-0000000a2201';
SELECT throws_ok($$SELECT * FROM public.abrir_ar_excepcion_entregada(
  '00000000-0000-4000-8000-0000000a2204', 220, 'MXN', 1,
  now() + interval '30 days', 'SIN-PERMISO', '00000000-0000-4000-8000-0000000a2201')$$,
  '42501', 'sin_permiso_ar_excepcion', 'Actor inactivo no puede crear AR');

SELECT * FROM finish();
ROLLBACK;
