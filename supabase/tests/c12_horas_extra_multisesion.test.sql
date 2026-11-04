-- C12 - Horas extra por solicitud y procesos simultáneos por operador.
-- Verifica que un operador puede mantener dos sesiones activas si son de
-- programaciones distintas y que las horas extra se solicitan solas al exceder
-- la jornada, quedando pendientes de aprobación o rechazo administrativo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-4000-8000-0000000c1201', 'c12-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000c1202', 'c12-gerente@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1201';
UPDATE public.usuarios SET rol = 'gerente', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1202';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1203', 'Cliente C12', 'Cliente C12 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1204', 'OP-993300',
  '00000000-0000-4000-8000-0000000c1203', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1205', '00000000-0000-4000-8000-0000000c1204',
   'C12-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c1201'),
  ('00000000-0000-4000-8000-0000000c1206', '00000000-0000-4000-8000-0000000c1204',
   'C12-P2', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c1201');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES
  ('00000000-0000-4000-8000-0000000c1207', 'C12-R1', 'taller', 'Recurso C12 A', true),
  ('00000000-0000-4000-8000-0000000c1208', 'C12-R2', 'taller', 'Recurso C12 B', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES
  ('00000000-0000-4000-8000-0000000c1207', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c1208', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1211', '00000000-0000-4000-8000-0000000c1204',
   '00000000-0000-4000-8000-0000000c1205', '00000000-0000-4000-8000-0000000c1207',
   1, 'en_preparacion', current_date, 'matutino', 2,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1205' AND secuencia = 1)),
  ('00000000-0000-4000-8000-0000000c1212', '00000000-0000-4000-8000-0000000c1204',
   '00000000-0000-4000-8000-0000000c1206', '00000000-0000-4000-8000-0000000c1208',
   1, 'en_preparacion', current_date, 'matutino', 2,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1206' AND secuencia = 1));

-- 1-3. Dos programaciones distintas: el mismo operador sostiene ambas sesiones.
SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1204'::uuid, '00000000-0000-4000-8000-0000000c1205'::uuid,
  '00000000-0000-4000-8000-0000000c1211'::uuid, '00000000-0000-4000-8000-0000000c1201'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'El operador inicia la primera operación');

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c1204'::uuid, '00000000-0000-4000-8000-0000000c1206'::uuid,
  '00000000-0000-4000-8000-0000000c1212'::uuid, '00000000-0000-4000-8000-0000000c1201'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'El mismo operador inicia una segunda operación simultánea');

SELECT is((
  SELECT count(*)::integer FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c1201'
    AND estado_sesion = 'activa'
), 2, 'El operador conserva dos sesiones activas');

-- 4-5. La solicitud valida identidad y jornada antes de crear nada.
SELECT throws_ok($$SELECT * FROM public.solicitar_horas_extra_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1),
  '00000000-0000-4000-8000-0000000c1202')$$,
  '23514', 'sesion_no_activa',
  'Solo el operador dueño de la sesión puede solicitar horas extra');

SELECT throws_ok($$SELECT * FROM public.solicitar_horas_extra_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1),
  '00000000-0000-4000-8000-0000000c1201')$$,
  '23514', 'horas_extra_no_requeridas',
  'Una sesión dentro de la jornada no genera solicitud');

-- 6-8. Excedida la jornada, la solicitud nace pendiente y es idempotente.
UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '10 hours'
WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211';

SELECT is((
  SELECT estado FROM public.solicitar_horas_extra_operador(
    (SELECT id FROM public.sesiones_trabajo
     WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1),
    '00000000-0000-4000-8000-0000000c1201')
), 'SOLICITADA', 'La solicitud automática queda pendiente de aprobación');

SELECT ok((
  SELECT horas_autorizadas > 0 FROM public.autorizaciones_hora_extra
  WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
    WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1)
), 'La solicitud registra las horas excedidas');

SELECT * FROM public.solicitar_horas_extra_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1),
  '00000000-0000-4000-8000-0000000c1201');

SELECT is((
  SELECT count(*)::integer FROM public.autorizaciones_hora_extra
  WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
    WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1)
    AND estado = 'SOLICITADA'
), 1, 'Volver a pedir reutiliza la solicitud pendiente');

-- 9-10. Aprobar habilita el cierre; no se puede resolver dos veces.
SELECT is((
  SELECT estado FROM public.resolver_solicitud_horas_extra(
    (SELECT id FROM public.autorizaciones_hora_extra
     WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
       WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1)
     LIMIT 1),
    true, '00000000-0000-4000-8000-0000000c1202')
), 'VIGENTE', 'Aprobar deja la autorización vigente');

SELECT throws_ok($$SELECT * FROM public.resolver_solicitud_horas_extra(
  (SELECT id FROM public.autorizaciones_hora_extra
   WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
     WHERE programacion_id = '00000000-0000-4000-8000-0000000c1211' LIMIT 1)
   LIMIT 1),
  true, '00000000-0000-4000-8000-0000000c1202')$$,
  '23514', 'solicitud_no_pendiente',
  'Una solicitud ya resuelta no se vuelve a aprobar');

-- 11. Desaprobar deja la solicitud rechazada.
UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '10 hours'
WHERE programacion_id = '00000000-0000-4000-8000-0000000c1212';
SELECT * FROM public.solicitar_horas_extra_operador(
  (SELECT id FROM public.sesiones_trabajo
   WHERE programacion_id = '00000000-0000-4000-8000-0000000c1212' LIMIT 1),
  '00000000-0000-4000-8000-0000000c1201');
SELECT is((
  SELECT estado FROM public.resolver_solicitud_horas_extra(
    (SELECT id FROM public.autorizaciones_hora_extra
     WHERE sesion_id = (SELECT id FROM public.sesiones_trabajo
       WHERE programacion_id = '00000000-0000-4000-8000-0000000c1212' LIMIT 1)
     LIMIT 1),
    false, '00000000-0000-4000-8000-0000000c1202')
), 'RECHAZADA', 'Desaprobar rechaza la solicitud sin consumirla');

-- 12-16. Las RPC quedan reservadas al service_role.
SELECT is(has_function_privilege('anon',
  'public.solicitar_horas_extra_operador(uuid, uuid)', 'execute'), false,
  'anon no puede solicitar horas extra');
SELECT is(has_function_privilege('authenticated',
  'public.solicitar_horas_extra_operador(uuid, uuid)', 'execute'), false,
  'authenticated no puede solicitar horas extra');
SELECT is(has_function_privilege('service_role',
  'public.solicitar_horas_extra_operador(uuid, uuid)', 'execute'), true,
  'service_role solicita horas extra');
SELECT is(has_function_privilege('anon',
  'public.resolver_solicitud_horas_extra(uuid, boolean, uuid)', 'execute'), false,
  'anon no puede resolver solicitudes de horas extra');
SELECT is(has_function_privilege('service_role',
  'public.resolver_solicitud_horas_extra(uuid, boolean, uuid)', 'execute'), true,
  'service_role resuelve solicitudes de horas extra');

SELECT * FROM finish();
ROLLBACK;
