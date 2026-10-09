-- SII-B1 / H-B1-40 -- la auditoría es append-only en la base de datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

INSERT INTO public.logs (
  id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles
) VALUES (
  '00000000-0000-4000-8000-00000000b401',
  NULL, 'Sistema de prueba', 'admin', 'crear', 'sistema', 'APPEND-ONLY', '{}'
);

SELECT has_function(
  'privado', 'impedir_mutacion_logs', ARRAY[]::text[],
  'Existe la defensa de inmutabilidad de logs'
);
SELECT has_trigger(
  'public', 'logs', 'trigger_logs_solo_agregar_filas',
  'Logs rechaza UPDATE y DELETE por trigger'
);
SELECT has_trigger(
  'public', 'logs', 'trigger_logs_solo_agregar_truncate',
  'Logs rechaza TRUNCATE por trigger'
);

SELECT ok(
  has_table_privilege('service_role', 'public.logs', 'INSERT'),
  'service_role conserva INSERT para registrar auditoría'
);
SELECT ok(
  has_table_privilege('service_role', 'public.logs', 'SELECT'),
  'service_role conserva SELECT para consultar auditoría'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.logs', 'UPDATE'),
  'service_role no puede actualizar logs'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.logs', 'DELETE'),
  'service_role no puede borrar logs'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.logs', 'TRUNCATE'),
  'service_role no puede truncar logs'
);

SELECT throws_ok($$
  UPDATE public.logs SET accion = 'alterado'
  WHERE id = '00000000-0000-4000-8000-00000000b401'
$$, '55000', 'logs_append_only', 'El trigger rechaza UPDATE incluso para el propietario');

SELECT throws_ok($$
  DELETE FROM public.logs
  WHERE id = '00000000-0000-4000-8000-00000000b401'
$$, '55000', 'logs_append_only', 'El trigger rechaza DELETE incluso para el propietario');

SELECT throws_ok(
  'TRUNCATE TABLE public.logs',
  '55000', 'logs_append_only',
  'El trigger rechaza TRUNCATE incluso para el propietario'
);

SELECT is(
  (SELECT accion FROM public.logs WHERE id = '00000000-0000-4000-8000-00000000b401'),
  'crear',
  'El evento original permanece intacto'
);

SELECT * FROM finish();
ROLLBACK;
