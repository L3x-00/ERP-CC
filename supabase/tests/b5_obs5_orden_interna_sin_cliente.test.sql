-- Obs. cliente 2026-10-12 (5): orden interna sin cliente y con catálogos.
-- Verifica: cliente_id nullable, alta TI sin cliente con material/espesor/proceso
-- del catálogo persistidos en partidas (área derivada), espesor en snapshot,
-- compatibilidad con el payload anterior (cliente) y rechazos de catálogo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b5d01', 'b5d-admin@prueba.local');
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B5D'
WHERE id = '00000000-0000-4000-8000-0000000b5d01';

INSERT INTO public.areas_trabajo_config (codigo, nombre) VALUES ('OBS5A', 'Área obs5');
INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES
  ('O5MAT', 'Acero obs5'), ('O5MAT2', 'Aluminio obs5');
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, '6 mm', 6 FROM public.catalogo_materiales WHERE codigo = 'O5MAT';
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, '3 mm', 3 FROM public.catalogo_materiales WHERE codigo = 'O5MAT2';
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, area_trabajo_codigo)
VALUES ('O5PROC', 'Proceso obs5', 'OPRD', 'OBS5A');
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000b5d20', 'Cliente B5D', 'Cliente B5D SA', 'activo');

SELECT col_is_null('public', 'ordenes_produccion', 'cliente_id',
  'la orden puede no tener cliente (TI)');

CREATE FUNCTION pg_temp.items(p_material text, p_espesor text, p_proceso uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'codigo_item', 'HERR-01',
    'descripcion', 'Base TI obs5',
    'cantidad', 2,
    'unidad', 'pieza',
    'material_id', (SELECT id FROM public.catalogo_materiales WHERE codigo = p_material),
    'espesor_id', (
      SELECT e.id FROM public.catalogo_espesores AS e
      JOIN public.catalogo_materiales AS m ON m.id = e.material_id
      WHERE m.codigo = p_material AND e.etiqueta = p_espesor
    ),
    'proceso_ids', jsonb_build_array(p_proceso),
    'tiempo_estimado_minutos', 30
  ));
$$;

CREATE TEMP TABLE b5d_ti AS
SELECT * FROM public.crear_orden_interna(
  jsonb_build_object(
    'fecha_compromiso', '2026-11-01T18:00:00Z',
    'prioridad', 'normal',
    'descripcion', 'Mantenimiento interno obs5',
    'items', pg_temp.items('O5MAT', '6 mm', (SELECT id FROM public.catalogo_procesos WHERE codigo = 'O5PROC'))
  ),
  jsonb_build_object('motivo', 'Mantenimiento interno autorizado'),
  '00000000-0000-4000-8000-0000000b5d01',
  gen_random_uuid()
);

SELECT matches((SELECT folio_sii FROM b5d_ti), '^OI-[0-9]{4}_[0-9]{2,3}$',
  'la TI sin cliente usa folio OI-MMYY_XX');

SELECT is(
  (SELECT cliente_id FROM public.ordenes_produccion WHERE id = (SELECT id FROM b5d_ti)),
  NULL, 'la TI sin cliente queda con cliente_id nulo');

SELECT is(
  (SELECT snapshot_json -> 'cabecera' -> 'cliente' FROM public.ordenes_produccion
   WHERE id = (SELECT id FROM b5d_ti)),
  'null'::jsonb, 'el snapshot declara cliente nulo');

SELECT is(
  (SELECT snapshot_json -> 'cabecera' -> 'cliente_id' FROM public.ordenes_produccion
   WHERE id = (SELECT id FROM b5d_ti)),
  'null'::jsonb, 'el snapshot declara cliente_id nulo');

SELECT results_eq(
  format($$SELECT catalogo_material_id, area_trabajo_codigo, procesos FROM public.partidas_orden_produccion WHERE orden_id = %L$$,
    (SELECT id FROM b5d_ti)),
  format($$VALUES ((SELECT id FROM public.catalogo_materiales WHERE codigo = 'O5MAT'), 'OBS5A'::text, ARRAY['Proceso obs5']::text[])$$),
  'la partida persiste material de catálogo, área derivada y procesos');

SELECT is(
  (SELECT snapshot_json -> 'items' -> 0 ->> 'espesor' FROM public.ordenes_produccion
   WHERE id = (SELECT id FROM b5d_ti)),
  '6 mm', 'el espesor del catálogo queda en el snapshot');

SELECT is(
  (SELECT snapshot_json -> 'items' -> 0 ->> 'unidad' FROM public.ordenes_produccion
   WHERE id = (SELECT id FROM b5d_ti)),
  'pieza', 'la unidad de la partida queda en el snapshot');

-- Compatibilidad: el payload anterior (con cliente y material en texto) sigue vivo.
SELECT lives_ok(
  format($$SELECT public.crear_orden_interna(%L, %L, %L)$$,
    jsonb_build_object(
      'cliente_id', '00000000-0000-4000-8000-0000000b5d20',
      'fecha_compromiso', '2026-11-02T18:00:00Z',
      'items', jsonb_build_array(jsonb_build_object(
        'descripcion', 'TI legado', 'cantidad', 1, 'material', 'ACERO', 'espesor', '6 mm',
        'procesos', jsonb_build_array('Corte')))
    )::text,
    jsonb_build_object('motivo', 'Compatibilidad obs5')::text,
    '00000000-0000-4000-8000-0000000b5d01'),
  'el payload anterior con cliente sigue creando la TI');

SELECT throws_ok(
  format($$SELECT public.crear_orden_interna(%L, %L, %L)$$,
    jsonb_build_object(
      'fecha_compromiso', '2026-11-01T18:00:00Z',
      'items', pg_temp.items('O5MAT', '6 mm', '00000000-0000-4000-8000-00000000dead')
    )::text,
    jsonb_build_object('motivo', 'Proceso inexistente')::text,
    '00000000-0000-4000-8000-0000000b5d01'),
  '23514', 'proceso_invalido', 'un proceso fuera del catálogo se rechaza');

SELECT throws_ok(
  format($$SELECT public.crear_orden_interna(%L, %L, %L)$$,
    jsonb_build_object(
      'fecha_compromiso', '2026-11-01T18:00:00Z',
      'items', jsonb_build_array(jsonb_build_object(
        'descripcion', 'Material inválido', 'cantidad', 1,
        'material_id', '00000000-0000-4000-8000-00000000dead'))
    )::text,
    jsonb_build_object('motivo', 'Material inexistente')::text,
    '00000000-0000-4000-8000-0000000b5d01'),
  '23514', 'material_invalido', 'un material fuera del catálogo se rechaza');

SELECT throws_ok(
  format($$SELECT public.crear_orden_interna(%L, %L, %L)$$,
    jsonb_build_object(
      'fecha_compromiso', '2026-11-01T18:00:00Z',
      'items', jsonb_build_array(jsonb_build_object(
        'descripcion', 'Espesor ajeno',
        'cantidad', 1,
        'material_id', (SELECT id FROM public.catalogo_materiales WHERE codigo = 'O5MAT'),
        'espesor_id', (
          SELECT e.id FROM public.catalogo_espesores AS e
          JOIN public.catalogo_materiales AS m ON m.id = e.material_id
          WHERE m.codigo = 'O5MAT2' AND e.etiqueta = '3 mm'
        )
      ))
    )::text,
    jsonb_build_object('motivo', 'Espesor de otro material')::text,
    '00000000-0000-4000-8000-0000000b5d01'),
  '23514', 'espesor_invalido', 'un espesor que no es del material se rechaza');

SELECT * FROM finish();
ROLLBACK;
