-- C9.2 / P12 — candado de recurso único y compromiso comercial inmutable al
-- programar y reprogramar desde Planeación.
--
-- Cubre: (a) una segunda preparación del mismo recurso falla con
-- `recurso_ocupado` y el índice parcial impide dos `en_preparacion`/`en_proceso`;
-- (b) reprogramar cambia recurso/fecha/turno, deja evento de negocio y no toca
-- `fecha_compromiso_comercial`, `fecha_operativa`, `snapshot_json` ni el ruteo
-- (`procesos`, `tiempo_estimado_minutos`) de la partida.
-- (c) la compatibilidad por grupo de equipo (P-04, respuesta 2026-10-15): la RPC
-- rechaza el recurso de otro grupo con `recurso_incompatible`, «sin dato» nunca
-- bloquea y máquinas distintas del mismo grupo sí conviven en simultáneo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(31);

-- Actor con permiso de planeación para la ruta auditada (igual que la app).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c9201', 'c92-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c9201';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c9210', 'Cliente C92', 'Cliente C92 SA de CV');

-- Orden con compromiso comercial, fecha operativa y snapshot ya firmados: la
-- replanificación no puede tocarlos. Sin propuesta_revision_id el trigger C4.2
-- deja fijar los valores a mano.
INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, fecha_compromiso,
  fecha_compromiso_comercial, fecha_operativa, snapshot_json
) VALUES (
  '00000000-0000-4000-8000-0000000c9220', 'OP-993220',
  '00000000-0000-4000-8000-0000000c9210', 'en_proceso', current_date + 10,
  (current_date + 10)::date, (current_date + 12)::timestamptz,
  '{"fecha_compromiso_comercial": "2026-10-01"}'::jsonb
);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c9230', '00000000-0000-4000-8000-0000000c9220',
   'C92-P1', 5, 'pieza', ARRAY['Corte'], 90),
  ('00000000-0000-4000-8000-0000000c9231', '00000000-0000-4000-8000-0000000c9220',
   'C92-P2', 5, 'pieza', ARRAY['Doblado'], 120);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo) VALUES
  ('00000000-0000-4000-8000-0000000c9241', 'C92-R1', 'taller', 'Recurso C92 1', true),
  ('00000000-0000-4000-8000-0000000c9242', 'C92-R2', 'taller', 'Recurso C92 2', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c9241', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9242', 'vespertino', 8);

-- Fixtures P-04 (respuesta del cliente 2026-10-15: «impedir»): grupos de equipo,
-- un proceso del ruteo con grupo y recursos dentro, fuera y sin grupo.
INSERT INTO public.grupos_equipo (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c9250', 'C92-GRUPO-A', 'Grupo C92 A'),
  ('00000000-0000-4000-8000-0000000c9251', 'C92-GRUPO-B', 'Grupo C92 B');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id) VALUES
  ('C92CORTE', 'Corte C92', 'ZCY', '00000000-0000-4000-8000-0000000c9250');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c9232', '00000000-0000-4000-8000-0000000c9220',
   'C92-P3', 2, 'pieza', ARRAY['C92CORTE'], 60),
  ('00000000-0000-4000-8000-0000000c9233', '00000000-0000-4000-8000-0000000c9220',
   'C92-P4', 2, 'pieza', ARRAY['C92-SIN-CATALOGO'], 60),
  ('00000000-0000-4000-8000-0000000c9234', '00000000-0000-4000-8000-0000000c9220',
   'C92-P5', 2, 'pieza', ARRAY['C92-SIN-CATALOGO'], 60),
  ('00000000-0000-4000-8000-0000000c9235', '00000000-0000-4000-8000-0000000c9220',
   'C92-P6', 2, 'pieza', ARRAY['C92CORTE'], 60);
UPDATE public.partidas_orden_produccion
SET maquina_asignada = 'C92-R4'
WHERE id = '00000000-0000-4000-8000-0000000c9234';
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo, grupo_equipo_id) VALUES
  ('00000000-0000-4000-8000-0000000c9243', 'C92-R3', 'taller', 'Recurso C92 3 (grupo A)', true,
   '00000000-0000-4000-8000-0000000c9250'),
  ('00000000-0000-4000-8000-0000000c9244', 'C92-R4', 'taller', 'Recurso C92 4 (grupo B)', true,
   '00000000-0000-4000-8000-0000000c9251'),
  ('00000000-0000-4000-8000-0000000c9245', 'C92-R5', 'taller', 'Recurso C92 5 (grupo A)', true,
   '00000000-0000-4000-8000-0000000c9250');
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c9243', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9244', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9245', 'matutino', 8);

-- Desde aquí se corre como `service_role` (el rol con el que escribe la app):
-- valida los GRANT de las RPC _auditada y que el candado y la inmutabilidad se
-- comporten igual sin superusuario.
SET LOCAL ROLE service_role;

-- 1. Programación inicial de la partida P1 por su operación del ruteo.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9230',
  '00000000-0000-4000-8000-0000000c9241', NULL::smallint, current_date, 'matutino', 3, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9230' AND secuencia = 1))$$,
  'La programación inicial se registra por la ruta auditada');

-- 2-4. Programar no toca el compromiso comercial, la fecha operativa ni el snapshot.
SELECT is((
  SELECT fecha_compromiso_comercial FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), (current_date + 10)::date, 'Programar no toca el compromiso comercial');
SELECT is((
  SELECT fecha_operativa FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), (current_date + 12)::timestamptz, 'Programar no toca la fecha operativa');
SELECT is((
  SELECT snapshot_json->>'fecha_compromiso_comercial' FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), '2026-10-01', 'Programar no toca el snapshot firmado');

-- 5-6. Programar tampoco toca el ruteo ni el tiempo estimado de la partida.
SELECT is((
  SELECT procesos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9230'
), ARRAY['Corte'], 'Programar no toca el ruteo de la partida');
SELECT is((
  SELECT tiempo_estimado_minutos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9230'
), 90::numeric, 'Programar no toca el tiempo estimado');

-- 7. Reprogramación a otro recurso, fecha y turno por la ruta auditada.
SELECT lives_ok($$SELECT * FROM public.reprogramar_partida_recurso_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'),
  '00000000-0000-4000-8000-0000000c9242', current_date + 3, 'vespertino', 5, 2,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'),
  'Reajuste por capacidad', '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  'La reprogramación cambia recurso, fecha y turno');

-- 8. El cambio quedó persistido en la fila.
SELECT is((
  SELECT (recurso_id, fecha_programada, turno)::text FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'
), (
  '00000000-0000-4000-8000-0000000c9242', current_date + 3, 'vespertino'
)::text, 'La fila conserva el nuevo recurso, fecha y turno');

-- 9. La reprogramación deja evento de negocio en la orden.
SELECT ok(exists(
  SELECT 1 FROM public.orden_eventos_cambio AS evento
  WHERE evento.orden_id = '00000000-0000-4000-8000-0000000c9220'
    AND evento.tipo = 'reprogramacion_operativa'
), 'La reprogramación deja evento de negocio en la orden');

-- 10-14. Reprogramar tampoco toca el compromiso comercial ni el ruteo.
SELECT is((
  SELECT fecha_compromiso_comercial FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), (current_date + 10)::date, 'Reprogramar no toca el compromiso comercial');
SELECT is((
  SELECT fecha_operativa FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), (current_date + 12)::timestamptz, 'Reprogramar no toca la fecha operativa');
SELECT is((
  SELECT snapshot_json FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9220'
), '{"fecha_compromiso_comercial": "2026-10-01"}'::jsonb,
  'Reprogramar no toca el snapshot firmado');
SELECT is((
  SELECT procesos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9230'
), ARRAY['Corte'], 'Reprogramar no toca el ruteo de la partida');
SELECT is((
  SELECT tiempo_estimado_minutos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c9230'
), 90::numeric, 'Reprogramar no toca el tiempo estimado');

-- 15. La segunda partida se programa en el mismo recurso y turno (8 h justas).
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9231',
  '00000000-0000-4000-8000-0000000c9242', NULL::smallint, current_date + 3, 'vespertino', 3, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9231' AND secuencia = 1))$$,
  'La segunda partida también se programa en el recurso compartido');

-- 16-17. La preparación de P1 se activa y P1 queda en preparación.
SELECT lives_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'))$$,
  'La primera preparación del recurso se activa');
SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9230'
), 'en_preparacion', 'La programación queda en preparación');

-- 18. La segunda preparación del mismo recurso se rechaza por el candado.
SELECT throws_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9231'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9231'))$$,
  '23505', 'recurso_ocupado',
  'El mismo recurso no admite una segunda preparación simultánea');

-- 19-20. El índice parcial respalda el candado ante escrituras directas.
SELECT throws_ok($$UPDATE public.programacion_areas
  SET estado_planeacion = 'en_preparacion'
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9231'$$,
  '23505',
  'duplicate key value violates unique constraint "idx_programacion_areas_candado_recurso_activo"',
  'El índice impide dos en_preparacion en el mismo recurso');
SELECT throws_ok($$UPDATE public.programacion_areas
  SET estado_planeacion = 'en_proceso'
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9231'$$,
  '23505',
  'duplicate key value violates unique constraint "idx_programacion_areas_candado_recurso_activo"',
  'El índice cubre también en_proceso');

-- 21. La segunda programación queda intacta tras los rechazos.
SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9231'
), 'programada', 'La segunda programación queda intacta tras los rechazos');

-- 22. P-04 (impedir): un recurso de otro grupo no se programa.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9232',
  '00000000-0000-4000-8000-0000000c9244', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  '23514', 'recurso_incompatible',
  'P-04: un recurso de otro grupo no se puede programar');

-- 23. Un recurso del grupo que pide el ruteo sí se programa.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9232',
  '00000000-0000-4000-8000-0000000c9243', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  'P-04: un recurso del grupo del ruteo sí se programa');

-- 24. Reprogramar hacia otro grupo también se rechaza (antes de tomar el recurso).
SELECT throws_ok($$SELECT * FROM public.reprogramar_partida_recurso_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9232'),
  '00000000-0000-4000-8000-0000000c9244', current_date + 1, 'matutino', 2, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9232'),
  'Prueba de bloqueo por grupo', '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  '23514', 'recurso_incompatible',
  'P-04: la reprogramación tampoco admite otro grupo');

-- 25. Máquinas distintas del mismo grupo sí se programan.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9235',
  '00000000-0000-4000-8000-0000000c9245', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  'P-04: otra máquina del mismo grupo también se programa');

-- 26-28. Las dos máquinas del grupo A quedan en preparación a la vez.
SELECT lives_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9232'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9232'))$$,
  'La primera máquina del grupo pasa a preparación');
SELECT lives_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9235'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9235'))$$,
  'La segunda máquina del mismo grupo también pasa a preparación');
SELECT is((
  SELECT count(*) FROM public.programacion_areas
  WHERE partida_id IN (
    '00000000-0000-4000-8000-0000000c9232',
    '00000000-0000-4000-8000-0000000c9235'
  ) AND estado_planeacion = 'en_preparacion'
), 2::bigint, 'El candado por recurso permite dos máquinas del mismo grupo en simultáneo');

-- 29. Sin grupos resueltos (ruteo y estación sin datos) nada se bloquea.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9233',
  '00000000-0000-4000-8000-0000000c9244', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  'P-04: sin datos de grupo no se bloquea');

-- 30-31. Respaldo por «Equipo / estación» del desglose (maquina_asignada).
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9234',
  '00000000-0000-4000-8000-0000000c9243', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  '23514', 'recurso_incompatible',
  'P-04: la estación del desglose también ancla el grupo');
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9220', '00000000-0000-4000-8000-0000000c9234',
  '00000000-0000-4000-8000-0000000c9244', 1::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9201', NULL::uuid)$$,
  'P-04: la estación compatible sí se programa');

SELECT * FROM finish();
ROLLBACK;
