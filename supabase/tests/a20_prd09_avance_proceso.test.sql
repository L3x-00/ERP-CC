BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(32);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000b0001', 'prd09-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000b0001';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000b0010', 'Cliente PRD-09', 'Cliente PRD-09 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000b0020', 'OP-993109',
  '00000000-0000-4000-8000-0000000b0010', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0020',
  'PRD09-P1', 10, 'pieza', ARRAY['Corte', 'Doblado'],
  '00000000-0000-4000-8000-0000000b0001'
);

-- Segunda orden y partida para comprobar la atribución automática y el camino
-- histórico sin metas (las metas se eliminan explícitamente más abajo).
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000000b0070', 'OP-993110',
   '00000000-0000-4000-8000-0000000b0010', 'borrador', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b00a0', 'OP-993111',
   '00000000-0000-4000-8000-0000000b0010', 'en_proceso', now() + interval '10 days');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000b0080', '00000000-0000-4000-8000-0000000b0070',
   'PRD09-P2', 3, 'pieza', '00000000-0000-4000-8000-0000000b0001'),
  ('00000000-0000-4000-8000-0000000b0090', '00000000-0000-4000-8000-0000000b00a0',
   'PRD09-P3', 5, 'pieza', '00000000-0000-4000-8000-0000000b0001');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES
  ('00000000-0000-4000-8000-0000000b0041', 'PRD09-REC-1', 'taller', 'Recurso PRD-09 1', true),
  ('00000000-0000-4000-8000-0000000b0042', 'PRD09-REC-2', 'taller', 'Recurso PRD-09 2', true),
  ('00000000-0000-4000-8000-0000000b0043', 'PRD09-REC-3', 'taller', 'Recurso PRD-09 3', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES
  ('00000000-0000-4000-8000-0000000b0041', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000b0042', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000b0043', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000b0051', '00000000-0000-4000-8000-0000000b0020',
   '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0041',
   1, 'en_proceso', current_date, 'matutino', 2),
  ('00000000-0000-4000-8000-0000000b0052', '00000000-0000-4000-8000-0000000b0020',
   '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0042',
   2, 'en_proceso', current_date, 'matutino', 2),
  ('00000000-0000-4000-8000-0000000b0053', '00000000-0000-4000-8000-0000000b0020',
   '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0043',
   3, 'en_proceso', current_date, 'matutino', 2);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000b0061', '00000000-0000-4000-8000-0000000b0020',
  '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0051',
  '00000000-0000-4000-8000-0000000b0001', 'activa', now() - interval '1 hour'
);

SELECT ok(EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'registros_avance_partida'
    AND column_name = 'meta_proceso_id'
), 'El avance registra la meta de proceso trabajada');

INSERT INTO public.registros_avance_partida (partida_id, operador_id, cantidad_producida)
VALUES ('00000000-0000-4000-8000-0000000b0080', '00000000-0000-4000-8000-0000000b0001', 1);
SELECT is((
  SELECT meta.nombre FROM public.registros_avance_partida AS avance
  JOIN public.metas_proceso_partida AS meta ON meta.id = avance.meta_proceso_id
  WHERE avance.partida_id = '00000000-0000-4000-8000-0000000b0080'
), 'Fabricación', 'La vía global atribuye el avance a la meta final');

DELETE FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000b0090';
INSERT INTO public.registros_avance_partida (partida_id, operador_id, cantidad_producida)
VALUES ('00000000-0000-4000-8000-0000000b0090', '00000000-0000-4000-8000-0000000b0001', 1);
SELECT ok((
  SELECT avance.meta_proceso_id IS NULL FROM public.registros_avance_partida AS avance
  WHERE avance.partida_id = '00000000-0000-4000-8000-0000000b0090'
), 'El trabajo histórico sin metas conserva su avance global');

SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0061', '00000000-0000-4000-8000-0000000b0001',
  4, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0080'))$$,
  '23514', 'meta_proceso_no_corresponde',
  'Una meta de otra partida se rechaza sin escribir');
SELECT is((SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000b0061'), 'activa',
  'El rechazo de meta conserva la sesión activa');

SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0061', '00000000-0000-4000-8000-0000000b0001',
  4, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1))$$,
  'La operación intermedia acumula aunque no sea la última secuencia programada');
SELECT is((SELECT cantidad_producida FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = '00000000-0000-4000-8000-0000000b0061'), 4::numeric,
  'La sesión deja un único registro por la cantidad informada');
SELECT ok((
  SELECT avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1
  ) FROM public.registros_avance_partida AS avance
  WHERE avance.sesion_trabajo_id = '00000000-0000-4000-8000-0000000b0061'
), 'El registro queda asociado a la pareja partida×proceso elegida');
SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b0030'), 0::numeric,
  'Contar operaciones intermedias no infla las piezas físicas');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b0020'), 'en_proceso',
  'La orden sigue en proceso con metas pendientes');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000b0062', '00000000-0000-4000-8000-0000000b0020',
  '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0052',
  '00000000-0000-4000-8000-0000000b0001', 'activa', now() - interval '1 hour'
);
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0062', '00000000-0000-4000-8000-0000000b0001',
  6, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1))$$,
  'Una segunda sesión completa la meta del mismo proceso');
SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1
  )
), 10::numeric, 'El acumulado por proceso suma sesiones sin duplicar');
SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1
  )
), 2, 'Cada sesión conserva exactamente un registro');

SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0061', '00000000-0000-4000-8000-0000000b0001',
  4, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1))$$,
  '23514', 'programacion_no_en_proceso', 'Reintentar una sesión cerrada no vuelve a sumar');
SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 1
  )
), 10::numeric, 'El acumulado permanece tras el reintento rechazado');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000b0063', '00000000-0000-4000-8000-0000000b0020',
  '00000000-0000-4000-8000-0000000b0030', '00000000-0000-4000-8000-0000000b0053',
  '00000000-0000-4000-8000-0000000b0001', 'activa', now() - interval '1 hour'
);
SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0063', '00000000-0000-4000-8000-0000000b0001',
  11, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 2))$$,
  '23514', 'cantidad_excede_meta_proceso',
  'La meta del proceso limita la cantidad aunque la física tuviera margen');
SELECT is((SELECT count(*)::integer FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = '00000000-0000-4000-8000-0000000b0063'), 0,
  'El exceso por proceso no deja ningún registro');
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000b0063', '00000000-0000-4000-8000-0000000b0001',
  10, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 2))$$,
  'La operación final cierra la última meta pendiente');
SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b0030'), 10::numeric,
  'Solo la meta final entrega las piezas físicas de la partida');
SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000b0030' AND secuencia = 2
  )
), 10::numeric, 'La meta final también acumula por proceso');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b0020'), 'completada',
  'La orden se completa cuando todas las metas llegaron');
SELECT ok(privado.partida_produccion_completa('00000000-0000-4000-8000-0000000b0030'),
  'La partida con todas sus metas cumplidas se considera completa');

SELECT lives_ok($$SELECT * FROM public.registrar_avance_partida_op(
  '00000000-0000-4000-8000-0000000b0090', '00000000-0000-4000-8000-0000000b0001', 5, 0)$$,
  'El camino histórico sin metas registra piezas globales por su vía prevista');
SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b0090'), 5::numeric,
  'Sin metas el avance global conserva su acumulación');
SELECT ok((
  SELECT avance.meta_proceso_id IS NULL FROM public.registros_avance_partida AS avance
  WHERE avance.partida_id = '00000000-0000-4000-8000-0000000b0090'
    AND avance.cantidad_producida = 5
), 'El registro histórico permanece sin meta inventada');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000b00a0'), 'completada',
  'Sin metas la orden se completa por su comparación física de siempre');

SELECT is((SELECT horas_brutas FROM privado.calcular_horas_sesion_trabajo(
  '2026-09-25 08:00:00-07'::timestamptz, '2026-09-25 17:00:00-07'::timestamptz
)), 9::numeric, 'Ocho a diecisiete son nueve horas brutas');
SELECT is((SELECT horas_netas FROM privado.calcular_horas_sesion_trabajo(
  '2026-09-25 08:00:00-07'::timestamptz, '2026-09-25 17:00:00-07'::timestamptz
)), 8::numeric, 'Ocho a diecisiete son ocho horas netas tras comida');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.cerrar_sesion_trabajo_operador(uuid,uuid,numeric,text,text,text,uuid)', 'EXECUTE'),
  'Un JWT no ejecuta el cierre privilegiado con meta');
SELECT ok(NOT has_function_privilege('anon',
  'public.cerrar_sesion_trabajo_operador(uuid,uuid,numeric,text,text,text,uuid)', 'EXECUTE'),
  'Un visitante tampoco ejecuta el cierre');
SELECT ok(has_function_privilege('service_role',
  'public.cerrar_sesion_trabajo_operador(uuid,uuid,numeric,text,text,text,uuid)', 'EXECUTE'),
  'El servidor sí puede ejecutar el cierre con meta');
SELECT ok(NOT has_table_privilege('authenticated', 'public.registros_avance_partida', 'INSERT'),
  'Un JWT no inserta avances ni con meta de proceso');

SELECT * FROM finish();
ROLLBACK;
