-- C20 - Cierre de riesgos: jornada acumulada por día y limpieza de hora declarada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c2021', 'c20-riesgos@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c2021';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2023', 'Cliente C20B', 'Cliente C20B SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2024', 'OP-993402',
  '00000000-0000-4000-8000-0000000c2023', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c2025', '00000000-0000-4000-8000-0000000c2024',
   'C20B-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c2021');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c2027', 'C20B-R1', 'taller', 'Recurso C20B', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c2027', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c2031', '00000000-0000-4000-8000-0000000c2024',
   '00000000-0000-4000-8000-0000000c2025', '00000000-0000-4000-8000-0000000c2027',
   1, 'en_preparacion', date_trunc('week', current_date)::date, 'matutino', 2);

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c2024'::uuid, '00000000-0000-4000-8000-0000000c2025'::uuid,
  '00000000-0000-4000-8000-0000000c2031'::uuid, '00000000-0000-4000-8000-0000000c2021'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$, 'El operador inicia la sesión');

-- La sesión se abre con más de una jornada de antigüedad. Se usa `now()` como
-- ancla (no medianoche del día) para que la prueba funcione también cuando se
-- ejecuta de madrugada. Si el ancla cae el día anterior, todas las sesiones y
-- todas las comprobaciones comparten esa misma fecha.
UPDATE public.sesiones_trabajo
SET fecha_inicio = now() - interval '10 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c2021';

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c2021')
), 1, 'La sesión del día se pausa automáticamente');

-- C23: la pausa automática corta al cumplir la jornada corrida (8 h de lunes a
-- viernes según C24), así que el día acumula esa jornada completa. El control de
-- horas extra del cierre posterior sigue disparándose al sumar la nueva sesión.
SELECT ok((
  SELECT privado.horas_netas_operador_dia(
    '00000000-0000-4000-8000-0000000c2021',
    (SELECT (fecha_inicio AT TIME ZONE 'America/Tijuana')::date
     FROM public.sesiones_trabajo
     WHERE operador_id = '00000000-0000-4000-8000-0000000c2021'
       AND estado_sesion = 'pausada' LIMIT 1)) >= 8
), 'La jornada del día ya acumula las horas de la sesión pausada');

SELECT lives_ok($$SELECT * FROM public.reanudar_sesion_trabajo_a20(
  '00000000-0000-4000-8000-0000000c2024'::uuid, '00000000-0000-4000-8000-0000000c2025'::uuid,
  '00000000-0000-4000-8000-0000000c2031'::uuid,
  (SELECT actualizado_en FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c2031'),
  '00000000-0000-4000-8000-0000000c2021'::uuid)$$,
  'El operador reanuda la operación el mismo día');

UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '10 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c2021';

SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c2021'::uuid, 0, 'finalizada')$$,
  '23514', 'horas_extra_sin_autorizacion',
  'Reanudar el mismo día no reinicia el control de horas extra');

INSERT INTO public.autorizaciones_hora_extra (
  orden_id, horas_autorizadas, motivo, autorizado_por, estado
) VALUES (
  '00000000-0000-4000-8000-0000000c2024', 12, 'Horas extra del turno',
  '00000000-0000-4000-8000-0000000c2021', 'VIGENTE'
);

SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c2021'::uuid, 0, 'finalizada')$$,
  'Con autorización que cubre el exceso del día sí se puede cerrar');

SELECT is((
  SELECT estado FROM public.autorizaciones_hora_extra
  WHERE orden_id = '00000000-0000-4000-8000-0000000c2024'
), 'USADA', 'La autorización del día se consume en el cierre');

SELECT is(has_function_privilege('authenticated',
  'public.limpiar_hora_fin_sesion(uuid,uuid)', 'execute'), false,
  'authenticated no puede limpiar la hora declarada');

UPDATE public.programacion_areas
SET estado_planeacion = 'en_preparacion'
WHERE id = '00000000-0000-4000-8000-0000000c2031';

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c2024'::uuid, '00000000-0000-4000-8000-0000000c2025'::uuid,
  '00000000-0000-4000-8000-0000000c2031'::uuid, '00000000-0000-4000-8000-0000000c2021'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'Se abre una sesión nueva para probar la hora declarada');

SELECT lives_ok($$SELECT public.registrar_hora_fin_sesion(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c2021'::uuid, now())$$,
  'El operador declara la hora real');

SELECT ok((
  SELECT fecha_fin_declarada IS NOT NULL FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'
), 'La hora declarada queda guardada');

SELECT lives_ok($$SELECT public.limpiar_hora_fin_sesion(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c2021'::uuid)$$,
  'Tras un cierre fallido se puede descartar la hora declarada');

SELECT ok((
  SELECT fecha_fin_declarada IS NULL FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2021' AND estado_sesion = 'activa'
), 'La hora declarada huérfana desaparece');

SELECT * FROM finish();
ROLLBACK;
