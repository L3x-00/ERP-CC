-- A18: privilegios mínimos y lectura histórica; JWT real se prueba en integración.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.logs'::regclass),
  'La bitácora tiene RLS activo');
SELECT ok(has_column_privilege('authenticated', 'public.logs', 'id', 'SELECT'),
  'El cliente autenticado lee columnas de presentación');
SELECT ok(NOT has_column_privilege('authenticated', 'public.logs', 'detalles', 'SELECT'),
  'Los detalles JSONB no salen por Data API');
SELECT ok(NOT has_table_privilege('authenticated', 'public.logs', 'TRUNCATE'),
  'Authenticated no puede truncar el historial');
SELECT ok(NOT has_table_privilege('anon', 'public.logs', 'TRUNCATE'),
  'Anon no puede truncar el historial');
SELECT ok(NOT has_table_privilege('authenticated', 'public.logs', 'INSERT'),
  'Solo service_role inserta eventos');
SELECT ok(has_table_privilege('service_role', 'public.logs', 'INSERT'),
  'Service_role conserva la escritura de auditoría');
SELECT ok((SELECT qual LIKE '%usuario_activo%' FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'logs' AND policyname = 'logs_seleccionar'),
  'La política bloquea JWT de usuario inactivo');

SELECT * FROM finish();
ROLLBACK;
