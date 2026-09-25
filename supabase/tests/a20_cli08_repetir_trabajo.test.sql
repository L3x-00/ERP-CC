BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(21);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000d0001', 'cli08-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000d0002', 'cli08-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000d0001';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000d0002';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000d0010', 'Cliente CLI-08', 'Cliente CLI-08 SA', 'activo');

-- Orden heredada de origen con datos completos.
SELECT creada.id AS origen_id, creada.cuenta_id AS origen_cuenta_id
FROM public.crear_orden_historica(
  '00000000-0000-4000-8000-0000000d0010', '00000000-0000-4000-8000-0000000d0001',
  'CLI08-ORIGEN', '2026-05-10', now() + interval '5 days', 'credito', 'EXT-999',
  800, 128, 10, 'Nota de la ejecución anterior',
  '[{"codigo_pieza":"C8-1","descripcion":"Pieza repetible","cantidad_solicitada":5,
     "unidad_medida":"pza","tiempo_estimado_minutos":90,"procesos":["Corte","Doblez"],
     "maquina_asignada":"CNC-1"}]'::jsonb
) AS creada;

-- Huellas de la ejecución anterior que no deben viajar a la repetición.
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000d0040', 'CLI08-REC', 'taller', 'Recurso CLI-08', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
)
SELECT '00000000-0000-4000-8000-0000000d0101', partida.orden_id, partida.id,
  '00000000-0000-4000-8000-0000000d0040', 1, 'en_proceso', current_date, 'matutino', 1
FROM public.partidas_orden_produccion AS partida
JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
WHERE orden.id_historico = 'cli08-origen';
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
)
SELECT '00000000-0000-4000-8000-0000000d0100', partida.orden_id, partida.id,
  '00000000-0000-4000-8000-0000000d0101', '00000000-0000-4000-8000-0000000d0002',
  'activa', now() - interval '2 hours'
FROM public.partidas_orden_produccion AS partida
JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
WHERE orden.id_historico = 'cli08-origen';
INSERT INTO public.registros_avance_partida (partida_id, operador_id, cantidad_producida, sesion_trabajo_id)
SELECT partida.id, '00000000-0000-4000-8000-0000000d0002', 2, '00000000-0000-4000-8000-0000000d0100'
FROM public.partidas_orden_produccion AS partida
JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
WHERE orden.id_historico = 'cli08-origen';
UPDATE public.partidas_orden_produccion AS partida
SET cantidad_producida = 2
FROM public.ordenes_produccion AS orden
WHERE orden.id = partida.orden_id AND orden.id_historico = 'cli08-origen';
INSERT INTO public.archivos_orden (orden_id, ruta, nombre, mime, tamano, creado_por)
SELECT orden.id, 'cli08/' || orden.id || '/plano.pdf', 'plano.pdf', 'application/pdf', 100,
  '00000000-0000-4000-8000-0000000d0001'
FROM public.ordenes_produccion AS orden WHERE orden.id_historico = 'cli08-origen';

SELECT ok(NOT has_function_privilege('authenticated',
  'public.repetir_orden_op(uuid,uuid,timestamptz)', 'EXECUTE'),
  'Un JWT no ejecuta la repetición');
SELECT ok(NOT has_function_privilege('anon',
  'public.repetir_orden_op(uuid,uuid,timestamptz)', 'EXECUTE'),
  'Un visitante tampoco ejecuta la repetición');
SELECT ok(has_function_privilege('service_role',
  'public.repetir_orden_op(uuid,uuid,timestamptz)', 'EXECUTE'),
  'El servidor sí ejecuta la repetición');

SELECT throws_ok(format(
  'SELECT * FROM public.repetir_orden_op(%L,%L,%L)',
  (SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen'),
  '00000000-0000-4000-8000-0000000d0002', now() + interval '9 days'),
  '42501', 'sin_permiso_repetir_orden', 'Un operador sin permiso no repite trabajo');

SELECT lives_ok(format(
  'SELECT * FROM public.repetir_orden_op(%L,%L,%L)',
  (SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen'),
  '00000000-0000-4000-8000-0000000d0001', now() + interval '9 days'),
  'El admin repite el trabajo en una transacción');

SELECT is((
  SELECT orden.cliente_id FROM public.ordenes_produccion AS orden
  WHERE orden.orden_origen_id = (
    SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen')
), '00000000-0000-4000-8000-0000000d0010'::uuid,
  'La repetición conserva el cliente');
SELECT is((
  SELECT orden.estado FROM public.ordenes_produccion AS orden
  WHERE orden.orden_origen_id = (
    SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen')
), 'programada', 'La repetición entra en Bandeja');
SELECT is((
  SELECT orden.id_historico FROM public.ordenes_produccion AS orden
  WHERE orden.orden_origen_id = (
    SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen')
), NULL, 'El trabajo repetido no hereda el ID previo');
SELECT ok((
  SELECT orden.folio <> origen.folio
  FROM public.ordenes_produccion AS orden
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 'La repetición muestra un identificador nuevo');
SELECT is((
  SELECT orden.referencia_externa || '|' || orden.condicion_pago || '|' || orden.horas_estimadas
  FROM public.ordenes_produccion AS orden
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 'EXT-999|credito|10.00', 'La repetición copia referencia, condición y horas');
SELECT ok((
  SELECT orden.notas IS NULL AND orden.fecha_trabajo IS NULL AND orden.id_historico IS NULL
  FROM public.ordenes_produccion AS orden
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 'Las notas y fechas de la ejecución anterior no viajan');

SELECT is((
  SELECT array_agg(array_to_string(partida.procesos, ',') || '|' || partida.maquina_asignada)
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), ARRAY['Corte,Doblez|CNC-1']::text[],
  'La repetición reutiliza datos técnicos de la partida');
SELECT is((
  SELECT count(*)::integer FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen' AND partida.cantidad_producida = 0
), 1, 'La repetición reinicia las cantidades producidas');
SELECT is((
  SELECT count(*)::integer FROM public.metas_proceso_partida AS meta
  JOIN public.partidas_orden_produccion AS partida ON partida.id = meta.partida_id
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 2, 'La repetición inicializa metas nuevas de proceso');

SELECT is((
  SELECT count(*)::integer FROM public.sesiones_trabajo AS sesion
  JOIN public.ordenes_produccion AS orden ON orden.id = sesion.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 0, 'La repetición no copia sesiones');
SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida AS avance
  JOIN public.partidas_orden_produccion AS partida ON partida.id = avance.partida_id
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 0, 'La repetición no copia avances');
SELECT is((
  SELECT count(*)::integer FROM public.archivos_orden AS archivo
  JOIN public.ordenes_produccion AS orden ON orden.id = archivo.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 0, 'La repetición no copia documentos');

SELECT is((
  SELECT cuenta.estado || '|' || cuenta.monto_total || '|' || (cuenta.cobrable_desde IS NULL)::text
  FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 'pendiente|928.0000|true', 'La repetición crea su propia AR borrador con el precio comercial');
SELECT is((
  SELECT count(*)::integer FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  JOIN public.ordenes_produccion AS origen ON origen.id = orden.orden_origen_id
  WHERE origen.id_historico = 'cli08-origen'
), 1, 'La repetición no duplica cuentas por cobrar');

-- Orden activa sin historial: no repetible.
CREATE TEMP TABLE cli08_manual ON COMMIT DROP AS
SELECT creada.id FROM public.crear_orden_manual(
  '00000000-0000-4000-8000-0000000d0010', now() + interval '3 days', 'normal',
  '[{"codigo_pieza":"M-1","cantidad_solicitada":1,"unidad_medida":"pza"}]'::jsonb
) AS creada;
UPDATE public.ordenes_produccion SET estado = 'programada'
WHERE id = (SELECT id FROM cli08_manual);
SELECT throws_ok(format(
  'SELECT * FROM public.repetir_orden_op(%L,%L,%L)',
  (SELECT id FROM cli08_manual),
  '00000000-0000-4000-8000-0000000d0001', now() + interval '9 days'),
  '23514', 'orden_no_repetible', 'Una orden activa sin historial no se repite');

-- Orden heredada cancelada: tampoco.
UPDATE public.ordenes_produccion
SET estado = 'cancelada', motivo_cancelacion = 'prueba'
WHERE id_historico = 'cli08-origen';
SELECT throws_ok(format(
  'SELECT * FROM public.repetir_orden_op(%L,%L,%L)',
  (SELECT id FROM public.ordenes_produccion WHERE id_historico = 'cli08-origen'),
  '00000000-0000-4000-8000-0000000d0001', now() + interval '9 days'),
  '23514', 'orden_no_repetible', 'Una orden cancelada no se repite');

SELECT * FROM finish();
ROLLBACK;
