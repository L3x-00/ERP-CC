-- SII-B8 F2 — Facturación: borrador, emisión con folio capturado, vínculo a CxC
-- y cancelación con re-factura. Verifica CAS, unicidad de folio fiscal,
-- vencimiento por términos del cliente, permisos y RLS.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000b901', 'sii-b8-fact-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000b902', 'sii-b8-fact-vend@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B8 F2'
WHERE id = '00000000-0000-4000-8000-00000000b901';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B8 F2'
WHERE id = '00000000-0000-4000-8000-00000000b902';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('00000000-0000-4000-8000-00000000b903', 'Cliente F2', 'Cliente F2 SA de CV', 'activo', '30_dias');

INSERT INTO public.ordenes_produccion (id, folio, folio_sii, cliente_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000b904', 'OP-994901', 'O-9999_91',
   '00000000-0000-4000-8000-00000000b903', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b907', 'OP-994902', 'O-9999_92',
   '00000000-0000-4000-8000-00000000b903', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b9b1', 'OP-994903', 'O-9999_93',
   '00000000-0000-4000-8000-00000000b903', 'completada', now() + interval '30 days');

INSERT INTO public.notas_entrega (id, folio, orden_id, recibido_por, creado_por) VALUES
  ('00000000-0000-4000-8000-00000000b905', 'NE-000901', '00000000-0000-4000-8000-00000000b904',
   'Recepción F2', '00000000-0000-4000-8000-00000000b901'),
  ('00000000-0000-4000-8000-00000000b908', 'NE-000902', '00000000-0000-4000-8000-00000000b907',
   'Recepción F2', '00000000-0000-4000-8000-00000000b901'),
  ('00000000-0000-4000-8000-00000000b9b2', 'NE-000903', '00000000-0000-4000-8000-00000000b9b1',
   'Recepción F2', '00000000-0000-4000-8000-00000000b901');

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado,
   cobrable_desde, fecha_vencimiento, monto_subtotal, monto_iva)
VALUES
  ('00000000-0000-4000-8000-00000000b906', '00000000-0000-4000-8000-00000000b904',
   '00000000-0000-4000-8000-00000000b903', 116, 116, 'MXN', 'pendiente',
   now(), now() + interval '30 days', 100, 16),
  ('00000000-0000-4000-8000-00000000b909', '00000000-0000-4000-8000-00000000b907',
   '00000000-0000-4000-8000-00000000b903', 116, 116, 'MXN', 'pendiente',
   now(), now() + interval '30 days', 100, 16),
  ('00000000-0000-4000-8000-00000000b9b3', '00000000-0000-4000-8000-00000000b9b1',
   '00000000-0000-4000-8000-00000000b903', 116, 116, 'MXN', 'pendiente',
   NULL, NULL, 100, 16);

CREATE TEMP TABLE b8f (clave text PRIMARY KEY, valor jsonb);

SELECT plan(19);

-- 1-4. Borrador idempotente por entrega.
INSERT INTO b8f (clave, valor)
SELECT 'f1', to_jsonb(factura.*) FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b905',
  '{"subtotal": 100, "iva": 16, "total": 116, "rfc_receptor": "XAXX010101000"}'::jsonb,
  '00000000-0000-4000-8000-00000000b901') AS factura;
SELECT is((SELECT valor ->> 'estado' FROM b8f WHERE clave = 'f1'), 'BORRADOR',
  'El borrador nace en BORRADOR');
SELECT is((SELECT (valor ->> 'total')::numeric FROM b8f WHERE clave = 'f1'), 116::numeric,
  'El borrador conserva los montos precargados');
SELECT is((SELECT (valor ->> 'ya_existia')::boolean FROM b8f WHERE clave = 'f1'), false,
  'La primera creación no marca ya_existia');
SELECT * FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b905', '{}'::jsonb, '00000000-0000-4000-8000-00000000b901');
SELECT is((SELECT count(*) FROM public.facturas
  WHERE entrega_id = '00000000-0000-4000-8000-00000000b905'), 1::bigint,
  'Reintentar la creación no duplica el borrador');

-- 5-6. Edición con CAS.
SELECT throws_ok($$SELECT * FROM public.actualizar_factura_borrador(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  '2000-01-01T00:00:00Z'::timestamptz, '{"total": 200}'::jsonb,
  '00000000-0000-4000-8000-00000000b901')$$,
  '23514', 'factura_desactualizada', 'Un CAS obsoleto no edita el borrador');
UPDATE b8f SET valor = valor || to_jsonb(factura.*)
FROM public.actualizar_factura_borrador(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f1'),
  '{"subtotal": 172.41, "iva": 27.59, "total": 200}'::jsonb,
  '00000000-0000-4000-8000-00000000b901') AS factura
WHERE b8f.clave = 'f1';
SELECT is((SELECT (valor ->> 'total')::numeric FROM b8f WHERE clave = 'f1'), 200::numeric,
  'La edición vigente actualiza los montos');

-- 7-10. Emisión: folio capturado y vínculo a la AR.
UPDATE b8f SET valor = valor || to_jsonb(factura.*)
FROM public.emitir_factura(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f1'),
  'FAC-0001', 'XAXX010101000', 'UUID-F2-0001', '00000000-0000-4000-8000-00000000b901') AS factura
WHERE b8f.clave = 'f1';
SELECT is((SELECT valor ->> 'estado' FROM b8f WHERE clave = 'f1'), 'EMITIDA',
  'La factura emite con folio capturado');
SELECT is((SELECT folio_factura_remision FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b906'), 'FAC-0001',
  'La AR recibe el folio fiscal de la factura');
SELECT is((SELECT factura_id FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b906'),
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  'La AR queda vinculada a la factura');
SELECT ok((SELECT fecha_vencimiento > now() FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b906'),
  'La AR cobrable recalcula vencimiento por términos del cliente (30 días)');
SELECT throws_ok($$SELECT * FROM public.emitir_factura(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f1'),
  'FAC-0002', NULL, NULL, '00000000-0000-4000-8000-00000000b901')$$,
  '23514', 'factura_no_emitible', 'Una factura emitida no se re-emite');

-- 11-12. Folio fiscal duplicado y cancelación con desvínculo.
INSERT INTO b8f (clave, valor)
SELECT 'f2', to_jsonb(factura.*) FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b908', '{}'::jsonb, '00000000-0000-4000-8000-00000000b901') AS factura;
SELECT throws_ok($$SELECT * FROM public.emitir_factura(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f2'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f2'),
  'FAC-0001', NULL, NULL, '00000000-0000-4000-8000-00000000b901')$$,
  '23505', 'folio_fiscal_duplicado', 'El folio fiscal capturado es único');
UPDATE b8f SET valor = valor || to_jsonb(factura.*)
FROM public.cancelar_factura(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f1'),
  'Error de captura del PAC', '00000000-0000-4000-8000-00000000b901') AS factura
WHERE b8f.clave = 'f1';
SELECT is((SELECT valor ->> 'estado' FROM b8f WHERE clave = 'f1'), 'CANCELADA',
  'La cancelación conserva el historial como CANCELADA');
SELECT ok((SELECT factura_id IS NULL AND folio_factura_remision IS NULL
    AND fecha_vencimiento IS NOT NULL
  FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-00000000b906'),
  'Cancelar desvincula la AR (folio NULL) y conserva el vencimiento');

-- 13-15. Re-factura, permisos y AR no cobrable.
INSERT INTO b8f (clave, valor)
SELECT 'f3', to_jsonb(factura.*) FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b905', '{}'::jsonb, '00000000-0000-4000-8000-00000000b901') AS factura;
SELECT is((SELECT valor ->> 'estado' FROM b8f WHERE clave = 'f3'), 'BORRADOR',
  'Tras cancelar se puede re-facturar la misma entrega');
SELECT throws_ok($$SELECT * FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b905', '{}'::jsonb,
  '00000000-0000-4000-8000-00000000b902')$$,
  '42501', 'sin_permiso_factura', 'Un vendedor no crea facturas');
INSERT INTO b8f (clave, valor)
SELECT 'f4', to_jsonb(factura.*) FROM public.crear_factura_borrador(
  '00000000-0000-4000-8000-00000000b9b2', '{}'::jsonb, '00000000-0000-4000-8000-00000000b901') AS factura;
UPDATE b8f SET valor = valor || to_jsonb(factura.*)
FROM public.emitir_factura(
  (SELECT (valor ->> 'id')::uuid FROM b8f WHERE clave = 'f4'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM b8f WHERE clave = 'f4'),
  'FAC-0003', NULL, NULL, '00000000-0000-4000-8000-00000000b901') AS factura
WHERE b8f.clave = 'f4';
SELECT ok((SELECT fecha_vencimiento IS NULL AND folio_factura_remision = 'FAC-0003'
  FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-00000000b9b3'),
  'Facturar una AR por entregar deja el vencimiento en NULL (D-04 intacto)');

-- 16-17. Privilegios y RLS.
SELECT ok(NOT has_function_privilege('authenticated',
  'public.emitir_factura(uuid,timestamptz,text,text,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta emitir_factura');
SELECT ok(has_table_privilege('authenticated', 'public.facturas', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.facturas', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.facturas', 'UPDATE'),
  'facturas es solo lectura para authenticated');

SELECT * FROM finish();
ROLLBACK;
