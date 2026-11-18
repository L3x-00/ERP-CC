-- C15 - Cerrar una pausa sin producir.
-- Verifica que una pausa vigente se puede finalizar sin declarar piezas,
-- conservando su corte, horas y motivo; que la operación vuelve al pool; y que
-- no se toca ninguna otra sesión ni proceso de la misma orden.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c1601', 'c15b-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1601';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1602', 'Cliente C15B', 'Cliente C15B SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1603', 'OP-993302',
  '00000000-0000-4000-8000-0000000c1602', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1604', '00000000-0000-4000-8000-0000000c1603',
   'C15B-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c1601'),
  ('00000000-0000-4000-8000-0000000c1605', '00000000-0000-4000-8000-0000000c1603',
   'C15B-P2', 20, 'pieza', ARRAY['Doblez'], '00000000-0000-4000-8000-0000000c1601');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES
  ('00000000-0000-4000-8000-0000000c1611', 'C15B-R1', 'taller', 'Recurso C15B 1', true),
  ('00000000-0000-4000-8000-0000000c1612', 'C15B-R2', 'taller', 'Recurso C15B 2', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES
  ('00000000-0000-4000-8000-0000000c1611', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c1612', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c1621', '00000000-0000-4000-8000-0000000c1603',
   '00000000-0000-4000-8000-0000000c1604', '00000000-0000-4000-8000-0000000c1611',
   1, 'en_preparacion', date_trunc('week', current_date)::date, 'matutino', 2),
  ('00000000-0000-4000-8000-0000000c1622', '00000000-0000-4000-8000-0000000c1603',
   '00000000-0000-4000-8000-0000000c1605', '00000000-0000-4000-8000-0000000c1612',
   2, 'en_preparacion', date_trunc('week', current_date)::date, 'matutino', 2);

-- Proceso A: se pausa por jornada. Proceso B se inicia después, cuando el
-- operador ya no tiene una sesión activa.
SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1603'::uuid, '00000000-0000-4000-8000-0000000c1604'::uuid,
  '00000000-0000-4000-8000-0000000c1621'::uuid, '00000000-0000-4000-8000-0000000c1601'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$, 'El operador inicia el proceso A');

UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '12 hours'
WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621';

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c1601')
), 1, 'Solo la sesión vencida del proceso A se pausa');

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1603'::uuid, '00000000-0000-4000-8000-0000000c1605'::uuid,
  '00000000-0000-4000-8000-0000000c1622'::uuid, '00000000-0000-4000-8000-0000000c1601'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$, 'El operador inicia el proceso B');

-- 1-5. Estado inicial de la pausa y del proceso B.
SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 'pausada', 'La sesión del proceso A queda pausada');
SELECT is((
  SELECT horas_netas FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 8::numeric, 'La pausa conserva el corte exacto de la jornada');
SELECT is((
  SELECT motivo_pausa_codigo FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 'FIN_JORNADA', 'El motivo de la pausa queda registrado');
SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1621'
), 'bloqueada', 'El proceso A queda bloqueado mientras la pausa está vigente');
SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1622'
), 'activa', 'El proceso B conserva su sesión activa');

-- 6-11. Cerrar la pausa sin producir.
SELECT lives_ok($$SELECT * FROM public.cerrar_pausa_sin_producir(
  (SELECT id FROM public.sesiones_trabajo
    WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'),
  '00000000-0000-4000-8000-0000000c1601'::uuid)$$,
  'El operador cierra la pausa sin producir');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 'finalizada', 'La pausa queda finalizada');
SELECT is((
  SELECT horas_netas FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 8::numeric, 'Las horas netas no se recalculan');
SELECT is((
  SELECT motivo_pausa_codigo FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'
), 'FIN_JORNADA', 'El motivo original se conserva como historial');
SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1621'
), 'programada', 'La operación vuelve al pool');
SELECT is((
  SELECT notas FROM public.registros_tiempo_operador
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1604'
    AND accion = 'fin'
  ORDER BY creado_en DESC LIMIT 1
), 'Pausa cerrada sin producir', 'El cierre sin producir queda auditado');

-- 12-13. Independencia: el proceso B no se toca.
SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE programacion_id = '00000000-0000-4000-8000-0000000c1622'
), 'activa', 'La sesión en marcha del proceso B sigue activa');
SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1622'
), 'en_proceso', 'La programación del proceso B no se modifica');

-- 14. Una pausa ya cerrada no se puede volver a cerrar.
SELECT throws_ok($$SELECT * FROM public.cerrar_pausa_sin_producir(
  (SELECT id FROM public.sesiones_trabajo
    WHERE programacion_id = '00000000-0000-4000-8000-0000000c1621'),
  '00000000-0000-4000-8000-0000000c1601'::uuid)$$,
  '23514', 'programacion_no_bloqueada',
  'Una pausa ya cerrada no se vuelve a cerrar');

-- 15-17. La RPC queda reservada al service_role.
SELECT is(has_function_privilege('anon',
  'public.cerrar_pausa_sin_producir(uuid, uuid)', 'execute'), false,
  'anon no puede cerrar pausas');
SELECT is(has_function_privilege('authenticated',
  'public.cerrar_pausa_sin_producir(uuid, uuid)', 'execute'), false,
  'authenticated no puede cerrar pausas');
SELECT is(has_function_privilege('service_role',
  'public.cerrar_pausa_sin_producir(uuid, uuid)', 'execute'), true,
  'service_role ejecuta el cierre de pausa');

SELECT * FROM finish();
ROLLBACK;
