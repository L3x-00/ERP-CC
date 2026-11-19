-- C22 - Reprogramar una operación sin duplicarla en dos fechas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c2201', 'c22-planeacion@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c2201';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2202', 'Cliente C22', 'Cliente C22 SA de CV');

INSERT INTO public.grupos_equipo (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c2203', 'C22-LASER', 'Láser C22');

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id)
VALUES ('C22LASER', 'Láser C22', 'CZZ', '00000000-0000-4000-8000-0000000c2203');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2205', 'OP-993122',
  '00000000-0000-4000-8000-0000000c2202', 'en_proceso', current_date + 12);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c2206', '00000000-0000-4000-8000-0000000c2205',
   'C22-P1', 10, 'pieza', ARRAY['Láser C22'], 915);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo, grupo_equipo_id)
VALUES ('00000000-0000-4000-8000-0000000c2207', 'C22-LASER-01', 'taller', 'Láser C22 01', true,
  '00000000-0000-4000-8000-0000000c2203');
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c2207', 'matutino', 8);

CREATE TEMP TABLE c22_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c22_plan (clave, valor)
SELECT 'meta_1', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND secuencia = 1;
GRANT SELECT ON c22_plan TO service_role;

-- Fechas laborales fijas de la semana siguiente: el domingo no tiene capacidad
-- y las RPC de programación rechazan una fecha con capacidad 0.
CREATE TEMP TABLE c22_fechas (clave text PRIMARY KEY, valor date);
INSERT INTO c22_fechas VALUES
  ('lunes', date_trunc('week', current_date)::date + 7),
  ('martes', date_trunc('week', current_date)::date + 8),
  ('miercoles', date_trunc('week', current_date)::date + 9),
  ('jueves', date_trunc('week', current_date)::date + 10),
  ('viernes', date_trunc('week', current_date)::date + 11);
GRANT SELECT ON c22_fechas TO service_role;

SET LOCAL ROLE service_role;

-- 1. La operación se programa repartida en dos días (8 + 7.25 h).
SELECT lives_ok($$SELECT * FROM public.programar_operacion_multidia_auditada(
  '00000000-0000-4000-8000-0000000c2205', '00000000-0000-4000-8000-0000000c2206',
  '00000000-0000-4000-8000-0000000c2207', 'matutino',
  jsonb_build_array(
    jsonb_build_object('fecha', (SELECT valor FROM c22_fechas WHERE clave = 'lunes'), 'horas', 8),
    jsonb_build_object('fecha', (SELECT valor FROM c22_fechas WHERE clave = 'martes'), 'horas', 7.25)
  ),
  1, '00000000-0000-4000-8000-0000000c2201', NULL::uuid,
  (SELECT valor FROM c22_plan WHERE clave = 'meta_1'))$$,
  'La operación se programa en dos días');

SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c2206'
    AND estado_planeacion <> 'cancelada'
), 2, 'Antes de reprogramar hay fila principal y continuación');

-- 2. La reserva de un día adicional no se reprograma por separado.
SELECT throws_ok($$SELECT * FROM public.reprogramar_partida_recurso(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND es_continuacion = true),
  '00000000-0000-4000-8000-0000000c2207', (SELECT valor FROM c22_fechas WHERE clave = 'viernes'), 'matutino', 7.25, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND es_continuacion = true))$$,
  '23514', 'programacion_continuacion_no_operable',
  'La continuación no se mueve por su cuenta');

-- 3. Reprogramar la fila principal mueve la operación a otra fecha.
SELECT lives_ok($$SELECT * FROM public.reprogramar_partida_recurso(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND es_continuacion = false),
  '00000000-0000-4000-8000-0000000c2207', (SELECT valor FROM c22_fechas WHERE clave = 'miercoles'), 'matutino', 8, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND es_continuacion = false))$$,
  'La fila principal se reprograma');

-- 4-5. La operación queda una sola vez, en la fecha nueva.
SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c2206'
    AND estado_planeacion <> 'cancelada'
), 1, 'Solo queda una fila vigente para la operación');

SELECT is((
  SELECT fecha_programada FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c2206'
    AND estado_planeacion <> 'cancelada'
), (SELECT valor FROM c22_fechas WHERE clave = 'miercoles'), 'La fila vigente queda en la fecha reprogramada');

-- 6. Las reservas de días anteriores se cancelan, no se duplican.
SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c2206'
    AND es_continuacion = true
    AND estado_planeacion = 'cancelada'
), 1, 'La continuación anterior queda cancelada');

-- 7. La operación puede volver a repartirse después de reprogramarla: la
-- cancelación no deja el índice único bloqueado para la fecha nueva.
SELECT lives_ok($$SELECT * FROM public.reprogramar_partida_recurso(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND estado_planeacion <> 'cancelada'),
  '00000000-0000-4000-8000-0000000c2207', (SELECT valor FROM c22_fechas WHERE clave = 'jueves'), 'matutino', 8, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c2206' AND estado_planeacion <> 'cancelada'))$$,
  'La operación reprogramada se puede volver a mover');

-- 8-9. La RPC queda reservada al service_role.
RESET ROLE;
SELECT is(has_function_privilege('anon',
  'public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)',
  'execute'), false, 'anon no puede reprogramar');
SELECT is(has_function_privilege('service_role',
  'public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)',
  'execute'), true, 'service_role reprograma');

SELECT * FROM finish();
ROLLBACK;
