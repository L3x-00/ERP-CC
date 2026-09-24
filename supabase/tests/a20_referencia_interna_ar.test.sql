BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000a2001', 'Cliente AR A20', 'Cliente AR A20');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000000a2002', 'OP-992001', '00000000-0000-4000-8000-0000000a2001', 'programada', now() + interval '1 day'),
  ('00000000-0000-4000-8000-0000000a2003', 'OP-992002', '00000000-0000-4000-8000-0000000a2001', 'programada', now() + interval '1 day');

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, tipo_cambio_origen, estado, folio_factura_remision)
VALUES
  ('00000000-0000-4000-8000-0000000a2004', '00000000-0000-4000-8000-0000000a2002', '00000000-0000-4000-8000-0000000a2001', 116, 116, 'MXN', 1, 'pendiente', 'FAC-EXTERNA'),
  ('00000000-0000-4000-8000-0000000a2005', '00000000-0000-4000-8000-0000000a2003', '00000000-0000-4000-8000-0000000a2001', 58, 58, 'MXN', 1, 'pendiente', NULL);

SELECT ok((SELECT referencia_interna ~ '^INVCNC-[0-9]{7}$' FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a2004'), 'AR nueva obtiene referencia interna');
SELECT isnt((SELECT referencia_interna FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2004'),
  (SELECT referencia_interna FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2005'),
  'Dos cuentas concurrentemente numerables no repiten referencia');
SELECT is((SELECT folio_factura_remision FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2004'),
  'FAC-EXTERNA', 'Folio fiscal independiente no cambia');
SELECT is((SELECT monto_total FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000a2004'),
  116::numeric, 'Referencia no modifica importe');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.cuentas_por_cobrar WHERE referencia_interna IS NULL),
  'Backfill cubre toda la cartera existente');
SELECT throws_ok($$UPDATE public.cuentas_por_cobrar SET referencia_interna = 'INVALIDO'
  WHERE id = '00000000-0000-4000-8000-0000000a2004'$$, '23514', NULL,
  'Formato inválido rechazado');
SELECT throws_ok($$UPDATE public.cuentas_por_cobrar SET referencia_interna = 'INVCNC-7654321'
  WHERE id = '00000000-0000-4000-8000-0000000a2004'$$, '23514', 'referencia_ar_inmutable',
  'Referencia válida tampoco se puede reemplazar');
SELECT ok(NOT has_function_privilege('authenticated', 'public.generar_referencia_ar()', 'EXECUTE'),
  'Cliente autenticado no reserva referencias');
SELECT ok(has_function_privilege('service_role', 'public.generar_referencia_ar()', 'EXECUTE'),
  'Servidor conserva generación de referencias');

SELECT * FROM finish();
ROLLBACK;
