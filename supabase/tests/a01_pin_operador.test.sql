BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);
SELECT ok(NOT has_table_privilege('authenticated', 'public.usuarios', 'SELECT'), 'Sin SELECT global autenticado');
SELECT ok(NOT has_column_privilege('authenticated', 'public.usuarios', 'pin_operador', 'SELECT'), 'Hash fuera de columnas autenticadas');
SELECT ok(NOT has_column_privilege('anon', 'public.usuarios', 'pin_operador', 'SELECT'), 'Hash no accesible anónimamente');
SELECT ok(has_column_privilege('authenticated', 'public.usuarios', 'nombre_completo', 'SELECT'), 'Perfil seguro disponible');
SELECT ok(has_column_privilege('service_role', 'public.usuarios', 'pin_operador', 'SELECT'), 'Servidor conserva lectura del PIN');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.usuarios'::regclass), 'RLS permanece activo');
SELECT lives_ok($test$
DO $body$
DECLARE
  actor uuid;
  rol_app text;
  perfil uuid;
BEGIN
  FOREACH rol_app IN ARRAY ARRAY['admin','gerente','vendedor','contador','operador'] LOOP
    actor := gen_random_uuid();
    INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES(actor,actor::text || '@a01.local','{"nombre_completo":"Prueba A01"}'::jsonb);
    UPDATE public.usuarios SET rol=rol_app, activo=true WHERE id=actor;
    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    SET LOCAL ROLE authenticated;
    SELECT id INTO perfil FROM public.usuarios WHERE id=actor;
    IF perfil IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Perfil propio inaccesible: %',rol_app; END IF;
    BEGIN
      PERFORM pin_operador FROM public.usuarios WHERE id=actor;
      RAISE EXCEPTION 'PIN expuesto: %',rol_app;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.usuarios WHERE id=actor;
      RAISE EXCEPTION 'SELECT * expuesto: %',rol_app;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  SET LOCAL ROLE service_role;
  PERFORM pin_operador FROM public.usuarios WHERE id=actor;
  RESET ROLE;
END $body$;
$test$, 'Cinco roles leen perfil propio, rechazan PIN y *, servidor sí lee PIN');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT pin_operador FROM public.usuarios', '42501', NULL, 'API anónima rechaza lectura del PIN');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
