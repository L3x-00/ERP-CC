-- Obs. cliente 2026-10-13 (8) — Saldos manuales de material: tabla, historial y RPC.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(14);

-- Fixture: actor admin, material + espesor y un material ajeno para el cruce.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c08a1', 'obs8-admin@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin OBS8'
WHERE id = '00000000-0000-4000-8000-0000000c08a1';
INSERT INTO public.catalogo_materiales (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c08d1', 'OBS8_SALDO', 'Material saldo OBS8'),
  ('00000000-0000-4000-8000-0000000c08d2', 'OBS8_OTRO', 'Material ajeno OBS8');
INSERT INTO public.catalogo_espesores (id, material_id, etiqueta, espesor_mm) VALUES
  ('00000000-0000-4000-8000-0000000c08e1', '00000000-0000-4000-8000-0000000c08d1', '5 mm', 5);

-- 1-2. Tablas
SELECT has_table('public', 'saldos_material', 'Existe la tabla de saldos manuales');
SELECT has_table('public', 'movimientos_saldo_material', 'Existe la bitácora de ajustes');

-- 3-6. Privilegios
SELECT ok(has_table_privilege('authenticated', 'public.saldos_material', 'SELECT'),
  'authenticated lee saldos (RLS decide filas)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.saldos_material', 'INSERT'),
  'authenticated no escribe saldos directamente');
SELECT ok(has_table_privilege('service_role', 'public.movimientos_saldo_material', 'INSERT'),
  'service_role registra movimientos');
SELECT ok(NOT has_function_privilege('authenticated',
    'public.ajustar_saldo_material(uuid, uuid, uuid, numeric, text)', 'EXECUTE'),
  'authenticated no ejecuta la RPC de ajuste');

-- 7-10. Ajustes: primer saldo, anterior conservado y bitácora completa
SELECT is(
  (SELECT saldo_anterior FROM public.ajustar_saldo_material(
    '00000000-0000-4000-8000-0000000c08a1', '00000000-0000-4000-8000-0000000c08d1', NULL,
    120, 'Alta inicial de existencia')),
  0::numeric, 'El primer ajuste parte de saldo cero');
SELECT is(
  (SELECT saldo FROM public.saldos_material
   WHERE material_id = '00000000-0000-4000-8000-0000000c08d1' AND espesor_id IS NULL),
  120::numeric, 'El saldo queda fijado en el valor indicado');
SELECT is(
  (SELECT saldo_anterior FROM public.ajustar_saldo_material(
    '00000000-0000-4000-8000-0000000c08a1', '00000000-0000-4000-8000-0000000c08d1', NULL,
    80, 'Corrección de conteo físico')),
  120::numeric, 'El segundo ajuste conserva el saldo anterior');
SELECT is(
  (SELECT count(*) FROM public.movimientos_saldo_material
   WHERE material_id = '00000000-0000-4000-8000-0000000c08d1'),
  2::bigint, 'Cada ajuste deja un movimiento en la bitácora');

-- 11-14. Validaciones y append-only
SELECT throws_ok($$
  SELECT public.ajustar_saldo_material(
    '00000000-0000-4000-8000-0000000c08a1', '00000000-0000-4000-8000-0000000c08d1', NULL,
    -5, 'Saldo negativo inválido')
$$, '22023', NULL, 'Un saldo negativo se rechaza');
SELECT throws_ok($$
  SELECT public.ajustar_saldo_material(
    '00000000-0000-4000-8000-0000000c08a1', '00000000-0000-4000-8000-0000000c08d1', NULL,
    10, 'ok')
$$, '22023', NULL, 'Un motivo demasiado corto se rechaza');
SELECT throws_ok($$
  SELECT public.ajustar_saldo_material(
    '00000000-0000-4000-8000-0000000c08a1', '00000000-0000-4000-8000-0000000c08d2',
    '00000000-0000-4000-8000-0000000c08e1', 10, 'Espesor de otro material')
$$, '22023', NULL, 'El espesor debe pertenecer al material');
SELECT throws_ok($$
  UPDATE public.movimientos_saldo_material SET saldo_nuevo = 999
$$, '42501', NULL, 'La bitácora de ajustes es de solo lectura');

SELECT * FROM finish();
ROLLBACK;
