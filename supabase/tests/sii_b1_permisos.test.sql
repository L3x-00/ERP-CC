-- SII-B1.1/B1.2 — Catálogo de permisos, FK y RPC de administración de accesos.
-- Verifica: catálogo, FK, privilegios, guardas anti-auto-bloqueo y camino feliz.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b1a01', 'sii-b1-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b1a02', 'sii-b1-objetivo@prueba.local'),
  ('00000000-0000-4000-8000-0000000b1a03', 'sii-b1-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B1'
WHERE id = '00000000-0000-4000-8000-0000000b1a01';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Objetivo B1'
WHERE id = '00000000-0000-4000-8000-0000000b1a02';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B1'
WHERE id = '00000000-0000-4000-8000-0000000b1a03';

-- 1-2. Catálogo
SELECT has_table('public', 'permisos', 'Existe el catálogo de permisos');
SELECT ok(
  (SELECT count(*) FROM public.permisos) >= 53,
  'El catálogo incluye los 14 vigentes y el conjunto nuevo por módulo'
);

-- 3. FK del catálogo (un código inexistente ya no puede asignarse)
SELECT throws_ok($$
  INSERT INTO public.permisos_rol (rol, permiso) VALUES ('vendedor', 'permiso_inexistente')
$$, '23503', NULL, 'La FK rechaza permisos fuera del catálogo');

-- 4-9. Privilegios: solo service_role ejecuta las RPC administrativas
--      (firmas con conjunto esperado y correlation_id: auditoría B1, H-B1-05/09)
SELECT ok(NOT has_function_privilege('authenticated',
  'public.actualizar_permisos_rol(text,text[],uuid,text[],uuid)', 'EXECUTE'),
  'authenticated no puede actualizar la matriz');
SELECT ok(has_function_privilege('service_role',
  'public.actualizar_permisos_rol(text,text[],uuid,text[],uuid)', 'EXECUTE'),
  'service_role puede actualizar la matriz');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.cambiar_rol_usuario(uuid,text,uuid,text,uuid)', 'EXECUTE'),
  'authenticated no puede cambiar roles');
SELECT ok(has_function_privilege('service_role',
  'public.cambiar_rol_usuario(uuid,text,uuid,text,uuid)', 'EXECUTE'),
  'service_role puede cambiar roles');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.cambiar_estado_usuario(uuid,boolean,uuid,text,uuid)', 'EXECUTE'),
  'authenticated no puede cambiar estados');
SELECT ok(has_function_privilege('service_role',
  'public.cambiar_estado_usuario(uuid,boolean,uuid,text,uuid)', 'EXECUTE'),
  'service_role puede cambiar estados');

-- 10-13. actualizar_permisos_rol: guardas
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('vendedor', ARRAY['rfq_vista'],
    '00000000-0000-4000-8000-0000000b1a03'::uuid, ARRAY[]::text[])
$$, '42501', 'sin_permiso_permisos', 'Un vendedor no administra la matriz');
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('admin', ARRAY['rfq_vista'],
    '00000000-0000-4000-8000-0000000b1a01'::uuid, ARRAY[]::text[])
$$, '22023', 'admin_permisos_inmutables', 'El rol admin no es editable');
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('vendedor', ARRAY['no_existe'],
    '00000000-0000-4000-8000-0000000b1a01'::uuid,
    (SELECT array_agg(permiso) FROM public.permisos_rol WHERE rol = 'vendedor'))
$$, '22023', 'permiso_desconocido', 'Rechaza códigos fuera del catálogo');
SELECT is(
  (SELECT public.actualizar_permisos_rol('vendedor', ARRAY['rfq_vista', 'cliente_vista'],
    '00000000-0000-4000-8000-0000000b1a01'::uuid,
    (SELECT array_agg(permiso) FROM public.permisos_rol WHERE rol = 'vendedor'))),
  2,
  'Reemplaza la matriz del rol y devuelve el total asignado'
);

-- 14-16. cambiar_rol_usuario / cambiar_estado_usuario
SELECT throws_ok($$
  SELECT public.cambiar_rol_usuario('00000000-0000-4000-8000-0000000b1a02'::uuid, 'gerente',
    '00000000-0000-4000-8000-0000000b1a03'::uuid, 'prueba')
$$, '42501', 'sin_permiso_usuarios', 'Un vendedor no cambia roles');
SELECT throws_ok($$
  SELECT public.cambiar_rol_usuario('00000000-0000-4000-8000-0000000b1a01'::uuid, 'gerente',
    '00000000-0000-4000-8000-0000000b1a01'::uuid, 'prueba')
$$, '22023', 'no_puede_autodegradarse', 'Un admin no se degrada a sí mismo');
SELECT throws_ok($$
  SELECT public.cambiar_estado_usuario('00000000-0000-4000-8000-0000000b1a01'::uuid, false,
    '00000000-0000-4000-8000-0000000b1a01'::uuid, 'prueba')
$$, '22023', 'no_puede_autodesactivarse', 'Un admin no se desactiva a sí mismo');

SELECT * FROM finish();
ROLLBACK;
