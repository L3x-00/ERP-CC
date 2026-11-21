-- PLAN-1: no se puede programar una operación posterior sin piezas del previo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c3a00', 'plan1-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador PLAN1'
WHERE id = '00000000-0000-4000-8000-0000000c3a00';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000000c3a01', 'Cliente PLAN1 SA de CV', 'PLAN1', 'activo');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, prioridad, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c3a02', 'OP-993100',
  '00000000-0000-4000-8000-0000000c3a01', 'programada', 'normal',
  date_trunc('week', current_date)::date + 30);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, tiempo_estimado_minutos, area_trabajo_codigo
) VALUES (
  '00000000-0000-4000-8000-0000000c3a03', '00000000-0000-4000-8000-0000000c3a02',
  'P1-IT01', 'Pieza PLAN1', 10, 'pza', ARRAY['Corte laser', 'DOBLADO_CNC'], 15, 'taller'
);

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000c3a04', 'P1-LASER', 'Laser PLAN1', 'taller', true);

CREATE TEMP TABLE p1 (clave text PRIMARY KEY, valor text);
INSERT INTO p1 (clave, valor)
SELECT 'meta_' || secuencia, id::text FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3a03';

SELECT throws_ok(
  $$ INSERT INTO public.programacion_areas (
       id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
       fecha_programada, turno, horas_estimadas, orden_prioridad, meta_proceso_id
     ) VALUES (
       '00000000-0000-4000-8000-0000000c3a05', '00000000-0000-4000-8000-0000000c3a02',
       '00000000-0000-4000-8000-0000000c3a03', '00000000-0000-4000-8000-0000000c3a04',
       2, 'programada', date_trunc('week', current_date)::date + 1, 'matutino', 0.25, 3,
       (SELECT valor::uuid FROM p1 WHERE clave = 'meta_2')
     ) $$,
  '23514', 'proceso_previo_sin_piezas',
  'Doblado no se puede programar sin piezas terminadas por Corte'
);

INSERT INTO public.registros_avance_partida (partida_id, operador_id, cantidad_producida, meta_proceso_id)
VALUES ('00000000-0000-4000-8000-0000000c3a03', '00000000-0000-4000-8000-0000000c3a00', 5,
  (SELECT valor::uuid FROM p1 WHERE clave = 'meta_1'));
UPDATE public.partidas_orden_produccion
SET cantidad_producida = 5 WHERE id = '00000000-0000-4000-8000-0000000c3a03';

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, orden_prioridad, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c3a06', '00000000-0000-4000-8000-0000000c3a02',
  '00000000-0000-4000-8000-0000000c3a03', '00000000-0000-4000-8000-0000000c3a04',
  2, 'programada', date_trunc('week', current_date)::date + 1, 'matutino', 0.25, 3,
  (SELECT valor::uuid FROM p1 WHERE clave = 'meta_2')
);

SELECT is(
  (SELECT count(*)::integer FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c3a06'),
  1,
  'Con piezas del previo, Doblado sí se puede programar'
);

SELECT is(
  (SELECT count(*)::integer FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000c3a05'),
  0,
  'La programación rechazada no quedó registrada'
);

SELECT * FROM finish();
ROLLBACK;
