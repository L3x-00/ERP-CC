-- C20 - Hora real de finalización y actualización de avance de la pausa automática.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-4000-8000-0000000c2001', 'c20-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000c2002', 'c20-otro@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id IN ('00000000-0000-4000-8000-0000000c2001', '00000000-0000-4000-8000-0000000c2002');

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2003', 'Cliente C20', 'Cliente C20 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2004', 'OP-993401',
  '00000000-0000-4000-8000-0000000c2003', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c2005', '00000000-0000-4000-8000-0000000c2004',
   'C20-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c2001');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c2007', 'C20-R1', 'taller', 'Recurso C20', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c2007', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c2011', '00000000-0000-4000-8000-0000000c2004',
   '00000000-0000-4000-8000-0000000c2005', '00000000-0000-4000-8000-0000000c2007',
   1, 'en_preparacion', date_trunc('week', current_date)::date, 'matutino', 2);

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c2004'::uuid, '00000000-0000-4000-8000-0000000c2005'::uuid,
  '00000000-0000-4000-8000-0000000c2011'::uuid, '00000000-0000-4000-8000-0000000c2001'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$, 'El operador inicia la sesión');

UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '12 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c2001';

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c2001')
), 1, 'La pausa automática encuentra la sesión vencida');

SELECT ok((
  SELECT pendiente_actualizacion_avance FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001'
), 'La pausa automática queda marcada como pendiente de actualizar avance');

SELECT is((
  SELECT tiempo_real_minutos FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c2005'
), 540::numeric, 'La pausa contabiliza el tiempo de la jornada en la partida');

-- La corrección con 5 h declaradas adelanta 5 h la hora real de término.
SELECT lives_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2001' AND estado_sesion = 'pausada'),
  '00000000-0000-4000-8000-0000000c2001'::uuid, 5, 5, 'Terminé 5 h antes')$$,
  'El operador declara piezas y horas reales');

SELECT is((
  SELECT piezas_producidas FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001'
), 5::numeric, 'Las piezas declaradas quedan en la sesión pausada');

SELECT ok(NOT (
  SELECT pendiente_actualizacion_avance FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001'
), 'La bandera pendiente se limpia tras la corrección');

SELECT ok((
  SELECT horas_netas > 0 AND horas_netas < 9
  FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001'
), 'Las horas se recalculan hasta la hora real derivada');

SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = (
    SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2001')
), 1, 'El avance se registra una sola vez para la sesión');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001'
), 'pausada', 'Si la meta no se completa, la sesión sigue pausada y reanudable');

SELECT throws_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2001' AND estado_sesion = 'pausada'),
  '00000000-0000-4000-8000-0000000c2001'::uuid, 5, 1)$$,
  '23514', 'sesion_no_pendiente_avance',
  'Una pausa ya corregida no se puede volver a corregir');

SELECT throws_ok($$SELECT * FROM public.registrar_hora_fin_sesion(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2001' AND estado_sesion = 'pausada'),
  '00000000-0000-4000-8000-0000000c2002'::uuid, now())$$,
  '23514', 'sesion_no_activa',
  'La hora de fin solo aplica a sesiones activas del dueño');

SELECT lives_ok($$SELECT * FROM public.reanudar_sesion_trabajo_a20(
  '00000000-0000-4000-8000-0000000c2004'::uuid, '00000000-0000-4000-8000-0000000c2005'::uuid,
  '00000000-0000-4000-8000-0000000c2011'::uuid,
  (SELECT actualizado_en FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c2011'),
  '00000000-0000-4000-8000-0000000c2001'::uuid)$$,
  'La pausa corregida se puede reanudar');

SELECT lives_ok($$SELECT public.registrar_hora_fin_sesion(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2001' AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c2001'::uuid, now())$$,
  'El operador declara la hora real de finalización antes de cerrar');

SELECT ok((
  SELECT fecha_fin_declarada IS NOT NULL
  FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2001' AND estado_sesion = 'activa'
), 'La hora declarada queda guardada para que el cierre la consuma');

SELECT * FROM finish();
ROLLBACK;
