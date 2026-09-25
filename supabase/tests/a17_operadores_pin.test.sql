-- A17: administración transaccional de operadores y PIN de piso.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(23);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000a1701', 'a17-admin@prueba.local',
   '{"rol":"admin","nombre_completo":"Admin A17"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a1702', 'a17-operador1@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000a1703', 'a17-operador2@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000a1704', 'a17-gerente@prueba.local', '{}'::jsonb);

SELECT is((SELECT rol FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1701'), 'vendedor',
  'Metadata autodeclarada admin no eleva el rol inicial');
UPDATE public.usuarios SET rol = 'admin'
WHERE id = '00000000-0000-4000-8000-0000000a1701';
UPDATE public.usuarios SET rol = 'gerente'
WHERE id = '00000000-0000-4000-8000-0000000a1704';

SELECT ok(NOT has_table_privilege('authenticated', 'public.usuarios', 'UPDATE'),
  'Authenticated no actualiza directamente usuarios');
SELECT ok(NOT has_column_privilege('authenticated', 'public.usuarios', 'pin_operador', 'UPDATE'),
  'Ni un admin autenticado puede escribir el hash fuera de la RPC');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.guardar_operador_admin(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'La RPC de PIN no es accesible al cliente');
SELECT ok(has_function_privilege('service_role',
  'public.guardar_operador_admin(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'El servicio puede usar la RPC protegida');

SELECT lives_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', '0042', true)
$$, 'Admin activo da de alta operador con PIN de ceros iniciales');
SELECT is((SELECT rol FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'), 'operador',
  'El perfil pasa al rol operador');
SELECT is((SELECT activo FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'), true,
  'El nuevo operador queda activo');
SELECT ok((SELECT pin_operador LIKE '$2a$%' FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'),
  'Solo se persiste bcrypt, nunca el PIN plano');
SELECT ok((SELECT extensions.crypt('0042', pin_operador) = pin_operador
  FROM public.usuarios WHERE id = '00000000-0000-4000-8000-0000000a1702'),
  'El PIN con cero inicial autentica contra el hash');

SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1703'::uuid,
    'Operador Dos', '0042', true)
$$, '23505', 'pin_duplicado', 'Se rechaza PIN ya usado');
SELECT is((SELECT rol FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1703'), 'vendedor',
  'El fallo de duplicado no convierte el segundo perfil');
SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1704'::uuid,
    '00000000-0000-4000-8000-0000000a1703'::uuid,
    'Operador Dos', '7788', true)
$$, '42501', 'usuario_sin_permiso', 'Gerente no administra operadores');
SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', '42', true)
$$, '23514', 'pin_formato_invalido', 'PIN corto se rechaza');

CREATE TEMP TABLE a17_hash_original AS
  SELECT pin_operador FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702';
SELECT lives_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', NULL, false)
$$, 'Retiro desactiva en vez de borrar');
SELECT is((SELECT activo FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'), false,
  'Operador retirado pierde acceso');
SELECT is((SELECT pin_operador FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'),
  (SELECT pin_operador FROM a17_hash_original), 'Retiro conserva hash/historia');
SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', NULL, true)
$$, '23514', 'pin_requerido', 'Reactivación exige PIN nuevo');
SELECT lives_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', '9977', true)
$$, 'Reactivación con PIN nuevo conserva el ID');
SELECT ok((SELECT pin_cambiado_en IS NOT NULL AND
    extensions.crypt('9977', pin_operador) = pin_operador
  FROM public.usuarios WHERE id = '00000000-0000-4000-8000-0000000a1702'),
  'Reactivación gira hash y marca sesiones anteriores como obsoletas');

-- Hash bcryptjs $2b$ preexistente: muestra de prueba para PIN 1234.
UPDATE public.usuarios SET rol = 'operador', activo = true,
  pin_operador = '$2b$10$SBYr4cNyOxxgxq/7uOvLq.edUX9sWhYDc/GN6tKWr4YTdGsgxAWza'
WHERE id = '00000000-0000-4000-8000-0000000a1703';
SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', '1234', true)
$$, '23505', 'pin_duplicado', 'Detecta duplicado frente a bcryptjs histórico $2b$');
UPDATE public.usuarios SET activo = false
WHERE id = '00000000-0000-4000-8000-0000000a1701';
SELECT throws_ok($$
  SELECT public.guardar_operador_admin(
    '00000000-0000-4000-8000-0000000a1701'::uuid,
    '00000000-0000-4000-8000-0000000a1702'::uuid,
    'Operador Uno', '8899', true)
$$, '42501', 'usuario_sin_permiso', 'Admin inactivo no administra PIN');
SELECT is((SELECT count(*)::integer FROM public.usuarios
  WHERE id = '00000000-0000-4000-8000-0000000a1702'), 1,
  'El retiro y la reactivación no borran al operador');

SELECT * FROM finish();
ROLLBACK;
