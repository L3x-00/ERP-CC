-- C11 - El equipo de Planeación se valida contra la operación del ruteo.
-- Una partida con láser y CNC no debe aceptar una máquina CNC en la operación
-- de láser solo porque la partida completa también requiere CNC.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c1141', 'c11-planeacion@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1141';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1142', 'Cliente C11 Planeación', 'Cliente C11 Planeación SA de CV');

INSERT INTO public.grupos_equipo (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c1143', 'C11-LASER', 'Láser fibra'),
  ('00000000-0000-4000-8000-0000000c1144', 'C11-CNC', 'CNC');

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id) VALUES
  ('C11LASER', 'Láser fibra C11', 'LZR', '00000000-0000-4000-8000-0000000c1143'),
  ('C11CNC', 'CNC C11', 'CNC', '00000000-0000-4000-8000-0000000c1144');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1145', 'OP-993114',
  '00000000-0000-4000-8000-0000000c1142', 'en_proceso', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES (
  '00000000-0000-4000-8000-0000000c1146', '00000000-0000-4000-8000-0000000c1145',
  'C11-PLAN', 10, 'pieza', ARRAY['Láser fibra C11', 'CNC C11'], 120
);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo, grupo_equipo_id) VALUES
  ('00000000-0000-4000-8000-0000000c1147', 'C11-LASER-01', 'taller', 'Láser fibra 01', true,
   '00000000-0000-4000-8000-0000000c1143'),
  ('00000000-0000-4000-8000-0000000c1148', 'C11-CNC-01', 'taller', 'CNC 01', true,
   '00000000-0000-4000-8000-0000000c1144'),
  ('00000000-0000-4000-8000-0000000c1149', 'C11-CNC-02', 'taller', 'CNC 02', true,
   '00000000-0000-4000-8000-0000000c1144');
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c1147', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c1148', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c1149', 'matutino', 8);

CREATE TEMP TABLE c11_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c11_plan (clave, valor)
SELECT 'meta_laser', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1146' AND secuencia = 1;
INSERT INTO c11_plan (clave, valor)
SELECT 'meta_cnc', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1146' AND secuencia = 2;
GRANT SELECT ON c11_plan TO service_role;

-- 1-2. El grupo se resuelve por operación desde el catálogo del proceso.
SELECT is(privado.grupo_equipo_requerido_operacion(
  (SELECT valor FROM c11_plan WHERE clave = 'meta_laser')
), '00000000-0000-4000-8000-0000000c1143'::uuid,
  'La operación de láser exige el grupo Láser fibra');
SELECT is(privado.grupo_equipo_requerido_operacion(
  (SELECT valor FROM c11_plan WHERE clave = 'meta_cnc')
), '00000000-0000-4000-8000-0000000c1144'::uuid,
  'La operación de CNC exige el grupo CNC');

-- 3-4. La compatibilidad distingue la operación, no solo la partida.
SELECT ok(privado.recurso_compatible_con_operacion(
  '00000000-0000-4000-8000-0000000c1146',
  (SELECT valor FROM c11_plan WHERE clave = 'meta_laser'),
  '00000000-0000-4000-8000-0000000c1147'
), 'La máquina de láser es compatible con la operación de láser');
SELECT ok(NOT privado.recurso_compatible_con_operacion(
  '00000000-0000-4000-8000-0000000c1146',
  (SELECT valor FROM c11_plan WHERE clave = 'meta_laser'),
  '00000000-0000-4000-8000-0000000c1148'
), 'La máquina CNC no es compatible con la operación de láser');

SET LOCAL ROLE service_role;

-- 5. Programar la operación de láser con una CNC se rechaza.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c1145', '00000000-0000-4000-8000-0000000c1146',
  '00000000-0000-4000-8000-0000000c1148', NULL::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c1141', NULL::uuid,
  (SELECT valor FROM c11_plan WHERE clave = 'meta_laser'))$$,
  '23514', 'recurso_incompatible',
  'Láser no acepta una máquina del grupo CNC');

-- 6-7. Cada operación acepta su propio grupo.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c1145', '00000000-0000-4000-8000-0000000c1146',
  '00000000-0000-4000-8000-0000000c1147', NULL::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c1141', NULL::uuid,
  (SELECT valor FROM c11_plan WHERE clave = 'meta_laser'))$$,
  'La operación de láser se programa con la máquina de láser');
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c1145', '00000000-0000-4000-8000-0000000c1146',
  '00000000-0000-4000-8000-0000000c1148', NULL::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c1141', NULL::uuid,
  (SELECT valor FROM c11_plan WHERE clave = 'meta_cnc'))$$,
  'La operación de CNC se programa con la máquina CNC');

-- 8. Reprogramar la operación de láser hacia CNC también se rechaza.
SELECT throws_ok($$SELECT * FROM public.reprogramar_partida_recurso_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1146'
     AND meta_proceso_id = (SELECT valor FROM c11_plan WHERE clave = 'meta_laser')),
  '00000000-0000-4000-8000-0000000c1148', current_date + 1, 'matutino', 2, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1146'
     AND meta_proceso_id = (SELECT valor FROM c11_plan WHERE clave = 'meta_laser')),
  'Cambio de grupo', '00000000-0000-4000-8000-0000000c1141', NULL::uuid)$$,
  '23514', 'recurso_incompatible',
  'La reprogramación respeta el grupo de la operación');

-- 9. La reprogramación dentro del mismo grupo sí procede.
SELECT lives_ok($$SELECT * FROM public.reprogramar_partida_recurso_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1146'
     AND meta_proceso_id = (SELECT valor FROM c11_plan WHERE clave = 'meta_laser')),
  '00000000-0000-4000-8000-0000000c1147', current_date + 1, 'matutino', 2, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c1146'
     AND meta_proceso_id = (SELECT valor FROM c11_plan WHERE clave = 'meta_laser')),
  'Ajuste dentro del grupo', '00000000-0000-4000-8000-0000000c1141', NULL::uuid)$$,
  'La reprogramación dentro del mismo grupo se permite');

-- 10. La fila heredada sin operación conserva la validación por partida.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c1145', '00000000-0000-4000-8000-0000000c1146',
  '00000000-0000-4000-8000-0000000c1149', 3::smallint, current_date, 'matutino', 1, 1,
  '00000000-0000-4000-8000-0000000c1141', NULL::uuid,
  NULL::uuid)$$,
  'Sin operación, la compatibilidad histórica por partida sigue funcionando');

-- 11. El helper interno no se expone a un JWT.
RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated',
  'privado.grupo_equipo_requerido_operacion(uuid)', 'EXECUTE'),
  'Un JWT no consulta el grupo interno de la operación');

SELECT * FROM finish();
ROLLBACK;
