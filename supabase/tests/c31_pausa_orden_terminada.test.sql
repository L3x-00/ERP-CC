-- C31 — Una pausa residual de una orden ya terminada se cierra sin consumo.
-- Reproduce O-1126_09: pausa con piezas en una orden completada y sin consumo
-- registrado. Antes, el trigger B2 la bloqueaba y la programación quedaba
-- 'bloqueada' aunque la orden ya estuviera cerrada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);

-- -----------------------------------------------------------------------------
-- Fixtures: una orden en piso y otra ya completada, ambas con material propio
-- y sin consumo registrado.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000c3101', 'c31-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c3102', 'c31-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c3101';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c3102';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c3103', 'Cliente C31', 'Cliente C31 SA de CV');

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-0000000c3104', 'C31-MAT', 'Lámina C31', 'kg', true);

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida)
VALUES ('C31CORTE', 'Corte C31', 'CZC');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000000c3105', 'OP-996601',
   '00000000-0000-4000-8000-0000000c3103', 'en_proceso', current_date + 10),
  ('00000000-0000-4000-8000-0000000c3106', 'OP-996602',
   '00000000-0000-4000-8000-0000000c3103', 'completada', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, cantidad_producida,
  unidad_medida, procesos, operador_asignado_id, catalogo_material_id
) VALUES
  ('00000000-0000-4000-8000-0000000c3107', '00000000-0000-4000-8000-0000000c3105',
   'C31-P1', 10, 5, 'pieza', ARRAY['Corte C31'],
   '00000000-0000-4000-8000-0000000c3102', '00000000-0000-4000-8000-0000000c3104'),
  ('00000000-0000-4000-8000-0000000c3108', '00000000-0000-4000-8000-0000000c3106',
   'C31-P2', 10, 10, 'pieza', ARRAY['Corte C31'],
   '00000000-0000-4000-8000-0000000c3102', '00000000-0000-4000-8000-0000000c3104');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c3109', 'C31-R1', 'taller', 'Recurso C31', true);

CREATE TEMP TABLE c31_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c31_plan (clave, valor)
SELECT 'en_piso', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3107' AND secuencia = 1;
INSERT INTO c31_plan (clave, valor)
SELECT 'terminada', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3108' AND secuencia = 1;
GRANT SELECT ON c31_plan TO service_role;

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000000c3110',
   '00000000-0000-4000-8000-0000000c3105',
   '00000000-0000-4000-8000-0000000c3107',
   '00000000-0000-4000-8000-0000000c3109',
   1, 'en_proceso', current_date, 'matutino', 2,
   (SELECT valor FROM c31_plan WHERE clave = 'en_piso')),
  ('00000000-0000-4000-8000-0000000c3111',
   '00000000-0000-4000-8000-0000000c3106',
   '00000000-0000-4000-8000-0000000c3108',
   '00000000-0000-4000-8000-0000000c3109',
   1, 'bloqueada', current_date, 'matutino', 2,
   (SELECT valor FROM c31_plan WHERE clave = 'terminada'));

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_netas, piezas_producidas
) VALUES
  ('00000000-0000-4000-8000-0000000c3112',
   '00000000-0000-4000-8000-0000000c3105',
   '00000000-0000-4000-8000-0000000c3107',
   '00000000-0000-4000-8000-0000000c3110',
   '00000000-0000-4000-8000-0000000c3102', 'pausada',
   now() - interval '2 hours', now(), 1, 5),
  ('00000000-0000-4000-8000-0000000c3113',
   '00000000-0000-4000-8000-0000000c3106',
   '00000000-0000-4000-8000-0000000c3108',
   '00000000-0000-4000-8000-0000000c3111',
   '00000000-0000-4000-8000-0000000c3102', 'pausada',
   now() - interval '2 hours', now(), 1, 10);

-- La partida terminada ya registró su avance contra la meta (como O-1126_09).
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c3108',
  '00000000-0000-4000-8000-0000000c3102',
  10, 0, (SELECT valor FROM c31_plan WHERE clave = 'terminada')
);

-- -----------------------------------------------------------------------------
-- 1. La orden en piso conserva el requisito de consumo.
-- -----------------------------------------------------------------------------
SELECT throws_ok($$UPDATE public.sesiones_trabajo
  SET estado_sesion = 'finalizada'
  WHERE id = '00000000-0000-4000-8000-0000000c3112'$$,
  '23514', 'consumo_material_requerido',
  'Una orden en piso sigue exigiendo consumo al finalizar con piezas');

-- -----------------------------------------------------------------------------
-- 2. La pausa residual de una orden terminada se cierra sin consumo nuevo.
-- -----------------------------------------------------------------------------
SELECT lives_ok($$SELECT * FROM public.cerrar_pausa_huerfana_administrativa(
  '00000000-0000-4000-8000-0000000c3113'::uuid,
  '00000000-0000-4000-8000-0000000c3101'::uuid, false, NULL,
  'Pausa residual de una orden ya terminada')$$,
  'La pausa de una orden terminada se cierra aunque la partida no tenga consumo');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c3113'
), 'finalizada', 'La pausa residual queda finalizada');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c3111'
), 'completada', 'La programación bloqueada se sincroniza a completada al cerrar la pausa');

SELECT * FROM finish();
ROLLBACK;
