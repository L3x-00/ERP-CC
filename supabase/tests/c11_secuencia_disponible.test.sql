-- C11 - Secuencia de procesos con disponibilidad parcial.
-- Verifica que una operación solo arranca cuando el proceso anterior terminó
-- alguna pieza, que puede avanzar por lotes aunque el anterior siga en curso y
-- que el cierre no declara más piezas de las disponibles.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c1101', 'c11-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1101';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1102', 'Cliente C11', 'Cliente C11 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1103', 'OP-993200',
  '00000000-0000-4000-8000-0000000c1102', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1103',
   'C11-P1', 1000, 'pieza', ARRAY['Corte', 'Doblado'],
   '00000000-0000-4000-8000-0000000c1101'),
  ('00000000-0000-4000-8000-0000000c1105', '00000000-0000-4000-8000-0000000c1103',
   'C11-P2', 10, 'pieza', ARRAY['Corte', 'Doblado'],
   '00000000-0000-4000-8000-0000000c1101');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c1106', 'C11-R1', 'taller', 'Recurso C11', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c1106', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1121', '00000000-0000-4000-8000-0000000c1103',
   '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1106',
   1, 'programada', current_date, 'matutino', 2,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 1)),
  ('00000000-0000-4000-8000-0000000c1122', '00000000-0000-4000-8000-0000000c1103',
   '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1106',
   2, 'en_preparacion', current_date, 'matutino', 2,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2));

-- 1-2. Disponibilidad derivada del hecho real, no del estado de planeación.
SELECT is(privado.piezas_disponibles_proceso((
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 1
)), NULL::numeric, 'La primera operación no depende de piezas previas');

SELECT is(privado.piezas_disponibles_proceso((
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2
)), 0::numeric, 'Sin piezas cortadas el doblado no tiene disponibilidad');

-- 3-4. Ambas firmas de inicio rechazan antes de producir la primera pieza.
SELECT throws_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1103', '00000000-0000-4000-8000-0000000c1104',
  '00000000-0000-4000-8000-0000000c1122', '00000000-0000-4000-8000-0000000c1101',
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  '23514', 'proceso_previo_sin_piezas',
  'La firma con checklist no inicia doblado sin piezas cortadas');

SELECT throws_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1103'::uuid, '00000000-0000-4000-8000-0000000c1104'::uuid,
  '00000000-0000-4000-8000-0000000c1122'::uuid, '00000000-0000-4000-8000-0000000c1101'::uuid)$$,
  '23514', 'proceso_previo_sin_piezas',
  'La llamada de 4 argumentos (reanudación) también se bloquea sin piezas previas');

-- 5. Con 100 de 1000 cortadas ya se puede empezar a doblar.
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1101', 100,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 1)
);
SELECT is(privado.piezas_disponibles_proceso((
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2
)), 100::numeric, 'El doblado ve las 100 piezas ya cortadas');

-- 6-7. La operación arranca aunque la meta de corte siga en curso.
SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1103'::uuid, '00000000-0000-4000-8000-0000000c1104'::uuid,
  '00000000-0000-4000-8000-0000000c1122'::uuid, '00000000-0000-4000-8000-0000000c1101'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'Doblar arranca con el lote parcial ya cortado');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1122'
  ORDER BY creado_en DESC LIMIT 1
), 'activa', 'La sesión de doblado queda activa');

-- 8. No se pueden declarar más piezas de las que el corte ya terminó.
SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1122'
   ORDER BY creado_en DESC LIMIT 1),
  '00000000-0000-4000-8000-0000000c1101', 150, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2))$$,
  '23514', 'cantidad_excede_disponible_proceso',
  'El cierre rechaza doblar piezas que el corte todavía no terminó');

-- 9-11. El cierre parcial queda registrado y la operación sigue programada.
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1122'
   ORDER BY creado_en DESC LIMIT 1),
  '00000000-0000-4000-8000-0000000c1101', 100, 'finalizada', NULL, NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2))$$,
  'El cierre consume exactamente las 100 piezas disponibles');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1122'
), 'programada', 'Un avance parcial no completa la operación de doblado');

SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = (
    SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2
  )
), 100::numeric, 'El avance del doblado queda en su propia meta');

-- 12. Al consumirse el lote, la disponibilidad vuelve a cero.
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1101', 50,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 1)
);
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1101', 50,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2)
);
SELECT is(privado.piezas_disponibles_proceso((
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1104' AND secuencia = 2
)), 0::numeric, 'La disponibilidad descuenta lo ya consumido por el doblado');

-- 13-14. Una sesión pausada se puede reanudar aunque el lote esté consumido.
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, verificacion_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000c1132', '00000000-0000-4000-8000-0000000c1103',
  '00000000-0000-4000-8000-0000000c1104', '00000000-0000-4000-8000-0000000c1122',
  '00000000-0000-4000-8000-0000000c1101', 'pausada',
  now() - interval '1 hour', now() - interval '30 minutes',
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo')
);
UPDATE public.programacion_areas SET estado_planeacion = 'en_preparacion'
WHERE id = '00000000-0000-4000-8000-0000000c1122';

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1103'::uuid, '00000000-0000-4000-8000-0000000c1104'::uuid,
  '00000000-0000-4000-8000-0000000c1122'::uuid, '00000000-0000-4000-8000-0000000c1101'::uuid)$$,
  'Reanudar una sesión pausada no exige piezas nuevas');

SELECT is((
  SELECT count(*)::integer FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1122'
    AND estado_sesion = 'activa'
), 1, 'La reanudación deja una única sesión activa');

-- 15. El avance global de piso también respeta la secuencia.
SELECT throws_ok($$SELECT public.registrar_avance_partida_op(
  '00000000-0000-4000-8000-0000000c1105', '00000000-0000-4000-8000-0000000c1101', 5, 0)$$,
  '23514', 'cantidad_excede_disponible_proceso',
  'El avance global no puede saltarse el proceso previo');

-- 16. La función de disponibilidad es interna.
SELECT ok(NOT has_function_privilege('authenticated',
  'privado.piezas_disponibles_proceso(uuid)', 'EXECUTE'),
  'Un JWT no consulta la disponibilidad interna');

SELECT * FROM finish();
ROLLBACK;
