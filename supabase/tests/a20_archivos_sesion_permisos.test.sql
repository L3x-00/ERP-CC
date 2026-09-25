BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.archivos_sesion_produccion'::regclass),
  'Los metadatos de archivo tienen RLS activo');
SELECT ok(has_table_privilege('authenticated', 'public.archivos_sesion_produccion', 'SELECT'),
  'El personal autenticado puede consultar el historial bajo RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.archivos_sesion_produccion', 'SELECT'),
  'Un visitante no puede enumerar archivos');
SELECT ok(NOT has_table_privilege('authenticated', 'public.archivos_sesion_produccion', 'INSERT'),
  'La asociación de un archivo exige la acción de servidor');
SELECT ok(NOT has_table_privilege('authenticated', 'public.archivos_sesion_produccion', 'DELETE'),
  'Una sesión histórica no se borra desde el cliente');
SELECT ok(has_table_privilege('service_role', 'public.archivos_sesion_produccion', 'INSERT'),
  'El servidor puede registrar un archivo validado');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'archivos-sesion-produccion'), false,
  'Los archivos de sesión se almacenan en bucket privado');
SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = 'archivos-sesion-produccion'), 20971520::bigint,
  'El bucket impone 20 MiB en almacenamiento');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'storage'
  AND tablename = 'objects' AND policyname LIKE 'archivos_sesion%'), 0,
  'No hay política de acceso directo a objetos');
SELECT ok(EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename = 'archivos_sesion_produccion'),
  'Los archivos asociados invalidan otras pantallas en Realtime');

SELECT * FROM finish();
ROLLBACK;
