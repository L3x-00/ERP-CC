-- C10 - Espacio de operador: reclamos de proceso, jornada de 8 h y puente a sesion.
-- Verifica modelo, RPCs, exclusividad, capacidad diaria, liberacion y preparacion
-- del recurso, ademas de privilegios (solo service_role).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(28);

-- -----------------------------------------------------------------------------
-- Fixtures: dos operadores, un cliente, un recurso con capacidad y dos partidas
-- (5 h y 4 h) con una sola meta de proceso cada una.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c1001', 'c10-operador-1@prueba.local'),
  ('00000000-0000-4000-8000-0000000c1002', 'c10-operador-2@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C10 uno'
WHERE id = '00000000-0000-4000-8000-0000000c1001';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C10 dos'
WHERE id = '00000000-0000-4000-8000-0000000c1002';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-0000000c1003', 'Cliente C10 SA de CV', 'C10', 'activo');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo) VALUES
  ('00000000-0000-4000-8000-0000000c1004', 'C10R1', 'Recurso C10 uno', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c1004', 'matutino', 8);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, prioridad, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-0000000c1005', 'OP-991500',
   '00000000-0000-4000-8000-0000000c1003', 'programada', 'normal', current_date + 30);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c1006', '00000000-0000-4000-8000-0000000c1005',
   'C10-P1', 'Pieza C10 cinco horas', 10, 'pza', ARRAY['Corte'], 300),
  ('00000000-0000-4000-8000-0000000c1007', '00000000-0000-4000-8000-0000000c1005',
   'C10-P2', 'Pieza C10 cuatro horas', 8, 'pza', ARRAY['Corte'], 240);

CREATE TEMP TABLE c10 (clave text PRIMARY KEY, valor text);
INSERT INTO c10 (clave, valor)
SELECT 'meta_p1', id::text FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c1006';

-- -----------------------------------------------------------------------------
-- 1-9. Modelo y superficie publica
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'reclamos_proceso_operador', 'Existe la tabla de reclamos');
SELECT has_column('public', 'reclamos_proceso_operador', 'estado', 'El reclamo guarda su estado');
SELECT has_column('public', 'reclamos_proceso_operador', 'horas_estimadas', 'El reclamo guarda sus horas');
SELECT has_function('public', 'reclamar_proceso_operador',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'date', 'text'], 'Existe reclamar_proceso_operador');
SELECT has_function('public', 'mover_reclamo_operador',
  ARRAY['uuid', 'uuid', 'date', 'text'], 'Existe mover_reclamo_operador');
SELECT has_function('public', 'liberar_reclamo_operador',
  ARRAY['uuid', 'uuid'], 'Existe liberar_reclamo_operador');
SELECT has_function('public', 'preparar_reclamo_operador',
  ARRAY['uuid', 'uuid'], 'Existe preparar_reclamo_operador');
SELECT has_function('public', 'iniciar_proceso_reclamado_operador',
  ARRAY['uuid', 'uuid', 'jsonb', 'uuid'], 'Existe iniciar_proceso_reclamado_operador');
SELECT has_trigger('public', 'programacion_areas', 'trg_sincronizar_reclamo_con_programacion',
  'La programacion sincroniza el reclamo al completarse o cancelarse');

-- -----------------------------------------------------------------------------
-- 10-14. Reclamar: exclusividad por operacion y responsabilidad de la partida
-- -----------------------------------------------------------------------------
INSERT INTO c10 (clave, valor)
SELECT 'reclamo_p1', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1005',
  '00000000-0000-4000-8000-0000000c1006',
  (SELECT valor::uuid FROM c10 WHERE clave = 'meta_p1'),
  '00000000-0000-4000-8000-0000000c1001',
  current_date + 1,
  'matutino'
);

SELECT is(
  (SELECT count(*) FROM public.reclamos_proceso_operador
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1006' AND estado = 'activo'),
  1::bigint, 'El primer reclamo queda activo');
SELECT is(
  (SELECT horas_estimadas FROM public.reclamos_proceso_operador
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1006'),
  5::numeric, 'Las horas se derivan del tiempo estimado entre las operaciones');
SELECT is(
  (SELECT operador_asignado_id FROM public.partidas_orden_produccion
    WHERE id = '00000000-0000-4000-8000-0000000c1006'),
  '00000000-0000-4000-8000-0000000c1001'::uuid,
  'Reclamar asigna la partida al operador');

SELECT throws_ok(
  $$ SELECT public.reclamar_proceso_operador(
       '00000000-0000-4000-8000-0000000c1005',
       '00000000-0000-4000-8000-0000000c1006',
       (SELECT valor::uuid FROM c10 WHERE clave = 'meta_p1'),
       '00000000-0000-4000-8000-0000000c1001',
       current_date + 5, 'matutino') $$,
  '23505', 'proceso_ya_reclamado',
  'El mismo operador no puede reclamar dos veces la misma operacion');

SELECT throws_ok(
  $$ SELECT public.reclamar_proceso_operador(
       '00000000-0000-4000-8000-0000000c1005',
       '00000000-0000-4000-8000-0000000c1006',
       (SELECT valor::uuid FROM c10 WHERE clave = 'meta_p1'),
       '00000000-0000-4000-8000-0000000c1002',
       current_date + 1, 'matutino') $$,
  '23514', 'partida_asignada_otro_operador',
  'Otro operador no puede tomar una partida ya asignada');

-- -----------------------------------------------------------------------------
-- 15-18. Capacidad diaria de 8 h y movimiento entre dias
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.reclamar_proceso_operador(
       '00000000-0000-4000-8000-0000000c1005',
       '00000000-0000-4000-8000-0000000c1007',
       (SELECT id FROM public.metas_proceso_partida
         WHERE partida_id = '00000000-0000-4000-8000-0000000c1007'),
       '00000000-0000-4000-8000-0000000c1001',
       current_date + 1, 'matutino') $$,
  '23514', 'capacidad_diaria_insuficiente',
  'La jornada rechaza un proceso que rebasa las 8 h');

INSERT INTO c10 (clave, valor)
SELECT 'reclamo_p2', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1005',
  '00000000-0000-4000-8000-0000000c1007',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1007'),
  '00000000-0000-4000-8000-0000000c1001',
  current_date + 2,
  'matutino'
);
SELECT is(
  (SELECT count(*) FROM public.reclamos_proceso_operador
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1007' AND estado = 'activo'),
  1::bigint, 'El segundo proceso cabe en otro dia');

SELECT throws_ok(
  $$ SELECT public.mover_reclamo_operador(
       (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p2'),
       '00000000-0000-4000-8000-0000000c1001',
       current_date + 1, 'matutino') $$,
  '23514', 'capacidad_diaria_insuficiente',
  'Mover una reserva tambien respeta las 8 h');

INSERT INTO c10 (clave, valor)
SELECT 'fecha_p2', fecha::text
FROM public.mover_reclamo_operador(
  (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p2'),
  '00000000-0000-4000-8000-0000000c1001',
  current_date + 3, 'matutino'
);
SELECT is(
  (SELECT fecha FROM public.reclamos_proceso_operador
    WHERE id = (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p2')),
  current_date + 3, 'La reserva se mueve al dia con capacidad');

-- -----------------------------------------------------------------------------
-- 19-24. Liberar y preparar el recurso
-- -----------------------------------------------------------------------------
SELECT is(
  public.liberar_reclamo_operador(
    (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p2'),
    '00000000-0000-4000-8000-0000000c1001'),
  true, 'Liberar devuelve true');
SELECT is(
  (SELECT estado FROM public.reclamos_proceso_operador
    WHERE id = (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p2')),
  'liberado', 'El reclamo liberado deja de estar activo');
SELECT is(
  (SELECT operador_asignado_id FROM public.partidas_orden_produccion
    WHERE id = '00000000-0000-4000-8000-0000000c1007'),
  NULL::uuid, 'La partida vuelve a quedar libre');

INSERT INTO c10 (clave, valor)
SELECT 'programacion_p1', public.preparar_reclamo_operador(
  (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p1'),
  '00000000-0000-4000-8000-0000000c1001')::text;

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
    WHERE id = (SELECT valor::uuid FROM c10 WHERE clave = 'programacion_p1')),
  'en_preparacion', 'Preparar deja la programacion lista para iniciar');
SELECT is(
  (SELECT meta_proceso_id FROM public.programacion_areas
    WHERE id = (SELECT valor::uuid FROM c10 WHERE clave = 'programacion_p1')),
  (SELECT valor::uuid FROM c10 WHERE clave = 'meta_p1'),
  'La programacion queda ligada a la operacion reclamada');

SELECT public.liberar_reclamo_operador(
  (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p1'),
  '00000000-0000-4000-8000-0000000c1001');
SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
    WHERE id = (SELECT valor::uuid FROM c10 WHERE clave = 'programacion_p1')),
  'cancelada', 'Liberar antes de iniciar devuelve el recurso a Planeacion');

-- ---------------------------------------------------------------------------
-- 25-26. Compatibilidad C9.0: adoptar una preparacion heredada (meta NULL)
-- cuando la partida tiene una sola operacion, en vez de duplicar la fila.
-- ---------------------------------------------------------------------------
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, tiempo_estimado_minutos
) VALUES (
  '00000000-0000-4000-8000-0000000c1008', '00000000-0000-4000-8000-0000000c1005',
  'C10-P3', 'Pieza C10 heredada', 6, 'pza', ARRAY['Corte'], 180
);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000c1009', '00000000-0000-4000-8000-0000000c1005',
  '00000000-0000-4000-8000-0000000c1008', '00000000-0000-4000-8000-0000000c1004',
  1, 'en_preparacion', current_date + 4, 'matutino', 3
);

INSERT INTO c10 (clave, valor)
SELECT 'reclamo_p3', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1005',
  '00000000-0000-4000-8000-0000000c1008',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1008'),
  '00000000-0000-4000-8000-0000000c1001',
  current_date + 4,
  'matutino'
);

INSERT INTO c10 (clave, valor)
SELECT 'programacion_p3', public.preparar_reclamo_operador(
  (SELECT valor::uuid FROM c10 WHERE clave = 'reclamo_p3'),
  '00000000-0000-4000-8000-0000000c1001')::text;

SELECT is(
  (SELECT valor FROM c10 WHERE clave = 'programacion_p3'),
  '00000000-0000-4000-8000-0000000c1009',
  'La preparacion heredada se reutiliza en lugar de crear otra fila');
SELECT is(
  (SELECT meta_proceso_id FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c1009'),
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1008'),
  'La fila adoptada queda ligada a la operacion reclamada');

-- -----------------------------------------------------------------------------
-- 27. Realtime: la terminal de piso refresca al cambiar un reclamo
-- -----------------------------------------------------------------------------
SELECT ok(EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename = 'reclamos_proceso_operador'
), 'El reclamo se publica en Realtime');

-- -----------------------------------------------------------------------------
-- 28. Privilegios: las RPC son exclusivas del servidor
-- -----------------------------------------------------------------------------

SELECT ok(
  NOT has_function_privilege('anon',
    'public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text)', 'EXECUTE'),
  'Reclamar proceso no es ejecutable por anon ni authenticated');

SELECT * FROM finish();
ROLLBACK;
