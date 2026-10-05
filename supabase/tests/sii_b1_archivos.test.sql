-- SII-B1.9 — Modelo único de archivos: tabla, privilegios y versionado.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

-- 1-4. Tabla y privilegios
SELECT has_table('public', 'archivos', 'Existe la tabla de archivos');
SELECT ok(has_table_privilege('authenticated', 'public.archivos', 'SELECT'),
  'authenticated puede leer metadata (RLS decide filas)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.archivos', 'INSERT'),
  'authenticated no escribe metadata directamente');
SELECT ok(has_table_privilege('service_role', 'public.archivos', 'INSERT'),
  'service_role registra metadata');

-- 5-8. Versionado: reemplazar encadena versión y desmarca la anterior
INSERT INTO public.archivos (
  id, entidad, entidad_id, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes
) VALUES (
  '00000000-0000-4000-8000-0000000b1901', 'cliente', '00000000-0000-4000-8000-0000000b19c1',
  'documento', 'acta.pdf', 'acta.pdf',
  'documentos-cliente', 'cliente/b19c1/acta-v1.pdf', 'application/pdf', 100
);
SELECT is((SELECT version FROM public.archivos WHERE id = '00000000-0000-4000-8000-0000000b1901'),
  1, 'Primera versión en 1');

INSERT INTO public.archivos (
  id, entidad, entidad_id, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes
) VALUES (
  '00000000-0000-4000-8000-0000000b1902', 'cliente', '00000000-0000-4000-8000-0000000b19c1',
  'documento', 'acta.pdf', 'acta.pdf',
  'documentos-cliente', 'cliente/b19c1/acta-v2.pdf', 'application/pdf', 120
);
SELECT is((SELECT version FROM public.archivos WHERE id = '00000000-0000-4000-8000-0000000b1902'),
  2, 'Reemplazar genera la versión 2');
SELECT is((SELECT reemplaza_a FROM public.archivos WHERE id = '00000000-0000-4000-8000-0000000b1902'),
  '00000000-0000-4000-8000-0000000b1901'::uuid, 'La versión nueva apunta a la anterior');
SELECT is((SELECT vigente FROM public.archivos WHERE id = '00000000-0000-4000-8000-0000000b1901'),
  false, 'La versión anterior deja de ser vigente sin borrarse');

-- 9-11. Integridad
SELECT is((SELECT count(*) FROM public.archivos
  WHERE nombre_erp = 'acta.pdf' AND vigente), 1::bigint,
  'Solo una versión vigente por nombre ERP');
SELECT throws_ok($$
  INSERT INTO public.archivos (entidad, entidad_id, clase, nombre_original, nombre_erp,
    bucket, ruta_storage, mime, tamano_bytes)
  VALUES ('cliente', '00000000-0000-4000-8000-0000000b19c1', 'documento', 'otra.pdf', 'otra.pdf',
    'documentos-cliente', 'cliente/b19c1/acta-v1.pdf', 'application/pdf', 10)
$$, '23505', NULL, 'La ruta de storage es única');
SELECT throws_ok($$
  INSERT INTO public.archivos (entidad, entidad_id, clase, nombre_original, nombre_erp,
    bucket, ruta_storage, mime, tamano_bytes)
  VALUES ('cliente', '00000000-0000-4000-8000-0000000b19c1', 'documento', 'x.pdf', 'x.pdf',
    'documentos-cliente', 'cliente/b19c1/x.pdf', 'application/pdf', 0)
$$, '23514', NULL, 'Rechaza archivos vacíos');

SELECT * FROM finish();
ROLLBACK;
