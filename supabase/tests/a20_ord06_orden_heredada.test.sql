BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000c0001', 'ord06-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c0002', 'ord06-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c0001';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c0002';

INSERT INTO public.areas_trabajo_config (codigo, nombre, tipo, area_planeacion, activo, orden)
VALUES ('ORD06_AREA', 'Área ORD-06', 'area', 'sheet_metal', true, 930);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES
  ('00000000-0000-4000-8000-0000000c0010', 'Cliente ORD-06', 'Cliente ORD-06 SA', 'activo'),
  ('00000000-0000-4000-8000-0000000c0011', 'Cliente inactivo', 'Cliente inactivo SA', 'inactivo');

SELECT ok(EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ordenes_produccion'
    AND column_name = 'id_historico'
), 'La orden conserva el identificador previo del sistema anterior');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'ordenes_produccion'
    AND indexname = 'ordenes_produccion_id_historico_unico'
), 'El ID previo tiene índice único parcial');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'archivos-orden-historica'), false,
  'Los archivos heredados viven en un bucket privado');
SELECT ok(NOT has_table_privilege('authenticated', 'public.archivos_orden', 'INSERT'),
  'Un JWT no inserta metadatos de archivo heredado');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_orden_historica(uuid,uuid,text,date,timestamptz,text,text,numeric,numeric,numeric,text,jsonb)',
  'EXECUTE'), 'Un JWT no ejecuta el alta heredada');
SELECT ok(has_function_privilege('service_role',
  'public.crear_orden_historica(uuid,uuid,text,date,timestamptz,text,text,numeric,numeric,numeric,text,jsonb)',
  'EXECUTE'), 'El servidor sí ejecuta el alta heredada');

SELECT throws_ok($$SELECT * FROM public.crear_orden_historica(
  '00000000-0000-4000-8000-0000000c0010', '00000000-0000-4000-8000-0000000c0002',
  'HIST-001', current_date, now(), 'contado', NULL, 100, 16, 4, NULL,
  '[{"codigo_pieza":"P-1","cantidad_solicitada":1,"unidad_medida":"pza"}]'::jsonb)$$,
  '42501', 'sin_permiso_orden_historica', 'Un operador sin permiso no captura trabajo heredado');

SELECT throws_ok($$SELECT * FROM public.crear_orden_historica(
  '00000000-0000-4000-8000-0000000c0010', '00000000-0000-4000-8000-0000000c0001',
  'HIST-000', current_date, now(), 'contado', NULL, 0, 0, 4, NULL,
  '[{"codigo_pieza":"P-1","cantidad_solicitada":1,"unidad_medida":"pza"}]'::jsonb)$$,
  '23514', 'orden_historica_invalida', 'Un monto total de cero se rechaza antes de escribir');
SELECT throws_ok($$SELECT * FROM public.crear_orden_historica(
  '00000000-0000-4000-8000-0000000c0011', '00000000-0000-4000-8000-0000000c0001',
  'HIST-000', current_date, now(), 'contado', NULL, 100, 16, 4, NULL,
  '[{"codigo_pieza":"P-1","cantidad_solicitada":1,"unidad_medida":"pza"}]'::jsonb)$$,
  '23514', 'cliente_no_activo', 'Un cliente inactivo no recibe trabajo heredado');

SELECT is((
  SELECT creada.id IS NOT NULL AND creada.folio LIKE 'OP-%' AND creada.cuenta_id IS NOT NULL
  FROM public.crear_orden_historica(
    '00000000-0000-4000-8000-0000000c0010', '00000000-0000-4000-8000-0000000c0001',
    '  hist-100  ', '2026-08-15', now() + interval '10 days', '30_dias', 'LEGACY-77',
    1000, 160, 12.5, 'Trabajo migrado del sistema anterior',
    '[{"codigo_pieza":"P-1","descripcion":"Pieza heredada","cantidad_solicitada":3,
       "unidad_medida":"pza","tiempo_estimado_minutos":120,
       "area_trabajo_codigo":"ORD06_AREA","procesos":["Corte","Pulido"]}]'::jsonb
  ) AS creada
), true, 'El alta autorizada crea orden OP con AR en una transacción');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id_historico = 'hist-100'), 'programada',
  'La orden heredada nace en Bandeja (programada)');
SELECT is((SELECT id_historico FROM public.ordenes_produccion
  WHERE id_historico = 'hist-100'), 'hist-100',
  'El ID previo se normaliza sin espacios ni mayúsculas');
SELECT is((SELECT count(*)::integer FROM public.ordenes_produccion
  WHERE id_historico = 'hist-100' AND cotizacion_id IS NULL), 1,
  'La orden heredada no pertenece a una cotización RFQ');
SELECT is((SELECT array_agg(partida.codigo_pieza ORDER BY partida.codigo_pieza)
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE orden.id_historico = 'hist-100'), ARRAY['P-1']::text[],
  'Las partidas heredadas se persisten con la orden');
SELECT is((SELECT array_agg(meta.nombre ORDER BY meta.secuencia)
  FROM public.metas_proceso_partida AS meta
  JOIN public.partidas_orden_produccion AS partida ON partida.id = meta.partida_id
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE orden.id_historico = 'hist-100'), ARRAY['Corte', 'Pulido']::text[],
  'ORD-07 inicializa las metas de proceso de la partida heredada');
SELECT is((
  SELECT cuenta.estado || '|' || cuenta.monto_total || '|' || cuenta.monto_subtotal
    || '|' || cuenta.monto_iva || '|' || (cuenta.cobrable_desde IS NULL)::text
  FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  WHERE orden.id_historico = 'hist-100'
), 'pendiente|1160.0000|1000.0000|160.0000|true',
  'La AR borrador heredada conserva base, IVA y no es cobrable aún');
SELECT is((SELECT count(*)::integer FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  WHERE orden.id_historico = 'hist-100'), 1,
  'Una sola AR por orden heredada');

SELECT throws_ok($$SELECT * FROM public.crear_orden_historica(
  '00000000-0000-4000-8000-0000000c0010', '00000000-0000-4000-8000-0000000c0001',
  'HIST-100', current_date, now(), 'contado', NULL, 100, 16, 4, NULL,
  '[{"codigo_pieza":"P-2","cantidad_solicitada":1,"unidad_medida":"pza"}]'::jsonb)$$,
  '23505', 'id_historico_duplicado',
  'Repetir el ID previo se rechaza aunque cambie el uso de mayúsculas');
SELECT is((SELECT count(*)::integer FROM public.ordenes_produccion
  WHERE id_historico = 'hist-100'), 1,
  'El rechazo por ID repetido no duplica la orden');
SELECT is((SELECT count(*)::integer FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  WHERE orden.id_historico = 'hist-100'), 1,
  'El rechazo por ID repetido no duplica la AR');

SELECT * FROM finish();
ROLLBACK;
