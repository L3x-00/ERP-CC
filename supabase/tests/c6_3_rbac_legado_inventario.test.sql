-- C6.3 — RBAC del inventario legado: materiales y reservas solo para
-- `gestionar_inventario` (o admin); el resto de usuarios autenticados no ve
-- filas ni costos. Sustituye las políticas USING (true) originales.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(9);

-- Actores: admin, gerente (gestiona inventario) y vendedor (sin permiso).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000c6301', 'c63-admin@prueba.local',
   '{"nombre_completo":"Admin C63"}'::jsonb),
  ('00000000-0000-4000-8000-0000000c6302', 'c63-gerente@prueba.local',
   '{"nombre_completo":"Gerente C63"}'::jsonb),
  ('00000000-0000-4000-8000-0000000c6303', 'c63-vendedor@prueba.local',
   '{"nombre_completo":"Vendedor C63"}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
  WHERE id = '00000000-0000-4000-8000-0000000c6301';
UPDATE public.usuarios SET rol = 'gerente', activo = true
  WHERE id = '00000000-0000-4000-8000-0000000c6302';
UPDATE public.usuarios SET rol = 'vendedor', activo = true
  WHERE id = '00000000-0000-4000-8000-0000000c6303';

-- Fixtures: un material legado, un cliente/orden y una reserva histórica.
INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion
) VALUES (
  '00000000-0000-4000-8000-0000000c6310', 'C63-LEGADO', 'Material legado C63',
  'materia_prima', 'pieza', 'pieza', 1
);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c6340', 'Cliente C63', 'Cliente C63', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c6330', 'OP-996301',
  '00000000-0000-4000-8000-0000000c6340', 'en_proceso', now() + interval '5 days');
INSERT INTO public.reservas_material (
  id, material_id, orden_id, cantidad_reservada
) VALUES (
  '00000000-0000-4000-8000-0000000c6320',
  '00000000-0000-4000-8000-0000000c6310',
  '00000000-0000-4000-8000-0000000c6330', 5
);

-- 1-2. La política única de lectura es la nueva (sin políticas USING true).
SELECT policies_are('public', 'materiales', ARRAY['materiales_seleccionar'],
  'materiales conserva una única política de lectura');
SELECT policies_are('public', 'reservas_material', ARRAY['reservas_material_seleccionar'],
  'reservas_material conserva una única política de lectura');

-- 3-4. Sanidad de fixtures con service_role.
SELECT is(
  (SELECT count(*)::integer FROM public.materiales WHERE codigo = 'C63-LEGADO'),
  1, 'el material legado existe');
SELECT is(
  (SELECT count(*)::integer FROM public.reservas_material
    WHERE id = '00000000-0000-4000-8000-0000000c6320'),
  1, 'la reserva histórica existe');

-- 5-6. Vendedor: sin filas (ni costos).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c6303', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.materiales WHERE codigo = 'C63-LEGADO'),
  0, 'vendedor no ve materiales legados');
SELECT is(
  (SELECT count(*)::integer FROM public.reservas_material
    WHERE id = '00000000-0000-4000-8000-0000000c6320'),
  0, 'vendedor no ve reservas históricas');
RESET ROLE;

-- 7-8. Gerente con `gestionar_inventario`: sí las ve.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c6302', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.materiales WHERE codigo = 'C63-LEGADO'),
  1, 'gerente ve materiales legados');
SELECT is(
  (SELECT count(*)::integer FROM public.reservas_material
    WHERE id = '00000000-0000-4000-8000-0000000c6320'),
  1, 'gerente ve reservas históricas');
RESET ROLE;

-- 9. Admin: acceso total.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c6301', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.materiales WHERE codigo = 'C63-LEGADO'),
  1, 'admin ve materiales legados');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
