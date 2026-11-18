-- C16 - Programar en varios días una operación que no cabe en una jornada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c1601', 'c16-planeacion@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1601';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1602', 'Cliente C16', 'Cliente C16 SA de CV');

INSERT INTO public.grupos_equipo (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c1603', 'C16-LASER', 'Láser C16');

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id)
VALUES ('C16LASER', 'Láser C16', 'LZR', '00000000-0000-4000-8000-0000000c1603');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1605', 'OP-993116',
  '00000000-0000-4000-8000-0000000c1602', 'en_proceso', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c1606', '00000000-0000-4000-8000-0000000c1605',
   'C16-P1', 10, 'pieza', ARRAY['Láser C16'], 915),
  ('00000000-0000-4000-8000-0000000c1608', '00000000-0000-4000-8000-0000000c1605',
   'C16-P2', 10, 'pieza', ARRAY['Láser C16'], 480);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo, grupo_equipo_id)
VALUES ('00000000-0000-4000-8000-0000000c1607', 'C16-LASER-01', 'taller', 'Láser C16 01', true,
  '00000000-0000-4000-8000-0000000c1603');
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c1607', 'matutino', 8);

CREATE TEMP TABLE c16_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c16_plan (clave, valor)
SELECT 'meta_1', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1606' AND secuencia = 1;
INSERT INTO c16_plan (clave, valor)
SELECT 'meta_2', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1608' AND secuencia = 1;
GRANT SELECT ON c16_plan TO service_role;

SET LOCAL ROLE service_role;

-- 1-4. La operación de 15.25 h se reparte en 8 + 7.25 h.
SELECT lives_ok($$SELECT * FROM public.programar_operacion_multidia_auditada(
  '00000000-0000-4000-8000-0000000c1605', '00000000-0000-4000-8000-0000000c1606',
  '00000000-0000-4000-8000-0000000c1607', 'matutino',
  jsonb_build_array(
    jsonb_build_object('fecha', current_date, 'horas', 8),
    jsonb_build_object('fecha', current_date + 1, 'horas', 7.25)
  ),
  1, '00000000-0000-4000-8000-0000000c1601', NULL::uuid,
  (SELECT valor FROM c16_plan WHERE clave = 'meta_1'))$$,
  'La operación se programa en dos días');

SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1606'
    AND estado_planeacion = 'programada'
), 2, 'Se crean la fila principal y su continuación');

SELECT is((
  SELECT horas_estimadas FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1606'
    AND es_continuacion = false
), 8::numeric, 'La fila principal conserva las horas del primer día');

SELECT is((
  SELECT horas_estimadas FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1606'
    AND es_continuacion = true
), 7.25::numeric, 'La continuación reserva el resto de las horas');

-- 5. No se puede programar dos veces la misma operación.
SELECT throws_ok($$SELECT * FROM public.programar_operacion_multidia_auditada(
  '00000000-0000-4000-8000-0000000c1605', '00000000-0000-4000-8000-0000000c1606',
  '00000000-0000-4000-8000-0000000c1607', 'matutino',
  jsonb_build_array(
    jsonb_build_object('fecha', current_date, 'horas', 8),
    jsonb_build_object('fecha', current_date + 1, 'horas', 7.25)
  ),
  1, '00000000-0000-4000-8000-0000000c1601', NULL::uuid,
  (SELECT valor FROM c16_plan WHERE clave = 'meta_1'))$$,
  '23505', 'programacion_duplicada',
  'La operación ya programada no se duplica');

-- 6. El día adicional no abre preparación; la sesión nace en el primer día.
SELECT throws_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1606' AND es_continuacion = true),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1606' AND es_continuacion = true))$$,
  '23514', 'programacion_continuacion_no_operable',
  'El día adicional no se puede preparar por separado');

-- 7. La capacidad por día se respeta: el primer día ya tiene 8 h.
SELECT throws_like($$SELECT * FROM public.programar_operacion_multidia_auditada(
  '00000000-0000-4000-8000-0000000c1605', '00000000-0000-4000-8000-0000000c1608',
  '00000000-0000-4000-8000-0000000c1607', 'matutino',
  jsonb_build_array(
    jsonb_build_object('fecha', current_date, 'horas', 8),
    jsonb_build_object('fecha', current_date + 2, 'horas', 1)
  ),
  1, '00000000-0000-4000-8000-0000000c1601', NULL::uuid,
  (SELECT valor FROM c16_plan WHERE clave = 'meta_2'))$$,
  'capacidad_insuficiente%',
  'No se rebasa la capacidad del primer día y el error dice cuánto falta');

-- 8-9. La RPC queda reservada al service_role.
RESET ROLE;
SELECT is(has_function_privilege('anon',
  'public.programar_operacion_multidia_auditada(uuid, uuid, uuid, text, jsonb, integer, uuid, uuid, uuid)',
  'execute'), false, 'anon no puede programar en varios días');
SELECT is(has_function_privilege('service_role',
  'public.programar_operacion_multidia_auditada(uuid, uuid, uuid, text, jsonb, integer, uuid, uuid, uuid)',
  'execute'), true, 'service_role programa en varios días');

SELECT * FROM finish();
ROLLBACK;
