-- C21: tiempo real de proceso, orden de corrección y sesiones inválidas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c2101', 'c21-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c2101';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2103', 'Cliente C21', 'Cliente C21 SA de CV');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2104', 'OP-994401',
  '00000000-0000-4000-8000-0000000c2103', 'en_proceso', now() + interval '10 days');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, cantidad_producida,
  unidad_medida, procesos, operador_asignado_id, tiempo_real_minutos
) VALUES (
  '00000000-0000-4000-8000-0000000c2105', '00000000-0000-4000-8000-0000000c2104',
  'C21-P1', 5, 0, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c2101', 360
);
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c2107', 'C21-R1', 'taller', 'Recurso C21', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000c2111', '00000000-0000-4000-8000-0000000c2104',
  '00000000-0000-4000-8000-0000000c2105', '00000000-0000-4000-8000-0000000c2107',
  1, 'bloqueada', date_trunc('week', current_date)::date, 'matutino', 2
);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas, pendiente_actualizacion_avance
) VALUES
  ('00000000-0000-4000-8000-0000000c2121', '00000000-0000-4000-8000-0000000c2104',
   '00000000-0000-4000-8000-0000000c2105', '00000000-0000-4000-8000-0000000c2111',
   '00000000-0000-4000-8000-0000000c2101', 'pausada', now() - interval '4 hours',
   now(), 4, 0, true),
  ('00000000-0000-4000-8000-0000000c2122', '00000000-0000-4000-8000-0000000c2104',
   '00000000-0000-4000-8000-0000000c2105', '00000000-0000-4000-8000-0000000c2111',
   '00000000-0000-4000-8000-0000000c2101', 'pausada', now() - interval '2 hours',
   now(), 2, 0, true);

SELECT throws_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  '00000000-0000-4000-8000-0000000c2122'::uuid,
  '00000000-0000-4000-8000-0000000c2101'::uuid, 3, 2)$$,
  '23514', 'sesion_antigua_pendiente',
  'No se puede corregir una sesión nueva antes que la antigua');

SELECT lives_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  '00000000-0000-4000-8000-0000000c2121'::uuid,
  '00000000-0000-4000-8000-0000000c2101'::uuid, 5, 2, 'Terminé en 2 h')$$,
  'La sesión antigua se corrige con 5 piezas y 2 h reales');

SELECT is((
  SELECT horas_netas FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c2121'
), 2::numeric, 'El tiempo neto pasa a ser el tiempo real declarado');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c2121'
), 'finalizada', 'La producción completada finaliza la sesión');

SELECT ok((
  SELECT sesion_invalida FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c2122'
), 'La sesión posterior sin avance queda marcada como inválida');

SELECT is((
  SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000c2105'
), 5::numeric, 'El avance queda registrado en la partida');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c2111'
), 'completada', 'La operación queda completada');

SELECT throws_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  '00000000-0000-4000-8000-0000000c2122'::uuid,
  '00000000-0000-4000-8000-0000000c2101'::uuid, 0, 3)$$,
  '23514', 'orden_no_reanudable',
  'Una sesión de una orden completada ya no se puede corregir');

SELECT * FROM finish();
ROLLBACK;
