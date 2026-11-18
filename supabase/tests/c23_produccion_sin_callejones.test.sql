-- C23: producción sin callejones sin salida.
-- Cubre la invariante de horas, el avance por delta, el descarte de sesiones
-- vacías, el cierre de pausas huérfanas y el diagnóstico de consistencia.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-4000-8000-000000c23001', 'c23-admin@prueba.local'),
  ('00000000-0000-4000-8000-000000c23002', 'c23-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-000000c23001';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-000000c23002';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-000000c23003', 'Cliente C23', 'Cliente C23 SA de CV');

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-000000c23004', 'C23-MAT', 'Lámina C23', 'kg', true);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-000000c23010', 'OP-994501',
   '00000000-0000-4000-8000-000000c23003', 'en_proceso', now() + interval '10 days'),
  ('00000000-0000-4000-8000-000000c23011', 'OP-994502',
   '00000000-0000-4000-8000-000000c23003', 'completada', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, cantidad_producida,
  unidad_medida, procesos, operador_asignado_id, tiempo_real_minutos
) VALUES
  ('00000000-0000-4000-8000-000000c23020', '00000000-0000-4000-8000-000000c23010',
   'C23-P1', 10, 3, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-000000c23002', 0),
  ('00000000-0000-4000-8000-000000c23021', '00000000-0000-4000-8000-000000c23010',
   'C23-P2', 10, 0, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-000000c23002', 0),
  ('00000000-0000-4000-8000-000000c23022', '00000000-0000-4000-8000-000000c23011',
   'C23-P3', 10, 10, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-000000c23002', 120);

UPDATE public.partidas_orden_produccion
SET catalogo_material_id = '00000000-0000-4000-8000-000000c23004'
WHERE id = '00000000-0000-4000-8000-000000c23021';

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-000000c23030', 'C23-R1', 'taller', 'Recurso C23', true);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-000000c23040', '00000000-0000-4000-8000-000000c23010',
   '00000000-0000-4000-8000-000000c23020', '00000000-0000-4000-8000-000000c23030',
   1, 'bloqueada', current_date, 'matutino', 2),
  ('00000000-0000-4000-8000-000000c23041', '00000000-0000-4000-8000-000000c23010',
   '00000000-0000-4000-8000-000000c23021', '00000000-0000-4000-8000-000000c23030',
   1, 'en_proceso', current_date, 'matutino', 2),
  ('00000000-0000-4000-8000-000000c23042', '00000000-0000-4000-8000-000000c23011',
   '00000000-0000-4000-8000-000000c23022', '00000000-0000-4000-8000-000000c23030',
   1, 'bloqueada', current_date, 'matutino', 2);

-- Pausa con 3 piezas ya declaradas sobre la partida (3 producidas).
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas, pendiente_actualizacion_avance
) VALUES (
  '00000000-0000-4000-8000-000000c23050', '00000000-0000-4000-8000-000000c23010',
  '00000000-0000-4000-8000-000000c23020', '00000000-0000-4000-8000-000000c23040',
  '00000000-0000-4000-8000-000000c23002', 'pausada',
  now() - interval '4 hours', now(), 2, 3, true
);

-- Pausa atrapada en una orden que ya terminó (para el cierre administrativo).
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas, pendiente_actualizacion_avance
) VALUES (
  '00000000-0000-4000-8000-000000c23054', '00000000-0000-4000-8000-000000c23011',
  '00000000-0000-4000-8000-000000c23022', '00000000-0000-4000-8000-000000c23042',
  '00000000-0000-4000-8000-000000c23002', 'pausada',
  now() - interval '3 hours', now(), 2, 10, false
);

-- -----------------------------------------------------------------------------
-- 1. Avance por delta: corregir de 3 a 5 no duplica ni suma 8.
-- -----------------------------------------------------------------------------
SELECT lives_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  '00000000-0000-4000-8000-000000c23050'::uuid,
  '00000000-0000-4000-8000-000000c23002'::uuid, 5, 2, 'Corrección de avance')$$,
  'La pausa se corrige con 5 piezas y 2 h reales');

SELECT is((
  SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-000000c23020'
), 5::numeric, 'La partida avanza solo por la diferencia (3 → 5), no a 8');

SELECT is((
  SELECT piezas_producidas FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-000000c23050'
), 5::numeric, 'La sesión conserva el total declarado (5)');

SELECT is((
  SELECT tiempo_real_minutos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-000000c23020'
), 120::numeric, 'Las horas reales se derivan de la sesión (2 h = 120 min)');

-- -----------------------------------------------------------------------------
-- 2. La invariante excluye las sesiones descartadas.
-- -----------------------------------------------------------------------------
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas, sesion_invalida
) VALUES (
  '00000000-0000-4000-8000-000000c23051', '00000000-0000-4000-8000-000000c23010',
  '00000000-0000-4000-8000-000000c23020', '00000000-0000-4000-8000-000000c23040',
  '00000000-0000-4000-8000-000000c23002', 'finalizada',
  now() - interval '6 hours', now() - interval '5 hours', 1, 0, true
);

SELECT is(
  privado.recalcular_tiempo_real_partida('00000000-0000-4000-8000-000000c23020'),
  120::numeric,
  'Una sesión inválida no suma minutos al tiempo real de la partida'
);

-- -----------------------------------------------------------------------------
-- 3. El trigger B2 permite descartar una sesión vacía pero exige consumo con piezas.
-- -----------------------------------------------------------------------------
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, horas_netas, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-000000c23052', '00000000-0000-4000-8000-000000c23010',
  '00000000-0000-4000-8000-000000c23021', '00000000-0000-4000-8000-000000c23041',
  '00000000-0000-4000-8000-000000c23002', 'activa', now(), 0, 0
);

SELECT lives_ok($$UPDATE public.sesiones_trabajo
  SET estado_sesion = 'finalizada', fecha_fin = now()
  WHERE id = '00000000-0000-4000-8000-000000c23052'$$,
  'Una sesión sin piezas se puede descartar aunque la partida exija material');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-000000c23053', '00000000-0000-4000-8000-000000c23010',
  '00000000-0000-4000-8000-000000c23021', '00000000-0000-4000-8000-000000c23041',
  '00000000-0000-4000-8000-000000c23002', 'pausada', now() - interval '1 hour', now(), 1, 4
);

SELECT throws_ok($$UPDATE public.sesiones_trabajo
  SET estado_sesion = 'finalizada'
  WHERE id = '00000000-0000-4000-8000-000000c23053'$$,
  '23514', 'consumo_material_requerido',
  'Una sesión con piezas sí exige consumo de material propio');

-- -----------------------------------------------------------------------------
-- 4. Cierre de pausa huérfana: solo en órdenes terminadas y sin tocar piezas.
-- -----------------------------------------------------------------------------
SELECT throws_ok($$SELECT * FROM public.cerrar_pausa_huerfana_administrativa(
  '00000000-0000-4000-8000-000000c23050'::uuid,
  '00000000-0000-4000-8000-000000c23001'::uuid, false)$$,
  '23514', 'orden_no_terminada',
  'Una pausa de una orden en proceso no se cierra como huérfana');

SELECT lives_ok($$SELECT * FROM public.cerrar_pausa_huerfana_administrativa(
  '00000000-0000-4000-8000-000000c23054'::uuid,
  '00000000-0000-4000-8000-000000c23001'::uuid, false, NULL,
  'Pausa creada al completar la orden')$$,
  'El administrador cierra la pausa de una orden terminada descartando el tiempo')
;

SELECT ok((
  SELECT sesion_invalida FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-000000c23054'
), 'La pausa descartada queda marcada como inválida');

SELECT is((
  SELECT horas_netas FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-000000c23054'
), 0::numeric, 'La pausa descartada no conserva horas');

SELECT is((
  SELECT tiempo_real_minutos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-000000c23022'
), 0::numeric, 'El tiempo real de la partida se recalcula sin la pausa descartada');

-- -----------------------------------------------------------------------------
-- 5. Diagnóstico: detecta horas desincronizadas y entrega pendiente.
-- -----------------------------------------------------------------------------
UPDATE public.partidas_orden_produccion
SET tiempo_real_minutos = 999
WHERE id = '00000000-0000-4000-8000-000000c23020';

SELECT ok(EXISTS (
  SELECT 1 FROM public.diagnostico_consistencia_orden(
    '00000000-0000-4000-8000-000000c23010') AS diagnostico
  WHERE diagnostico.codigo = 'tiempo_real_desincronizado'
), 'El diagnóstico detecta horas reales desincronizadas');

SELECT ok(EXISTS (
  SELECT 1 FROM public.diagnostico_consistencia_orden(
    '00000000-0000-4000-8000-000000c23011') AS diagnostico
  WHERE diagnostico.codigo = 'orden_completada_sin_entrega'
), 'El diagnóstico avisa que la orden terminó sin nota de entrega');

SELECT * FROM finish();
ROLLBACK;
