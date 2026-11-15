-- C17 - Consumo de piezas en procesos posteriores al corte.
-- Verifica que el consumo de la operación actual descuente las piezas del
-- proceso previo, que la merma se registre y que la disponibilidad del siguiente
-- proceso use lo producido por la operación actual.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000c1701', 'c17-operador@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c1702', 'c17-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1701';
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1702';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1703', 'Cliente C17', 'Cliente C17 SA de CV');

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida) VALUES
  ('C17CORTE', 'Corte C17', 'COR'),
  ('C17DOBLZ', 'Doblado C17', 'DOB'),
  ('C17PUNZ', 'Punzonado C17', 'PUN');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1704', 'OP-993317',
  '00000000-0000-4000-8000-0000000c1703', 'en_proceso', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1705', '00000000-0000-4000-8000-0000000c1704',
  'C17-P1', 100, 'pieza', ARRAY['Corte C17', 'Doblado C17', 'Punzonado C17'],
  '00000000-0000-4000-8000-0000000c1701'
);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c1706', 'C17-R1', 'taller', 'Recurso C17', true);

CREATE TEMP TABLE c17_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c17_plan (clave, valor)
SELECT 'corte', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1705' AND secuencia = 1;
INSERT INTO c17_plan (clave, valor)
SELECT 'doblado', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1705' AND secuencia = 2;
INSERT INTO c17_plan (clave, valor)
SELECT 'punzonado', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1705' AND secuencia = 3;
GRANT SELECT ON c17_plan TO service_role;

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1707',
  '00000000-0000-4000-8000-0000000c1704',
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1706',
  2, 'en_proceso', current_date, 'matutino', 8,
  NULL
);

-- Corte produjo 100 piezas.
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1701',
  100, 0, (SELECT valor FROM c17_plan WHERE clave = 'corte')
);

-- Sesión de Doblado que produjo 58 piezas y consume 60 del corte (2 de merma).
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  piezas_producidas, fecha_fin
) VALUES (
  '00000000-0000-4000-8000-0000000c1708',
  '00000000-0000-4000-8000-0000000c1704',
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1707',
  '00000000-0000-4000-8000-0000000c1701',
  'finalizada', 58, now()
);
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap,
  sesion_trabajo_id, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1701',
  58, 0,
  '00000000-0000-4000-8000-0000000c1708',
  (SELECT valor FROM c17_plan WHERE clave = 'doblado')
);

SET LOCAL ROLE service_role;

-- 1-5. El consumo descuenta del corte y respeta la merma.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_piezas_operador(
  '00000000-0000-4000-8000-0000000c1708',
  '00000000-0000-4000-8000-0000000c1701',
  58, 2, 'Piezas dobladas con dos dañadas')$$,
  'El consumo de piezas se registra');

SELECT is((
  SELECT cantidad_consumida FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = '00000000-0000-4000-8000-0000000c1708'
), 60::numeric, 'Se guardan 58 usadas + 2 de merma');

SELECT is((
  SELECT cantidad_scrap FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = '00000000-0000-4000-8000-0000000c1708'
), 2::numeric, 'La merma queda registrada en el avance');

RESET ROLE;

SELECT is(privado.piezas_disponibles_proceso(
  (SELECT valor FROM c17_plan WHERE clave = 'doblado')
), 40::numeric, 'Quedan 40 piezas de corte para doblar');

SELECT is(privado.piezas_disponibles_proceso(
  (SELECT valor FROM c17_plan WHERE clave = 'punzonado')
), 58::numeric, 'Punzonado ve las 58 piezas buenas de doblado');

SET LOCAL ROLE service_role;

-- 6-7. Reintentar no duplica el consumo.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_piezas_operador(
  '00000000-0000-4000-8000-0000000c1708',
  '00000000-0000-4000-8000-0000000c1701',
  58, 2, 'Piezas dobladas con dos dañadas')$$,
  'Reintentar el consumo es idempotente');

SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida
  WHERE sesion_trabajo_id = '00000000-0000-4000-8000-0000000c1708'
), 1, 'El reintento no duplica el avance');

-- 8. No se puede producir más de lo que se usó.
SELECT throws_ok($$SELECT * FROM public.registrar_consumo_piezas_operador(
  '00000000-0000-4000-8000-0000000c1708',
  '00000000-0000-4000-8000-0000000c1701',
  50, 0, 'Menos piezas que las producidas')$$,
  '23514', 'consumo_piezas_menor_produccion',
  'El consumo no puede ser menor que la producción');

-- 9. Otra sesión no puede consumir más de las piezas que quedan.
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  piezas_producidas, fecha_fin
) VALUES (
  '00000000-0000-4000-8000-0000000c1709',
  '00000000-0000-4000-8000-0000000c1704',
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1707',
  '00000000-0000-4000-8000-0000000c1701',
  'finalizada', 10, now()
);
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap,
  sesion_trabajo_id, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1705',
  '00000000-0000-4000-8000-0000000c1701',
  10, 0,
  '00000000-0000-4000-8000-0000000c1709',
  (SELECT valor FROM c17_plan WHERE clave = 'doblado')
);
SELECT throws_ok($$SELECT * FROM public.registrar_consumo_piezas_operador(
  '00000000-0000-4000-8000-0000000c1709',
  '00000000-0000-4000-8000-0000000c1701',
  45, 0, 'Intento por encima de lo disponible')$$,
  '23514', 'cantidad_excede_disponible_proceso',
  'No se puede consumir más de lo que dejó el proceso previo');

-- 10-11. La RPC queda reservada al service_role.
RESET ROLE;
SELECT is(has_function_privilege('anon',
  'public.registrar_consumo_piezas_operador(uuid, uuid, numeric, numeric, text)',
  'execute'), false, 'anon no registra consumo de piezas');
SELECT is(has_function_privilege('service_role',
  'public.registrar_consumo_piezas_operador(uuid, uuid, numeric, numeric, text)',
  'execute'), true, 'service_role registra consumo de piezas');

SELECT * FROM finish();
ROLLBACK;
