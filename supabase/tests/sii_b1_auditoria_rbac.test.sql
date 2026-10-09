-- Auditoría de cumplimiento B1 — endurecimiento de usuarios, roles y permisos.
-- Hallazgos: H-B1-03 (cierre administrativo de Administrative), H-B1-05 (CAS y
-- lock de la matriz), H-B1-06 (lock común de último admin), H-B1-07 (permisos
-- inactivos no conceden acceso), H-B1-09/H-B1-13 (auditoría en la RPC con
-- antes/después y correlation_id).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b1c01', 'aud-b1-admin-a@prueba.local'),
  ('00000000-0000-4000-8000-0000000b1c02', 'aud-b1-admin-b@prueba.local'),
  ('00000000-0000-4000-8000-0000000b1c03', 'aud-b1-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin A B1'
WHERE id = '00000000-0000-4000-8000-0000000b1c01';
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B B1'
WHERE id = '00000000-0000-4000-8000-0000000b1c02';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor Aud B1'
WHERE id = '00000000-0000-4000-8000-0000000b1c03';

-- Estado inicial conocido del rol vendedor (la BD local acumula cambios de E2E).
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('vendedor', 'propuesta_enviar'), ('vendedor', 'rfq_vista')
ON CONFLICT (rol, permiso) DO NOTHING;
DELETE FROM public.permisos_rol WHERE rol = 'vendedor' AND permiso = 'cliente_comercial';
CREATE TEMP TABLE aud_b1_previo ON COMMIT DROP AS
  SELECT array_agg(permiso) AS permisos, count(*)::integer AS total
  FROM public.permisos_rol WHERE rol = 'vendedor';

-- 1. H-B1-03: Administrative (contador) puede hacer el cierre administrativo
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'contador' AND permiso = 'orden_cerrar_admin'),
  'Administrative (contador) tiene orden_cerrar_admin (§5 cierres administrativos)'
);

-- 2-7. Privilegios de las RPC con su firma nueva
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

-- 8-9. H-B1-06: la guarda de último admin usa un candado común
SELECT ok(
  pg_get_functiondef('public.cambiar_rol_usuario(uuid,text,uuid,text,uuid)'::regprocedure)
    LIKE '%pg_advisory_xact_lock%',
  'cambiar_rol_usuario serializa con el candado común de administradores'
);
SELECT ok(
  pg_get_functiondef('public.cambiar_estado_usuario(uuid,boolean,uuid,text,uuid)'::regprocedure)
    LIKE '%pg_advisory_xact_lock%',
  'cambiar_estado_usuario serializa con el candado común de administradores'
);

-- 10-14. H-B1-05: CAS por conjunto esperado y auditoría de la matriz
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('vendedor', ARRAY['rfq_vista'],
    '00000000-0000-4000-8000-0000000b1c01'::uuid, ARRAY['conjunto_que_no_coincide'], NULL)
$$, '23514', 'matriz_desactualizada', 'Rechaza guardar sobre una matriz desactualizada');

SELECT is(
  public.actualizar_permisos_rol(
    'vendedor',
    (SELECT array_agg(p) FROM aud_b1_previo, unnest(permisos) AS p WHERE p <> 'propuesta_enviar')
      || ARRAY['cliente_comercial'],
    '00000000-0000-4000-8000-0000000b1c01'::uuid,
    (SELECT permisos FROM aud_b1_previo),
    'aaaaaaaa-0000-4000-8000-0000000b1c10'::uuid
  ),
  (SELECT total FROM aud_b1_previo),
  'Con el conjunto esperado vigente guarda y devuelve el total'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'vendedor' AND permiso = 'cliente_comercial')
  AND NOT EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'vendedor' AND permiso = 'propuesta_enviar'),
  'Aplica exactamente los agregados y los retirados'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.logs
    WHERE accion = 'actualizar_permisos_rol'
      AND correlation_id = 'aaaaaaaa-0000-4000-8000-0000000b1c10'::uuid
      AND detalles->'agregados' ? 'cliente_comercial'
      AND detalles->'retirados' ? 'propuesta_enviar'
  ),
  'La auditoría registra permisos agregados y retirados con correlation_id'
);
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('vendedor', ARRAY['no_existe'],
    '00000000-0000-4000-8000-0000000b1c01'::uuid,
    (SELECT array_agg(permiso) FROM public.permisos_rol WHERE rol = 'vendedor'), NULL)
$$, '22023', 'permiso_desconocido', 'Rechaza códigos fuera del catálogo');

-- 15-20. H-B1-07: un permiso desactivado no concede acceso y se retira de los roles
SELECT ok(
  privado.actor_con_permiso('00000000-0000-4000-8000-0000000b1c03'::uuid, 'rfq_vista'),
  'Un permiso activo asignado concede acceso'
);
UPDATE public.permisos SET activo = false WHERE codigo = 'rfq_vista';
SELECT ok(
  NOT privado.actor_con_permiso('00000000-0000-4000-8000-0000000b1c03'::uuid, 'rfq_vista'),
  'Un permiso desactivado deja de conceder acceso (actor_con_permiso)'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.permisos_rol WHERE permiso = 'rfq_vista'),
  'Desactivar un permiso retira sus asignaciones'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.logs
    WHERE accion = 'retirar_permiso_inactivo' AND recurso_id = 'rfq_vista'
  ),
  'El retiro de asignaciones por desactivación queda auditado'
);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-0000000b1c03', 'role', 'authenticated')::text, true);
INSERT INTO public.permisos_rol (rol, permiso) VALUES ('vendedor', 'rfq_vista')
ON CONFLICT (rol, permiso) DO NOTHING;
SELECT ok(
  NOT public.usuario_tiene_permiso('rfq_vista') AND NOT privado.usuario_tiene_permiso('rfq_vista'),
  'Aunque quede asignado, un permiso inactivo no concede acceso en RLS'
);
SELECT throws_ok($$
  SELECT public.actualizar_permisos_rol('vendedor', ARRAY['rfq_vista'],
    '00000000-0000-4000-8000-0000000b1c01'::uuid,
    (SELECT array_agg(permiso) FROM public.permisos_rol WHERE rol = 'vendedor'), NULL)
$$, '22023', 'permiso_desconocido', 'No se puede otorgar un permiso inactivo');

-- 21-24. H-B1-09: auditoría de cambios de rol y de estado en la misma transacción
SELECT lives_ok($$
  SELECT public.cambiar_rol_usuario('00000000-0000-4000-8000-0000000b1c03'::uuid, 'gerente',
    '00000000-0000-4000-8000-0000000b1c01'::uuid, 'Promoción auditada',
    'aaaaaaaa-0000-4000-8000-0000000b1c21'::uuid)
$$, 'Un admin cambia el rol de otro usuario');
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.logs
    WHERE accion = 'cambiar_rol_usuario'
      AND correlation_id = 'aaaaaaaa-0000-4000-8000-0000000b1c21'::uuid
      AND detalles->>'rol_anterior' = 'vendedor'
      AND detalles->>'rol_nuevo' = 'gerente'
      AND detalles->>'motivo' = 'Promoción auditada'
  ),
  'La auditoría del cambio de rol guarda rol anterior, nuevo, motivo y correlation_id'
);
SELECT lives_ok($$
  SELECT public.cambiar_estado_usuario('00000000-0000-4000-8000-0000000b1c03'::uuid, false,
    '00000000-0000-4000-8000-0000000b1c01'::uuid, 'Baja auditada',
    'aaaaaaaa-0000-4000-8000-0000000b1c22'::uuid)
$$, 'Un admin desactiva a otro usuario');
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.logs
    WHERE accion = 'cambiar_estado_usuario'
      AND correlation_id = 'aaaaaaaa-0000-4000-8000-0000000b1c22'::uuid
      AND (detalles->>'activo_anterior')::boolean IS TRUE
      AND (detalles->>'activo_nuevo')::boolean IS FALSE
  ),
  'La auditoría del cambio de estado guarda estado anterior y nuevo'
);

SELECT * FROM finish();
ROLLBACK;
