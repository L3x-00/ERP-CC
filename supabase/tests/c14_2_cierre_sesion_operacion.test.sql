-- C14.2 — el cierre de sesión aplica el estado a la operación realmente
-- trabajada, y la secuencia de la planeación se alinea con su meta.
-- Reproduce la incidencia O-1126_02: la sesión pertenecía a Doblado (planeación
-- con secuencia vieja) y el operador cerró declarando Corte.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

-- -----------------------------------------------------------------------------
-- Fixtures: operador, orden, partida con dos procesos y una sesión activa.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c14b1', 'c14b-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C14B'
WHERE id = '00000000-0000-4000-8000-0000000c14b1';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000000c14b2', 'Cliente C14B SA de CV', 'C14B', 'activo');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c14b3', 'O-9920_01',
  '00000000-0000-4000-8000-0000000c14b2', 'en_proceso', current_date + 7);

INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id)
VALUES ('00000000-0000-4000-8000-0000000c14b4', '00000000-0000-4000-8000-0000000c14b3',
  'IT01', 150, 'pza', ARRAY['DOBLADO_CNC', 'Corte laser'],
  '00000000-0000-4000-8000-0000000c14b1');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000c14b5', 'C14BR1', 'Recurso C14B', 'taller', true);

-- Planeación heredada: la fila de Doblado conserva la secuencia 1 (desfasada).
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, meta_proceso_id, estado_planeacion
) VALUES
  ('00000000-0000-4000-8000-0000000c14b6', '00000000-0000-4000-8000-0000000c14b3',
   '00000000-0000-4000-8000-0000000c14b4', '00000000-0000-4000-8000-0000000c14b5',
   current_date, 'matutino', 2, 1,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'Corte laser'),
   'programada'),
  ('00000000-0000-4000-8000-0000000c14b7', '00000000-0000-4000-8000-0000000c14b3',
   '00000000-0000-4000-8000-0000000c14b4', '00000000-0000-4000-8000-0000000c14b5',
   current_date, 'matutino', 2, 1,
   (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'DOBLADO_CNC'),
   'en_proceso');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000c14b8', '00000000-0000-4000-8000-0000000c14b3',
  '00000000-0000-4000-8000-0000000c14b4', '00000000-0000-4000-8000-0000000c14b7',
  '00000000-0000-4000-8000-0000000c14b1', now() - interval '2 hours'
);

-- -----------------------------------------------------------------------------
-- 1-2. La secuencia de la planeación se alinea con su meta.
-- -----------------------------------------------------------------------------
SELECT is(privado.sincronizar_secuencia_programaciones(), 1,
  'La sincronización corrige la única fila desfasada');
SELECT is(
  (SELECT secuencia FROM public.programacion_areas
   WHERE id = '00000000-0000-4000-8000-0000000c14b7'),
  2::smallint,
  'La fila de Doblado toma la secuencia vigente de su meta');

-- -----------------------------------------------------------------------------
-- 3-6. Cierre declarando otra operación (Corte) desde una sesión de Doblado.
-- -----------------------------------------------------------------------------
SELECT public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c14b8',
  '00000000-0000-4000-8000-0000000c14b1',
  150,
  'finalizada',
  NULL,
  NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'Corte laser')
);

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
   WHERE id = '00000000-0000-4000-8000-0000000c14b6'),
  'completada',
  'Se completa la operación trabajada (Corte)');

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
   WHERE id = '00000000-0000-4000-8000-0000000c14b7'),
  'programada',
  'La operación de la sesión (Doblado) vuelve al pool en lugar de completarse');

SELECT is(
  (SELECT coalesce(sum(cantidad_producida), 0) FROM public.registros_avance_partida
   WHERE meta_proceso_id = (SELECT id FROM public.metas_proceso_partida
     WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'Corte laser')),
  150::numeric,
  'Las piezas quedan registradas en Corte');

SELECT is(
  (SELECT coalesce(sum(cantidad_producida), 0) FROM public.registros_avance_partida
   WHERE meta_proceso_id = (SELECT id FROM public.metas_proceso_partida
     WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'DOBLADO_CNC')),
  0::numeric,
  'Doblado no recibe piezas');

-- -----------------------------------------------------------------------------
-- 7-8. Camino normal: cerrar la operación de la propia sesión sí la completa.
-- -----------------------------------------------------------------------------
UPDATE public.programacion_areas
SET estado_planeacion = 'en_proceso'
WHERE id = '00000000-0000-4000-8000-0000000c14b7';

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000c14ba', '00000000-0000-4000-8000-0000000c14b3',
  '00000000-0000-4000-8000-0000000c14b4', '00000000-0000-4000-8000-0000000c14b7',
  '00000000-0000-4000-8000-0000000c14b1', now() - interval '2 hours'
);

SELECT public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c14ba',
  '00000000-0000-4000-8000-0000000c14b1',
  150,
  'finalizada',
  NULL,
  NULL,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c14b4' AND nombre = 'DOBLADO_CNC')
);

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
   WHERE id = '00000000-0000-4000-8000-0000000c14b7'),
  'completada',
  'El cierre normal sigue completando su propia operación');

SELECT is(
  (SELECT cantidad_producida FROM public.partidas_orden_produccion
   WHERE id = '00000000-0000-4000-8000-0000000c14b4'),
  150::numeric,
  'La última operación suma las piezas físicas a la partida');

SELECT * FROM finish();
ROLLBACK;
