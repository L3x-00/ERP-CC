-- C27 - Pausa automática con jornada acumulada del día.
-- El barrido ya no mide solo la sesión en curso: descuenta las horas netas que
-- el operador ya cerró ese día laboral. Si ya trabajó 7.5 h, la sesión activa
-- se corta al llegar a 0.5 h netas (8 h del día) y no a las 8 h de reloj.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c2701', 'c27-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c2701';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2702', 'Cliente C27', 'Cliente C27 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2703', 'OP-993327',
  '00000000-0000-4000-8000-0000000c2702', 'en_proceso', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c2704', '00000000-0000-4000-8000-0000000c2703',
   'C27-P1', 20, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c2701');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c2705', 'C27-R1', 'taller', 'Recurso C27', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c2705', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c2706', '00000000-0000-4000-8000-0000000c2703',
   '00000000-0000-4000-8000-0000000c2704', '00000000-0000-4000-8000-0000000c2705',
   1, 'en_preparacion', date_trunc('week', current_date)::date, 'matutino', 2);

SELECT lives_ok($$SELECT * FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c2703'::uuid, '00000000-0000-4000-8000-0000000c2704'::uuid,
  '00000000-0000-4000-8000-0000000c2706'::uuid, '00000000-0000-4000-8000-0000000c2701'::uuid,
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  NULL::uuid)$$,
  'El operador inicia la sesión');

-- La sesión activa lleva 2 h de reloj y el día ya acumula 7.5 h netas en una
-- sesión pausada del mismo día laboral.
UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '2 hours'
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c2701';

INSERT INTO public.sesiones_trabajo (
  orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  horas_brutas, horas_netas, estado_sesion, motivo_pausa
)
SELECT orden_id, partida_id, programacion_id, operador_id,
       fecha_inicio, now() - interval '1 hour', 7.5, 7.5, 'pausada', 'otro'
FROM public.sesiones_trabajo
WHERE estado_sesion = 'activa'
  AND operador_id = '00000000-0000-4000-8000-0000000c2701';

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c2701')
), 1, 'La pausa acumulada encuentra la sesión que agota el día');

SELECT ok((
  SELECT horas_netas > 0.45 AND horas_netas < 0.55
  FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2701'
    AND estado_sesion = 'pausada'
    AND motivo_pausa_codigo = 'FIN_JORNADA'
), 'La sesión activa se corta al llegar a 0.5 h, no a las 8 h de reloj');

SELECT ok((
  SELECT sum(horas_netas) <= 8.02
  FROM public.sesiones_trabajo
  WHERE operador_id = '00000000-0000-4000-8000-0000000c2701'
    AND estado_sesion IN ('pausada', 'finalizada')
), 'El total neto del día queda en la jornada de 8 h');

SELECT is((
  SELECT count(*)::integer FROM public.pausar_sesiones_jornada_excedida(
    '00000000-0000-4000-8000-0000000c2701')
), 0, 'Volver a barrer el mismo día no pausa dos veces');

SELECT is(has_function_privilege('authenticated',
  'public.pausar_sesiones_jornada_excedida(uuid)', 'execute'), false,
  'authenticated sigue sin poder pausar sesiones por jornada');

SELECT * FROM finish();
ROLLBACK;
