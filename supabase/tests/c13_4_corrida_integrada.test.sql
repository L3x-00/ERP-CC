-- C13.4 - Cierre de corrida integrada: avance y tiempos por ítem.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(11);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000f0101', 'c134-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000f0102', 'c134-admin@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C134'
WHERE id = '00000000-0000-4000-8000-0000000f0101';
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C134'
WHERE id = '00000000-0000-4000-8000-0000000f0102';

INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control
) VALUES (
  '00000000-0000-4000-8000-0000000f0103', 'C134LEG', 'Material C134',
  'materia_prima', 'pieza', 'pieza', 1, 10, 10, 100, 1
);
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, material_legacy_id)
VALUES ('00000000-0000-4000-8000-0000000f0104', 'C134MAT', 'Material C134', 'pieza',
  '00000000-0000-4000-8000-0000000f0103');
SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000f0104', 10, 'MXN', current_date, 'MANUAL', NULL,
  '00000000-0000-4000-8000-0000000f0102',
  (SELECT actualizado_en FROM public.catalogo_materiales
   WHERE id = '00000000-0000-4000-8000-0000000f0104'), NULL);

INSERT INTO public.catalogo_procesos (
  id, codigo, nombre, prefijo_corrida, area_trabajo_codigo, activo, requiere_primera_pieza
) VALUES (
  '00000000-0000-4000-8000-0000000f0105', 'C134PROC', 'Corte C134', 'CORT', NULL, true, false
);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000000f0106', 'Cliente C134 SA de CV', 'Cliente C134', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000f0107', 'OP-998401',
  '00000000-0000-4000-8000-0000000f0106', 'en_proceso', current_date + 7);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida,
  catalogo_material_id, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000f0108', '00000000-0000-4000-8000-0000000f0107',
   'IT01', 10, 'pieza', '00000000-0000-4000-8000-0000000f0104',
   '00000000-0000-4000-8000-0000000f0101'),
  ('00000000-0000-4000-8000-0000000f0109', '00000000-0000-4000-8000-0000000f0107',
   'IT02', 10, 'pieza', '00000000-0000-4000-8000-0000000f0104',
   '00000000-0000-4000-8000-0000000f0101'),
  ('00000000-0000-4000-8000-0000000f0110', '00000000-0000-4000-8000-0000000f0107',
   'IT03', 10, 'pieza', '00000000-0000-4000-8000-0000000f0104',
   '00000000-0000-4000-8000-0000000f0101');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000f0111', 'C134R1', 'Recurso C134', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
) VALUES (
  '00000000-0000-4000-8000-0000000f0112', '00000000-0000-4000-8000-0000000f0107',
  '00000000-0000-4000-8000-0000000f0108', '00000000-0000-4000-8000-0000000f0111',
  current_date, 'matutino', 2, 1, 'en_proceso'
);
INSERT INTO public.corridas (
  id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por
) VALUES (
  '00000000-0000-4000-8000-0000000f0113', '00000000-0000-4000-8000-0000000f0107',
  'CORT01', '00000000-0000-4000-8000-0000000f0105', 'EN_PROCESO', 20,
  '00000000-0000-4000-8000-0000000f0101'
);
INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
  ('00000000-0000-4000-8000-0000000f0113', '00000000-0000-4000-8000-0000000f0108', 'IT01', 10),
  ('00000000-0000-4000-8000-0000000f0113', '00000000-0000-4000-8000-0000000f0109', 'IT02', 10);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, corrida_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000f0114', '00000000-0000-4000-8000-0000000f0107',
  '00000000-0000-4000-8000-0000000f0108', '00000000-0000-4000-8000-0000000f0112',
  '00000000-0000-4000-8000-0000000f0101', '00000000-0000-4000-8000-0000000f0113', now()
);

-- 1-3. Validaciones del cierre integrado.
SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-0000000f0114',
  '[{"partida_id":"00000000-0000-4000-8000-0000000f0108","piezas":1,"minutos":10},
    {"partida_id":"00000000-0000-4000-8000-0000000f0110","piezas":1,"minutos":10}]'::jsonb,
  '00000000-0000-4000-8000-0000000f0104', 1, 0, 'Consumo de producción', NULL,
  '00000000-0000-4000-8000-0000000f0101')$$,
  '23514', 'item_fuera_de_corrida',
  'No se puede cerrar con un ítem ajeno a la corrida');

SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-0000000f0114',
  '[{"partida_id":"00000000-0000-4000-8000-0000000f0109","piezas":1,"minutos":10}]'::jsonb,
  '00000000-0000-4000-8000-0000000f0104', 1, 0, 'Consumo de producción', NULL,
  '00000000-0000-4000-8000-0000000f0101')$$,
  '23514', 'item_principal_requerido',
  'El cierre integrado exige la partida de la sesión');

SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-0000000f0114',
  '[{"partida_id":"00000000-0000-4000-8000-0000000f0108","piezas":1,"minutos":10},
    {"partida_id":"00000000-0000-4000-8000-0000000f0109","piezas":1,"minutos":50}]'::jsonb,
  '00000000-0000-4000-8000-0000000f0104', 1, 0, 'Consumo de producción', NULL,
  '00000000-0000-4000-8000-0000000f0101')$$,
  '23514', 'minutos_exceden_sesion',
  'La suma de minutos no puede exceder la sesión');

-- 4-9. Cierre correcto con avance y tiempos por ítem.
UPDATE public.sesiones_trabajo
SET fecha_inicio = now() - interval '30 minutes'
WHERE id = '00000000-0000-4000-8000-0000000f0114';

SELECT lives_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-0000000f0114',
  '[{"partida_id":"00000000-0000-4000-8000-0000000f0108","piezas":3,"minutos":5},
    {"partida_id":"00000000-0000-4000-8000-0000000f0109","piezas":2,"minutos":5}]'::jsonb,
  '00000000-0000-4000-8000-0000000f0104', 1, 0, 'Consumo de producción', 'Cierre integrado',
  '00000000-0000-4000-8000-0000000f0101')$$,
  'El cierre de la corrida integrada procede');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000f0114'
), 'finalizada', 'La sesión principal queda finalizada');

SELECT is((
  SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000f0108'
), 3::numeric, 'El ítem principal registra sus piezas');

SELECT is((
  SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000f0109'
), 2::numeric, 'El ítem extra registra su avance en la misma transacción');

SELECT is((
  SELECT count(*)::integer FROM public.sesion_item_tiempos
  WHERE sesion_id = '00000000-0000-4000-8000-0000000f0114'
), 2, 'Se guardan los tiempos de ambos ítems');

SELECT is((
  SELECT sum(minutos) FROM public.sesion_item_tiempos
  WHERE sesion_id = '00000000-0000-4000-8000-0000000f0114'
), 10::numeric, 'Los minutos quedan registrados por ítem');

-- 10-11. Permisos.
SELECT is(has_function_privilege('anon',
  'public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, text, uuid)',
  'execute'), false, 'anon no cierra corridas integradas');
SELECT is(has_function_privilege('service_role',
  'public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, text, uuid)',
  'execute'), true, 'service_role cierra corridas integradas');

SELECT * FROM finish();
ROLLBACK;

