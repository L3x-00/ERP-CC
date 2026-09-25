-- A19: registro/edición con CAS y recibo privado, sin reescribir pagos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000a1901', 'a19-contador@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000a1902', 'a19-vendedor@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'contador'
WHERE id = '00000000-0000-4000-8000-0000000a1901';

SELECT ok((SELECT public = false FROM storage.buckets WHERE id = 'comprobantes-gasto'),
  'El bucket de comprobantes es privado');
SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = 'comprobantes-gasto'),
  10485760::bigint, 'Storage limita cada comprobante a 10 MiB');
SELECT ok((SELECT allowed_mime_types @> ARRAY['application/pdf', 'image/png']::text[]
  FROM storage.buckets WHERE id = 'comprobantes-gasto'),
  'Storage limita formatos de comprobante');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_gasto_a19(jsonb,uuid)', 'EXECUTE'),
  'Authenticated no registra gastos por RPC privilegiada');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.editar_gasto_a19(uuid,timestamptz,jsonb,uuid)', 'EXECUTE'),
  'Authenticated no edita gastos por RPC privilegiada');
SELECT ok(NOT has_table_privilege('authenticated', 'public.comprobantes_gasto_historial', 'SELECT'),
  'El historial de comprobantes no se expone al cliente');

CREATE TEMP TABLE a19_datos AS SELECT jsonb_build_object(
  'categoria', 'servicios_generales', 'descripcion', 'Servicio de prueba A19',
  'tipoGasto', 'fijo', 'montoSubtotal', 100, 'montoIva', 16,
  'montoTotal', 116, 'moneda', 'MXN', 'tipoCambio', 1,
  'fechaGasto', '2026-09-23',
  'datosOcrJson', jsonb_build_object('texto', 'Comprobante anterior'),
  'comprobanteRuta', '00000000-0000-4000-8000-0000000a1901/00000000-0000-4000-8000-0000000a1903.png'
) AS datos;

SELECT throws_ok($$
  SELECT public.registrar_gasto_a19((SELECT datos FROM a19_datos),
    '00000000-0000-4000-8000-0000000a1902'::uuid)
$$, '42501', 'usuario_sin_permiso_gastos', 'Vendedor no registra gastos');

CREATE TEMP TABLE a19_gasto AS
  SELECT * FROM public.registrar_gasto_a19(
    (SELECT datos FROM a19_datos), '00000000-0000-4000-8000-0000000a1901');
SELECT is((SELECT tipo_gasto FROM a19_gasto), 'fijo', 'Se persiste tipo fijo');
SELECT is((SELECT comprobante_ruta FROM a19_gasto),
  '00000000-0000-4000-8000-0000000a1901/00000000-0000-4000-8000-0000000a1903.png',
  'Se persiste la ruta privada');

SELECT throws_ok($$
  SELECT public.editar_gasto_a19(
    (SELECT id FROM a19_gasto), (SELECT actualizado_en FROM a19_gasto),
    (SELECT datos FROM a19_datos), '00000000-0000-4000-8000-0000000a1902')
$$, '42501', 'usuario_sin_permiso_gastos', 'Vendedor no edita gastos');

SELECT lives_ok($$
  SELECT public.editar_gasto_a19(
    (SELECT id FROM a19_gasto), (SELECT actualizado_en FROM a19_gasto),
    (SELECT datos - 'datosOcrJson' FROM a19_datos) || jsonb_build_object(
      'descripcion', 'Servicio corregido A19', 'tipoGasto', 'variable',
      'montoSubtotal', 200, 'montoIva', 32, 'montoTotal', 232,
      'comprobanteRuta', '00000000-0000-4000-8000-0000000a1901/00000000-0000-4000-8000-0000000a1904.pdf'),
    '00000000-0000-4000-8000-0000000a1901')
$$, 'Contador corrige gasto pendiente y reemplaza comprobante');
SELECT is((SELECT monto_total FROM public.gastos WHERE id = (SELECT id FROM a19_gasto)),
  232::numeric, 'Los importes se recalculan en una operación');
SELECT is((SELECT count(*)::integer FROM public.comprobantes_gasto_historial
  WHERE gasto_id = (SELECT id FROM a19_gasto)), 1,
  'La ruta anterior se conserva en historial privado');
SELECT is((SELECT datos_ocr_json FROM public.gastos WHERE id = (SELECT id FROM a19_gasto)),
  NULL::jsonb, 'Al reemplazar el comprobante sin OCR se descarta la extracción anterior');
SELECT lives_ok($$
  SELECT public.editar_gasto_a19(
    (SELECT id FROM a19_gasto),
    (SELECT actualizado_en FROM public.gastos WHERE id = (SELECT id FROM a19_gasto)),
    (SELECT datos FROM a19_datos) || jsonb_build_object(
      'tipoGasto', 'variable',
      'comprobanteRuta', '00000000-0000-4000-8000-0000000a1901/00000000-0000-4000-8000-0000000a1904.pdf',
      'datosOcrJson', jsonb_build_object('texto', 'Comprobante vigente')),
    '00000000-0000-4000-8000-0000000a1901')
$$, 'La misma ruta admite una nueva extracción confirmada');

SELECT throws_ok($$
  SELECT public.editar_gasto_a19(
    (SELECT id FROM a19_gasto), (SELECT actualizado_en FROM a19_gasto),
    (SELECT datos FROM a19_datos), '00000000-0000-4000-8000-0000000a1901')
$$, '40001', 'version_obsoleta', 'El CAS rechaza pestaña desactualizada');
UPDATE public.gastos SET estado_pago = 'pagado' WHERE id = (SELECT id FROM a19_gasto);
SELECT throws_ok($$
  SELECT public.editar_gasto_a19(
    (SELECT id FROM a19_gasto),
    (SELECT actualizado_en FROM public.gastos WHERE id = (SELECT id FROM a19_gasto)),
    (SELECT datos FROM a19_datos), '00000000-0000-4000-8000-0000000a1901')
$$, '23514', 'estado_invalido', 'Pagado no admite edición');

SELECT * FROM finish();
ROLLBACK;
