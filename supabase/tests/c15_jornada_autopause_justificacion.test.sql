-- C15 - Pausa automática al cumplir la jornada y justificación del operador.
-- Verifica que la sesión se corta exactamente en la jornada, que no se vuelve
-- a pausar, que el cierre sin autorización sigue bloqueado y que una
-- justificación atada a la sesión permite cerrar y queda consumida.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(19);

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-4000-8000-0000000c1501', 'c15-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000c1502', 'c15-gerente@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1501';
UPDATE public.usuarios SET rol = 'gerente', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1502';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1503', 'Cliente C15', 'Cliente C15 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1504', 'OP-993301',
  '00000000-0000-4000-8000-0000000c1503', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1505', '00000000-0000-4000-8000-0000000c1504',
   'C15-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c1501');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c1507', 'C15-R1', 'taller', 'Recurso C15', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c1507', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c1511', '00000000-0000-4000-8000-0000000c1504',
   '00000000-0000-4000-8000-0000000c1505', '00000000-0000-4000-8000-0000000c1507',
   1, 'en_preparacion', current_date, 'matutino', 2);

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1504'::uuid, '00000000-0000-4000-8000-0000000c1505'::uuid,
  '00000000-0000-4000-8000-0000000c1511'::uuid, '00000000-0000-4000-8000-0000000c1501'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'El operador inicia la sesión');

-- 1-5. La sesión vencida se pausa exactamente en la jornada.
UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '10 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c1501';

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c1501')
), 1, 'La pausa automática encuentra la sesión vencida');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
    AND estado_sesion = 'pausada'
), 'pausada', 'La sesión queda pausada');

SELECT is((
  SELECT horas_netas FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
), 8::numeric, 'El corte se registra exactamente al cumplir las 8 h de jornada');

SELECT is((
  SELECT motivo_pausa_codigo FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
), 'FIN_JORNADA', 'La pausa queda identificada como fin de jornada');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1511'
), 'bloqueada', 'La programación queda bloqueada para retomarse');

-- 6. Volver a barrer no pausa dos veces.
SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c1501')
), 0, 'La pausa automática es idempotente');

-- 7-8. El operador retoma y el cierre sin autorización sigue bloqueado.
SELECT lives_ok($$SELECT * FROM public.reanudar_sesion_trabajo_a20(
  '00000000-0000-4000-8000-0000000c1504'::uuid, '00000000-0000-4000-8000-0000000c1505'::uuid,
  '00000000-0000-4000-8000-0000000c1511'::uuid,
  (SELECT actualizado_en FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c1511'),
  '00000000-0000-4000-8000-0000000c1501'::uuid)$$,
  'El operador retoma la sesión pausada');

UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '10 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c1501';

SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
      AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c1501'::uuid, 0, 'finalizada')$$,
  '23514', 'horas_extra_sin_autorizacion',
  'Sin justificación ni aprobación el cierre sigue bloqueado');

-- 9-13. La justificación permite cerrar y queda consumida.
SELECT throws_ok($$SELECT * FROM public.justificar_horas_extra_operador(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
      AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c1501'::uuid, 'corto')$$,
  '23514', 'justificacion_horas_extra_invalida',
  'Una justificación demasiado corta se rechaza');

SELECT is((
  SELECT estado FROM public.justificar_horas_extra_operador(
    (SELECT id FROM public.sesiones_trabajo
      WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
        AND estado_sesion = 'activa'),
    '00000000-0000-4000-8000-0000000c1501'::uuid,
    'La sesión quedó abierta porque olvidé finalizarla al terminar el turno.')
), 'JUSTIFICADA', 'La justificación del operador queda registrada');

SELECT ok((
  SELECT horas_autorizadas > 0 FROM public.autorizaciones_hora_extra
  WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
      AND estado_sesion = 'activa')
), 'La justificación registra las horas excedidas');

SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  (SELECT id FROM public.sesiones_trabajo
    WHERE operador_id = '00000000-0000-4000-8000-0000000c1501'
      AND estado_sesion = 'activa'),
  '00000000-0000-4000-8000-0000000c1501'::uuid, 0, 'finalizada')$$,
  'Con la justificación el operador sí puede cerrar');

SELECT is((
  SELECT estado FROM public.autorizaciones_hora_extra
  WHERE motivo LIKE 'Justificación del operador: La sesión quedó abierta%'
), 'USADA', 'La justificación se consume en el cierre');

-- 14-18. Las RPC quedan reservadas al service_role.
SELECT is(has_function_privilege('anon',
  'public.pausar_sesiones_jornada_excedida(uuid)', 'execute'), false,
  'anon no puede pausar sesiones por jornada');
SELECT is(has_function_privilege('authenticated',
  'public.pausar_sesiones_jornada_excedida(uuid)', 'execute'), false,
  'authenticated no puede pausar sesiones por jornada');
SELECT is(has_function_privilege('service_role',
  'public.pausar_sesiones_jornada_excedida(uuid)', 'execute'), true,
  'service_role ejecuta la pausa automática');
SELECT is(has_function_privilege('anon',
  'public.justificar_horas_extra_operador(uuid, uuid, text)', 'execute'), false,
  'anon no puede justificar horas extra');
SELECT is(has_function_privilege('service_role',
  'public.justificar_horas_extra_operador(uuid, uuid, text)', 'execute'), true,
  'service_role ejecuta la justificación');

SELECT * FROM finish();
ROLLBACK;
