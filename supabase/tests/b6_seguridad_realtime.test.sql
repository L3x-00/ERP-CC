-- B6 — AUD-13 (publicación Realtime de producción) y AUD-16 (permisos C13).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(15);

-- -----------------------------------------------------------------------------
-- 0. Actores
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b6a01', 'b6-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b6a02', 'b6-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000b6a03', 'b6-vendedor@prueba.local');

UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B6'
WHERE id = '00000000-0000-4000-8000-0000000b6a01';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B6'
WHERE id = '00000000-0000-4000-8000-0000000b6a02';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B6'
WHERE id = '00000000-0000-4000-8000-0000000b6a03';

-- -----------------------------------------------------------------------------
-- 1. AUD-13 — publicación Realtime de las tablas de producción
-- -----------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'retrabajos_produccion'
  ),
  'AUD-13: retrabajos_produccion está en la publicación Realtime'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'inspecciones_calidad'
  ),
  'AUD-13: inspecciones_calidad está en la publicación Realtime'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'consumos_material_cliente'
  ),
  'AUD-13: consumos_material_cliente está en la publicación Realtime'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'sesion_item_tiempos'
  ),
  'AUD-13: sesion_item_tiempos está en la publicación Realtime'
);

-- -----------------------------------------------------------------------------
-- 2. AUD-16 — privilegios de ejecución
-- -----------------------------------------------------------------------------
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.obtener_material_cliente_orden(uuid,uuid)',
    'EXECUTE'
  ),
  'AUD-16: service_role ejecuta obtener_material_cliente_orden'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.obtener_material_cliente_orden(uuid,uuid)',
    'EXECUTE'
  ),
  'AUD-16: authenticated no ejecuta obtener_material_cliente_orden'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.obtener_items_corrida(uuid,uuid)',
    'EXECUTE'
  ),
  'AUD-16: service_role ejecuta obtener_items_corrida'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.obtener_items_corrida(uuid,uuid)',
    'EXECUTE'
  ),
  'AUD-16: authenticated no ejecuta obtener_items_corrida'
);

-- -----------------------------------------------------------------------------
-- 3. AUD-16 — un usuario activo SIN permiso ya no pasa
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT * FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-0000000b6d01'::uuid,
    '00000000-0000-4000-8000-0000000b6a03'::uuid)
$$, '42501', 'sin_permiso_material_cliente',
  'AUD-16: un vendedor activo sin permiso no lee material del cliente');

SELECT throws_ok($$
  SELECT * FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-0000000b6c01'::uuid,
    '00000000-0000-4000-8000-0000000b6a03'::uuid)
$$, '42501', 'sin_permiso_corrida',
  'AUD-16: un vendedor activo sin permiso no lee ítems de corrida');

-- -----------------------------------------------------------------------------
-- 4. Fixtures para la ruta permitida (admin y operador de la sesión)
-- -----------------------------------------------------------------------------
INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000b6b01', 'Cliente B6', 'Cliente B6 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, estado_sii, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000b6d01', 'O-1026_61',
  '00000000-0000-4000-8000-0000000b6b01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada, cantidad_producida, unidad_medida)
VALUES ('00000000-0000-4000-8000-0000000b6e01', '00000000-0000-4000-8000-0000000b6d01',
  'P-61', 'IT01', 'Pieza B6', 5, 5, 'pieza');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000b6f01', 'B6-REC', 'Estación B6', 'taller', true);

INSERT INTO public.programacion_areas
  (id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion, fecha_programada, turno, horas_estimadas)
VALUES ('00000000-0000-4000-8000-0000000b6001', '00000000-0000-4000-8000-0000000b6d01',
  '00000000-0000-4000-8000-0000000b6e01', '00000000-0000-4000-8000-0000000b6f01',
  1, 'en_proceso', current_date, 'matutino', 4);

INSERT INTO public.catalogo_procesos (id, codigo, nombre, prefijo_corrida)
VALUES ('00000000-0000-4000-8000-0000000b6201', 'B6PROC', 'Proceso B6', 'BPP');

INSERT INTO public.corridas
  (id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por)
VALUES ('00000000-0000-4000-8000-0000000b6c01', '00000000-0000-4000-8000-0000000b6d01',
  'BPP01', '00000000-0000-4000-8000-0000000b6201', 'EN_PROCESO', 5,
  '00000000-0000-4000-8000-0000000b6a01');

INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
VALUES ('00000000-0000-4000-8000-0000000b6c01', '00000000-0000-4000-8000-0000000b6e01', 'IT01', 5);

INSERT INTO public.sesiones_trabajo
  (id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, corrida_id)
VALUES ('00000000-0000-4000-8000-0000000b6401', '00000000-0000-4000-8000-0000000b6d01',
  '00000000-0000-4000-8000-0000000b6e01', '00000000-0000-4000-8000-0000000b6001',
  '00000000-0000-4000-8000-0000000b6a02', 'activa', '00000000-0000-4000-8000-0000000b6c01');

-- -----------------------------------------------------------------------------
-- 5. AUD-16 — las rutas legítimas siguen funcionando
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT * FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-0000000b6d01'::uuid,
    '00000000-0000-4000-8000-0000000b6a01'::uuid)
$$, 'AUD-16: el administrador activo conserva la lectura de material del cliente');

SELECT lives_ok($$
  SELECT * FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-0000000b6d01'::uuid,
    '00000000-0000-4000-8000-0000000b6a02'::uuid)
$$, 'AUD-16: el operador dueño de la sesión conserva la lectura de material del cliente');

SELECT is(
  (SELECT count(*)::integer FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-0000000b6c01'::uuid,
    '00000000-0000-4000-8000-0000000b6a01'::uuid)),
  1, 'AUD-16: el administrador con gestionar_produccion lee los ítems de la corrida'
);

SELECT is(
  (SELECT count(*)::integer FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-0000000b6c01'::uuid,
    '00000000-0000-4000-8000-0000000b6a02'::uuid)),
  1, 'AUD-16: el operador dueño de la sesión conserva la lectura de su corrida'
);

SELECT throws_ok($$
  SELECT * FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-0000000b6c01'::uuid,
    '00000000-0000-4000-8000-0000000b6a03'::uuid)
$$, '42501', 'sin_permiso_corrida',
  'AUD-16: un usuario activo ajeno a la sesión sigue sin acceso');

SELECT * FROM finish();
ROLLBACK;
