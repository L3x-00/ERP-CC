-- B4 - Corridas integradas: operación real, tiempo compartido y consumo único.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(19);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b301', 'b4-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b302', 'b4-opa@prueba.local'),
  ('00000000-0000-4000-8000-00000000b303', 'b4-opb@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B4'
WHERE id = '00000000-0000-4000-8000-00000000b301';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador A B4'
WHERE id = '00000000-0000-4000-8000-00000000b302';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B B4'
WHERE id = '00000000-0000-4000-8000-00000000b303';

INSERT INTO public.catalogo_materiales (
  id, codigo, nombre, unidad_base, moneda_costo, costo_vigente,
  fecha_vigencia_costo, costo_confirmado_en, costo_confirmado_por
) VALUES
  ('00000000-0000-4000-8000-00000000b304', 'B4-MAT', 'Lámina B4', 'kg', 'MXN',
   10, current_date, now(), '00000000-0000-4000-8000-00000000b301'),
  ('00000000-0000-4000-8000-00000000b305', 'B4-OTRO', 'Otro material B4', 'kg', 'MXN',
   5, current_date, now(), '00000000-0000-4000-8000-00000000b301');

INSERT INTO public.catalogo_procesos (
  id, codigo, nombre, prefijo_corrida, area_trabajo_codigo, activo, requiere_primera_pieza
) VALUES
  ('00000000-0000-4000-8000-00000000b306', 'CORTEB4', 'Corte B4', 'CORT', NULL, true, false),
  ('00000000-0000-4000-8000-00000000b307', 'DOBLB4', 'Doblado B4', 'DOBL', NULL, true, false),
  ('00000000-0000-4000-8000-00000000b308', 'PULIB4', 'Pulido B4', 'PULI', NULL, true, false);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000b309', 'Cliente B4 SA', 'Cliente B4', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-00000000b30a', 'OP-998501',
  '00000000-0000-4000-8000-00000000b309', 'en_proceso', current_date + 7);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, codigo_item, cantidad_solicitada, unidad_medida,
  operador_asignado_id, catalogo_material_id, procesos
) VALUES
  ('00000000-0000-4000-8000-00000000b30b', '00000000-0000-4000-8000-00000000b30a',
   'IT01', 'IT01', 10, 'pieza', '00000000-0000-4000-8000-00000000b302',
   '00000000-0000-4000-8000-00000000b304', ARRAY['Corte B4', 'Doblado B4']),
  ('00000000-0000-4000-8000-00000000b30c', '00000000-0000-4000-8000-00000000b30a',
   'IT02', 'IT02', 10, 'pieza', '00000000-0000-4000-8000-00000000b303',
   '00000000-0000-4000-8000-00000000b304', ARRAY['Corte B4', 'Doblado B4']),
  ('00000000-0000-4000-8000-00000000b30d', '00000000-0000-4000-8000-00000000b30a',
   'IT03', 'IT03', 10, 'pieza', '00000000-0000-4000-8000-00000000b303',
   '00000000-0000-4000-8000-00000000b304', ARRAY['Corte B4', 'Doblado B4']),
  ('00000000-0000-4000-8000-00000000b30e', '00000000-0000-4000-8000-00000000b30a',
   'IT04', 'IT04', 10, 'pieza', '00000000-0000-4000-8000-00000000b303',
   '00000000-0000-4000-8000-00000000b304', ARRAY['Doblado B4', 'Pulido B4']);

CREATE TEMP TABLE b4 (clave text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b4 SELECT 'corte_it01', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-00000000b30b' AND nombre = 'Corte B4';
INSERT INTO b4 SELECT 'corte_it02', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-00000000b30c' AND nombre = 'Corte B4';
INSERT INTO b4 SELECT 'doblado_it02', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-00000000b30c' AND nombre = 'Doblado B4';

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo, costo_hora_interno)
VALUES ('00000000-0000-4000-8000-00000000b30f', 'B4R1', 'Recurso B4', 'taller', true, 50);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-00000000b310', '00000000-0000-4000-8000-00000000b30a',
  '00000000-0000-4000-8000-00000000b30b', '00000000-0000-4000-8000-00000000b30f',
  current_date, 'matutino', 2, 1, 'en_proceso',
  (SELECT valor FROM b4 WHERE clave = 'corte_it01')
);

INSERT INTO public.corridas (
  id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por
) VALUES (
  '00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b30a',
  'CORT01', '00000000-0000-4000-8000-00000000b306', 'EN_PROCESO', 40,
  '00000000-0000-4000-8000-00000000b302'
);
INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
  ('00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b30b', 'IT01', 10),
  ('00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b30c', 'IT02', 10),
  ('00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b30d', 'IT03', 10),
  ('00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b30e', 'IT04', 10);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, corrida_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-00000000b312', '00000000-0000-4000-8000-00000000b30a',
  '00000000-0000-4000-8000-00000000b30b', '00000000-0000-4000-8000-00000000b310',
  '00000000-0000-4000-8000-00000000b302', '00000000-0000-4000-8000-00000000b311',
  now() - interval '90 minutes'
);

-- 1-2. La lectura devuelve la operación real (Corte), no la última meta (Doblado).
SELECT is((
  SELECT count(*)::integer FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b301')
), 4, 'La corrida lista sus cuatro ítems');

SELECT is((
  SELECT count(*)::integer FROM public.obtener_items_corrida(
    '00000000-0000-4000-8000-00000000b311', '00000000-0000-4000-8000-00000000b301')
  WHERE meta_proceso_id IN (
    SELECT valor FROM b4 WHERE clave IN ('corte_it01', 'corte_it02'))
), 2, 'IT01 e IT02 apuntan a la operación Corte de su propia ruta');

-- 3. Ítem duplicado: rechazo controlado.
SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-00000000b312',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":1},
    {"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":1}]'::jsonb,
  '00000000-0000-4000-8000-00000000b304', 1, 0, NULL,
  '00000000-0000-4000-8000-00000000b302')$$,
  '23514', 'item_duplicado',
  'Un ítem no puede declararse dos veces en el cierre');

-- 4. Proceso de la corrida sin meta correspondiente: rechazo controlado.
SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-00000000b312',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":1},
    {"partida_id":"00000000-0000-4000-8000-00000000b30e","piezas":1}]'::jsonb,
  '00000000-0000-4000-8000-00000000b304', 1, 0, NULL,
  '00000000-0000-4000-8000-00000000b302')$$,
  '23514', 'meta_proceso_no_corresponde',
  'Un ítem sin la operación de la corrida no se avanza a ciegas');

-- 5. Material ajeno a la corrida: rechazo controlado.
SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-00000000b312',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":1},
    {"partida_id":"00000000-0000-4000-8000-00000000b30c","piezas":1}]'::jsonb,
  '00000000-0000-4000-8000-00000000b305', 1, 0, NULL,
  '00000000-0000-4000-8000-00000000b302')$$,
  '23514', 'material_no_corresponde_corrida',
  'El consumo compartido debe ser un material de algún ítem de la corrida');

-- 6-7. Cierre válido sin minutos por ítem (tiempo total de la sesión).
SELECT lives_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-00000000b312',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":3},
    {"partida_id":"00000000-0000-4000-8000-00000000b30c","piezas":2},
    {"partida_id":"00000000-0000-4000-8000-00000000b30d","piezas":1}]'::jsonb,
  '00000000-0000-4000-8000-00000000b304', 1, 0, 'Corte compartido',
  '00000000-0000-4000-8000-00000000b302')$$,
  'La corrida compartida cierra sin repartir minutos');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-00000000b312'
), 'finalizada', 'La sesión principal queda finalizada');

-- 8-10. Avance por ítem en la operación Corte, incluso con otro operador asignado.
SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.partida_id = '00000000-0000-4000-8000-00000000b30c'
    AND avance.meta_proceso_id = (SELECT valor FROM b4 WHERE clave = 'corte_it02')
), 2::numeric, 'IT02 avanza 2 piezas en Corte');

SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida AS avance
  WHERE avance.partida_id = '00000000-0000-4000-8000-00000000b30c'
    AND avance.meta_proceso_id = (SELECT valor FROM b4 WHERE clave = 'doblado_it02')
), 0, 'IT02 no avanza en Doblado: esa operación no se ejecutó');

SELECT is((
  SELECT sum(avance.cantidad_producida) FROM public.registros_avance_partida AS avance
  WHERE avance.partida_id = '00000000-0000-4000-8000-00000000b30d'
), 1::numeric, 'IT03 registra su avance en la misma transacción');

-- 11-12. Tiempos: se guardan por ítem con minutos NULL.
SELECT is((
  SELECT count(*)::integer FROM public.sesion_item_tiempos
  WHERE sesion_id = '00000000-0000-4000-8000-00000000b312'
), 3, 'Se guardan los tres ítems de la corrida');

SELECT is((
  SELECT count(*)::integer FROM public.sesion_item_tiempos
  WHERE sesion_id = '00000000-0000-4000-8000-00000000b312' AND minutos IS NULL
), 3, 'Los minutos individuales quedan opcionales (NULL)');

-- 13-15. Consumo total una sola vez y con trazabilidad a la corrida.
SELECT is((
  SELECT count(*)::integer FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b30b'
    AND corrida_id = '00000000-0000-4000-8000-00000000b311'
), 1, 'El consumo compartido se registra una sola vez');

SELECT is((
  SELECT cantidad_usada FROM public.registros_consumo_material
  WHERE corrida_id = '00000000-0000-4000-8000-00000000b311'
), 1::numeric, 'El consumo total de la lámina es 1');

SELECT is((
  SELECT count(*)::integer FROM public.movimientos_inventario
  WHERE orden_id = '00000000-0000-4000-8000-00000000b30a'
), 0, 'El consumo compartido no toca inventario');

-- 16-17. Lectura de tiempos integrados con minutos opcionales.
SELECT is((
  SELECT count(*)::integer FROM public.obtener_tiempos_integrados_orden(
    '00000000-0000-4000-8000-00000000b30a', '00000000-0000-4000-8000-00000000b301')
), 3, 'La lectura integrada devuelve los tres ítems');

SELECT is((
  SELECT count(*)::integer FROM public.obtener_tiempos_integrados_orden(
    '00000000-0000-4000-8000-00000000b30a', '00000000-0000-4000-8000-00000000b301')
  WHERE minutos IS NULL
), 3, 'La lectura conserva NULL cuando no hubo tiempo individual');

-- 18. Reintento: no duplica avance, tiempos ni consumo.
SELECT throws_ok($$SELECT public.cerrar_sesion_integrada(
  '00000000-0000-4000-8000-00000000b312',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b30b","piezas":3},
    {"partida_id":"00000000-0000-4000-8000-00000000b30c","piezas":2}]'::jsonb,
  '00000000-0000-4000-8000-00000000b304', 1, 0, NULL,
  '00000000-0000-4000-8000-00000000b302')$$,
  '23514', 'sesion_no_activa',
  'El reintento de cierre no duplica avances, tiempos ni consumo');

-- 19. Permisos.
SELECT is(has_function_privilege('anon',
  'public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid)',
  'execute'), false, 'anon no cierra corridas integradas');

SELECT * FROM finish();
ROLLBACK;
