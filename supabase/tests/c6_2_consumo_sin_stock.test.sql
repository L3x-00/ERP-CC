-- C6.2 — snapshot económico reproducible sin kardex, reserva ni stock.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c6201', 'c62-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c6202', 'c62-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000c6203', 'c62-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true WHERE id = '00000000-0000-4000-8000-0000000c6201';
UPDATE public.usuarios SET rol = 'operador', activo = true WHERE id = '00000000-0000-4000-8000-0000000c6202';
UPDATE public.usuarios SET rol = 'vendedor', activo = true WHERE id = '00000000-0000-4000-8000-0000000c6203';

INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control
) VALUES (
  '00000000-0000-4000-8000-0000000c6210', 'C62ACERO', 'Acero legado C62',
  'materia_prima', 'pieza', 'kg', 1, 8, 8, 100, 10
);
INSERT INTO public.catalogo_materiales (
  id, codigo, nombre, unidad_base, material_legacy_id
) VALUES (
  '00000000-0000-4000-8000-0000000c6211', 'C62CANON', 'Acero canónico C62', 'kg',
  '00000000-0000-4000-8000-0000000c6210'
);
SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6211', 12.5, 'USD', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-0000000c6201',
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE id = '00000000-0000-4000-8000-0000000c6211'), NULL
);

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c6220', 'Cliente C62', 'Cliente C62', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c6221', 'OP-996201',
  '00000000-0000-4000-8000-0000000c6220', 'en_proceso', now() + interval '5 days');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida,
  catalogo_material_id, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000c6222', '00000000-0000-4000-8000-0000000c6221',
  'C62-PIEZA', 10, 'pieza', '00000000-0000-4000-8000-0000000c6211',
  '00000000-0000-4000-8000-0000000c6202'
);

CREATE TEMP TABLE c62 ON COMMIT DROP AS
SELECT
  (SELECT stock_actual_control FROM public.materiales WHERE id = '00000000-0000-4000-8000-0000000c6210') AS stock_antes,
  (SELECT count(*) FROM public.movimientos_inventario WHERE material_id = '00000000-0000-4000-8000-0000000c6210') AS movimientos_antes,
  (SELECT count(*) FROM public.reservas_material WHERE material_id = '00000000-0000-4000-8000-0000000c6210') AS reservas_antes,
  (SELECT tipo_cambio_usd FROM public.configuracion_sistema LIMIT 1) AS tc;
ALTER TABLE c62 ADD COLUMN consumo_id uuid;
ALTER TABLE c62 ADD COLUMN movimiento_id uuid;
UPDATE c62 SET (consumo_id, movimiento_id) = (
  SELECT id, movimiento_inventario_id
  FROM public.registrar_consumo_material_op(
    '00000000-0000-4000-8000-0000000c6222', '00000000-0000-4000-8000-0000000c6211',
    2, 0.5, '00000000-0000-4000-8000-0000000c6201'
  )
);

SELECT has_column('public', 'partidas_orden_produccion', 'catalogo_material_id',
  'la partida referencia el catálogo canónico');
SELECT has_column('public', 'registros_consumo_material', 'tipo_cambio',
  'el consumo congela el tipo de cambio');
SELECT is((SELECT origen FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  'NUEVO', 'el consumo usa el contrato nuevo');
SELECT is((SELECT catalogo_material_id FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  '00000000-0000-4000-8000-0000000c6211'::uuid, 'congela el material canónico');
SELECT is((SELECT material_id FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  NULL::uuid, 'no finge una relación con inventario legado');
SELECT is((SELECT unidad_base FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  'kg', 'congela la unidad');
SELECT is((SELECT costo_unitario_origen FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  12.5000::numeric, 'congela el costo en moneda original');
SELECT is((SELECT moneda_costo FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  'USD', 'congela la moneda');
SELECT is((SELECT tipo_cambio FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  (SELECT tc FROM c62), 'congela el tipo de cambio vigente');
SELECT is((SELECT costo_unitario_momento FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  round(12.5 * (SELECT tc FROM c62), 4), 'congela el costo unitario convertido a MXN');
SELECT is((SELECT actor_id FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  '00000000-0000-4000-8000-0000000c6201'::uuid, 'congela el actor');
SELECT is((SELECT movimiento_id FROM c62), NULL::uuid, 'no devuelve movimiento de inventario');
SELECT is((SELECT stock_actual_control FROM public.materiales WHERE id = '00000000-0000-4000-8000-0000000c6210'),
  (SELECT stock_antes FROM c62), 'no cambia existencias legadas');
SELECT is((SELECT count(*) FROM public.movimientos_inventario WHERE material_id = '00000000-0000-4000-8000-0000000c6210'),
  (SELECT movimientos_antes FROM c62), 'no crea kardex');
SELECT is((SELECT count(*) FROM public.reservas_material WHERE material_id = '00000000-0000-4000-8000-0000000c6210'),
  (SELECT reservas_antes FROM c62), 'no crea reservas');

SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6211', 20, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-0000000c6201',
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE id = '00000000-0000-4000-8000-0000000c6211'), NULL
);
SELECT is((SELECT costo_unitario_origen FROM public.registros_consumo_material WHERE id = (SELECT consumo_id FROM c62)),
  12.5000::numeric, 'cambiar el maestro no reescribe el consumo');
SELECT is((SELECT r.costo_materiales_mxn FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000c6221') AS r),
  round(2.5 * 12.5 * (SELECT tc FROM c62), 4), 'rentabilidad suma el consumo nuevo exactamente una vez');
SELECT throws_ok($$SELECT public.registrar_consumo_material_op(
  '00000000-0000-4000-8000-0000000c6222', '00000000-0000-4000-8000-0000000c6211',
  1, 0, '00000000-0000-4000-8000-0000000c6203')$$,
  '42501', 'sin_permiso_materiales', 'un actor sin permiso no registra consumo administrativo');
SELECT throws_ok($$SELECT public.registrar_consumo_material_op(
  '00000000-0000-4000-8000-0000000c6222', '00000000-0000-4000-8000-0000000c6211',
  0, 0, '00000000-0000-4000-8000-0000000c6201')$$,
  '23514', 'cantidad_consumo_invalida', 'el consumo total debe ser positivo');
SELECT lives_ok($$SELECT public.registrar_consumo_material_operador_op(
  '00000000-0000-4000-8000-0000000c6222', '00000000-0000-4000-8000-0000000c6211',
  1, 0, '00000000-0000-4000-8000-0000000c6202')$$,
  'el operador asignado registra sin tocar stock');
SELECT is((SELECT count(*) FROM public.movimientos_inventario WHERE material_id = '00000000-0000-4000-8000-0000000c6210'),
  (SELECT movimientos_antes FROM c62), 'el consumo de piso tampoco crea kardex');
SELECT ok(NOT EXISTS (
  SELECT 1
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'registrar_consumo_material_op'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, numeric, numeric'
), 'se retira la firma antigua sin actor');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_consumo_material_op(uuid,uuid,numeric,numeric,uuid)', 'EXECUTE'),
  'authenticated no ejecuta la mutación privilegiada');
SELECT ok(NOT has_column_privilege('authenticated', 'public.registros_consumo_material',
  'costo_unitario_momento', 'SELECT'), 'el costo congelado no se filtra a operación');

SELECT * FROM finish();
ROLLBACK;
