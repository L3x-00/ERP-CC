-- C31/A4: reasignación administrativa de la responsable de una partida.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000c31a4001', 'c31a4-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a4002', 'c31a4-op-viejo@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a4003', 'c31a4-op-nuevo@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a4004', 'c31a4-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin A4'
WHERE id = '00000000-0000-4000-8000-0000c31a4001';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador Viejo'
WHERE id = '00000000-0000-4000-8000-0000c31a4002';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador Nuevo'
WHERE id = '00000000-0000-4000-8000-0000c31a4003';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor A4'
WHERE id = '00000000-0000-4000-8000-0000c31a4004';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000c31a4005', 'Cliente C31A4 SA', 'C31A4', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000c31a4006', 'OP-993311', '00000000-0000-4000-8000-0000c31a4005', 'en_proceso', current_date + 10);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4006',
  'C31A4-P1', 'Pieza a reasignar', 5, 'pieza', ARRAY['LASER_FIBRA'],
  '00000000-0000-4000-8000-0000c31a4002');
INSERT INTO public.reclamos_proceso_operador (
  id, orden_id, partida_id, operador_id, fecha, turno, horas_estimadas, estado
) VALUES (
  '00000000-0000-4000-8000-0000c31a4008', '00000000-0000-4000-8000-0000c31a4006',
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4002',
  current_date, 'matutino', 4, 'activo');

SELECT ok(has_function_privilege('service_role',
  'public.reasignar_partida_operador(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'service_role puede reasignar');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.reasignar_partida_operador(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no puede invocar la RPC');

CREATE TEMP TABLE resultado_a4 AS
SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4003',
  '00000000-0000-4000-8000-0000c31a4001',
  '00000000-0000-4000-8000-0000c31a4c01'::uuid) AS json;

SELECT is((SELECT json->>'operador_asignado_id' FROM resultado_a4),
  '00000000-0000-4000-8000-0000c31a4003', 'La partida queda asignada al operador nuevo');
SELECT is((SELECT operador_asignado_id FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000c31a4007'),
  '00000000-0000-4000-8000-0000c31a4003', 'La asignación persiste en la tabla');
SELECT is((SELECT estado FROM public.reclamos_proceso_operador
  WHERE id = '00000000-0000-4000-8000-0000c31a4008'), 'liberado',
  'El reclamo anterior se cierra');
SELECT is((SELECT json->>'operador_nombre' FROM resultado_a4), 'Operador Nuevo',
  'El resultado nombra al nuevo responsable');
SELECT ok(EXISTS(
  SELECT 1 FROM public.orden_eventos_cambio
  WHERE orden_id = '00000000-0000-4000-8000-0000c31a4006'
    AND tipo = 'reasignacion_operador_partida'),
  'La reasignación deja auditoría');

CREATE TEMP TABLE resultado_replay AS
SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4003',
  '00000000-0000-4000-8000-0000c31a4001',
  '00000000-0000-4000-8000-0000c31a4c01'::uuid) AS json;
SELECT is((SELECT json->>'ya_aplicado' FROM resultado_replay), 'true',
  'El replay con el mismo correlation es idempotente');
SELECT is((SELECT count(*)::int FROM public.orden_eventos_cambio
  WHERE orden_id = '00000000-0000-4000-8000-0000c31a4006'
    AND tipo = 'reasignacion_operador_partida'), 1,
  'El replay no duplica la auditoría');

SELECT throws_ok($$SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4003',
  '00000000-0000-4000-8000-0000c31a4004', '00000000-0000-4000-8000-0000c31a4c02'::uuid)$$,
  '42501', 'sin_permiso_reasignar', 'Un vendedor no puede reasignar');
SELECT throws_ok($$SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4004',
  '00000000-0000-4000-8000-0000c31a4001', '00000000-0000-4000-8000-0000c31a4c03'::uuid)$$,
  '23514', 'operador_no_activo', 'El nuevo responsable debe ser operador activo');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000c31a400b', 'C31A4-R1', 'Recurso A4', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000c31a400a', '00000000-0000-4000-8000-0000c31a4006',
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a400b', 1, 'en_proceso',
  current_date, 'matutino', 4, NULL);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio,
  estado_sesion, horas_netas, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-0000c31a4009', '00000000-0000-4000-8000-0000c31a4006',
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a400a',
  '00000000-0000-4000-8000-0000c31a4003',
  now(), 'activa', 0, 0);
SELECT throws_ok($$SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4007', '00000000-0000-4000-8000-0000c31a4003',
  '00000000-0000-4000-8000-0000c31a4001', '00000000-0000-4000-8000-0000c31a4c04'::uuid)$$,
  '23514', 'partida_con_sesion_activa', 'No se reasigna una partida con sesión en curso');

SELECT throws_ok($$SELECT public.reasignar_partida_operador(
  '00000000-0000-4000-8000-0000c31a4fff', '00000000-0000-4000-8000-0000c31a4003',
  '00000000-0000-4000-8000-0000c31a4001', '00000000-0000-4000-8000-0000c31a4c05'::uuid)$$,
  'P0002', 'partida_inexistente', 'La partida debe existir');

SELECT * FROM finish();
ROLLBACK;
