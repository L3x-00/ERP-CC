BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

INSERT INTO auth.users(id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a2301', 'a20metas@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2301';
INSERT INTO public.clientes(id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000a2302', 'Cliente metas', 'Cliente metas', 'activo');
INSERT INTO public.ordenes_produccion(id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000a2303', 'OP-992301',
  '00000000-0000-4000-8000-0000000a2302', 'borrador', now());
INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos)
VALUES ('00000000-0000-4000-8000-0000000a2304',
  '00000000-0000-4000-8000-0000000a2303', 'PARTE-1', 5, 'pza',
  ARRAY['Corte', 'Pulido']);

SELECT is((SELECT array_agg(nombre ORDER BY secuencia) FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000a2304'),
  ARRAY['Corte', 'Pulido']::text[], 'RFQ conserva procesos en orden');
SELECT is((SELECT array_agg(meta_piezas ORDER BY secuencia) FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000a2304'),
  ARRAY[5, 5]::numeric[], 'Meta inicial por proceso equivale a cantidad pedida');
SELECT ok(NOT has_table_privilege('authenticated', 'public.metas_proceso_partida', 'INSERT'),
  'JWT no puede crear metas directamente');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.configurar_metas_proceso_partida(uuid,timestamptz,jsonb,uuid)', 'EXECUTE'),
  'JWT no puede ejecutar RPC de escritura');

SELECT is((SELECT partida_id FROM public.configurar_metas_proceso_partida(
  '00000000-0000-4000-8000-0000000a2304',
  (SELECT actualizado_en FROM public.ordenes_produccion
   WHERE id = '00000000-0000-4000-8000-0000000a2303'),
  '[{"nombre":"Corte","meta_piezas":7},{"nombre":"Pulido","meta_piezas":5}]'::jsonb,
  '00000000-0000-4000-8000-0000000a2301')),
  '00000000-0000-4000-8000-0000000a2304'::uuid,
  'Configuración autorizada persiste dentro de una transacción');
SELECT is((SELECT array_agg(meta_piezas ORDER BY secuencia) FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000a2304'),
  ARRAY[7, 5]::numeric[], 'Meta por proceso puede diferir de cantidad física final');
SELECT throws_ok($$SELECT * FROM public.configurar_metas_proceso_partida(
  '00000000-0000-4000-8000-0000000a2304', now(),
  '[{"nombre":"Corte","meta_piezas":2}]'::jsonb,
  '00000000-0000-4000-8000-0000000a2301')$$,
  '23514', 'meta_final_no_equivale_a_cantidad',
  'La última meta corresponde a las piezas físicas pedidas');
SELECT throws_ok($$SELECT * FROM public.configurar_metas_proceso_partida(
  '00000000-0000-4000-8000-0000000a2304', now() - interval '1 day',
  '[{"nombre":"Corte","meta_piezas":5}]'::jsonb,
  '00000000-0000-4000-8000-0000000a2301')$$,
  '23514', 'orden_desactualizada', 'CAS impide sobrescribir una edición posterior');
SELECT throws_ok($$SELECT * FROM public.configurar_metas_proceso_partida(
  '00000000-0000-4000-8000-0000000a2304', now(),
  '[{"nombre":"","meta_piezas":2}]'::jsonb,
  '00000000-0000-4000-8000-0000000a2301')$$,
  '23514', 'metas_proceso_invalidas', 'Nombre vacío rechazado sin cambios');
SELECT throws_ok($$SELECT * FROM public.configurar_metas_proceso_partida(
  '00000000-0000-4000-8000-0000000a2304', now(),
  '[{"nombre":"Corte","meta_piezas":"cinco"}]'::jsonb,
  '00000000-0000-4000-8000-0000000a2301')$$,
  '23514', 'metas_proceso_invalidas', 'Meta no numérica produce error controlado');
UPDATE public.usuarios SET activo = false WHERE id = '00000000-0000-4000-8000-0000000a2301';
SELECT throws_ok(format(
  'SELECT * FROM public.configurar_metas_proceso_partida(%L,%L,%L::jsonb,%L)',
  '00000000-0000-4000-8000-0000000a2304',
  (SELECT actualizado_en FROM public.ordenes_produccion
   WHERE id = '00000000-0000-4000-8000-0000000a2303'),
  '[{"nombre":"Corte","meta_piezas":5}]',
  '00000000-0000-4000-8000-0000000a2301'),
  '42501', 'sin_permiso_configurar_procesos', 'Actor inactivo rechazado en SQL');
UPDATE public.partidas_orden_produccion SET cantidad_solicitada = 6
  WHERE id = '00000000-0000-4000-8000-0000000a2304';
SELECT is((SELECT meta_piezas FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000a2304' AND secuencia = 2),
  6::numeric, 'Cambiar cantidad en borrador ajusta solo la meta final');

SELECT * FROM finish();
ROLLBACK;
