-- A15: dos tarifas de una estación no duplican las horas programadas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a1501', 'a15-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a1501';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000a1502', 'Cliente A15', 'Cliente A15', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000a1503', 'OP-991501',
  '00000000-0000-4000-8000-0000000a1502', 'programada', now() + interval '10 days');
INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida)
VALUES ('00000000-0000-4000-8000-0000000a1504',
  '00000000-0000-4000-8000-0000000a1503', 'A15-PIEZA', 1, 'pieza');
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000a1505', 'A15-REC', 'Estación A15', 'taller', true);
INSERT INTO public.programacion_areas
  (id, orden_id, partida_id, recurso_id, fecha_programada, horas_estimadas)
VALUES ('00000000-0000-4000-8000-0000000a1506',
  '00000000-0000-4000-8000-0000000a1503',
  '00000000-0000-4000-8000-0000000a1504',
  '00000000-0000-4000-8000-0000000a1505', current_date, 2);
UPDATE public.recursos_planeacion SET costo_hora_interno = 100
WHERE id = '00000000-0000-4000-8000-0000000a1505';
INSERT INTO public.sesiones_trabajo
  (orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
   horas_brutas, horas_netas, estado_sesion, costo_hora_interno)
VALUES
  ('00000000-0000-4000-8000-0000000a1503', '00000000-0000-4000-8000-0000000a1504',
   '00000000-0000-4000-8000-0000000a1506', '00000000-0000-4000-8000-0000000a1501',
   now() - interval '2 hours', now() - interval '1 hour', 1, 1, 'finalizada', 100);
UPDATE public.recursos_planeacion SET costo_hora_interno = 200
WHERE id = '00000000-0000-4000-8000-0000000a1505';
INSERT INTO public.sesiones_trabajo
  (orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
   horas_brutas, horas_netas, estado_sesion, costo_hora_interno)
VALUES
  ('00000000-0000-4000-8000-0000000a1503', '00000000-0000-4000-8000-0000000a1504',
   '00000000-0000-4000-8000-0000000a1506', '00000000-0000-4000-8000-0000000a1501',
   now() - interval '1 hour', now(), 1, 1, 'finalizada', 200);

SELECT is((SELECT count(*)::integer FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 2,
  'Se conservan las dos tarifas históricas');
SELECT is((SELECT sum(horas_estimadas) FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 2::numeric,
  'La suma estimada coincide con las dos horas programadas');
SELECT is((SELECT sum(horas_reales) FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 2::numeric,
  'Las horas reales siguen siendo dos');
SELECT is((SELECT sum(importe) FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 300::numeric,
  'El costo histórico permanece en 300');
SELECT is((SELECT horas_estimadas FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra' AND tarifa_hora = 100),
  1::numeric, 'La tarifa de 100 recibe una hora estimada');
SELECT is((SELECT horas_estimadas FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra' AND tarifa_hora = 200),
  1::numeric, 'La tarifa de 200 recibe una hora estimada');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.obtener_desglose_rentabilidad_orden(uuid)', 'EXECUTE'),
  'El desglose sigue reservado al servidor');

-- Tres grupos fuerzan el resto del redondeo; las cifras visibles suman 2.00.
UPDATE public.recursos_planeacion SET costo_hora_interno = 300
WHERE id = '00000000-0000-4000-8000-0000000a1505';
INSERT INTO public.sesiones_trabajo
  (orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
   horas_brutas, horas_netas, estado_sesion, costo_hora_interno)
VALUES ('00000000-0000-4000-8000-0000000a1503',
  '00000000-0000-4000-8000-0000000a1504',
  '00000000-0000-4000-8000-0000000a1506',
  '00000000-0000-4000-8000-0000000a1501',
  now(), now() + interval '1 hour', 1, 1, 'finalizada', 300);
SELECT is((SELECT sum(horas_estimadas) FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 2::numeric,
  'Tres tarifas conservan exactamente las dos horas programadas');
SELECT is((SELECT horas_estimadas FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra' AND tarifa_hora = 300),
  0.66::numeric, 'La última tarifa absorbe el centésimo de redondeo');
SELECT is((SELECT sum(importe) FROM public.obtener_desglose_rentabilidad_orden(
  '00000000-0000-4000-8000-0000000a1503') WHERE rubro = 'mano_obra'), 600::numeric,
  'El tercer costo histórico también queda intacto');

SELECT * FROM finish();
ROLLBACK;
