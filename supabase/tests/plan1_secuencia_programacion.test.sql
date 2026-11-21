-- PLAN-1: Planeación puede consultar las piezas del proceso previo antes de
-- programar una operación posterior.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);

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

CREATE TEMP TABLE p1 (clave text PRIMARY KEY, valor text);
INSERT INTO p1 (clave, valor)
SELECT 'meta_' || secuencia, id::text FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3a03';

SET LOCAL ROLE service_role;

SELECT is(
  public.obtener_piezas_disponibles_proceso((SELECT valor::uuid FROM p1 WHERE clave = 'meta_1'))->>'secuencia',
  '1',
  'La primera operación reporta secuencia 1'
);

SELECT is(
  public.obtener_piezas_disponibles_proceso((SELECT valor::uuid FROM p1 WHERE clave = 'meta_2'))->>'secuencia',
  '2',
  'La operación posterior reporta secuencia 2'
);

SELECT is(
  public.obtener_piezas_disponibles_proceso((SELECT valor::uuid FROM p1 WHERE clave = 'meta_2'))->>'disponibles',
  '0',
  'Sin piezas producidas por el previo, la disponibilidad es 0 y Planeación puede bloquear'
);

SELECT * FROM finish();
ROLLBACK;
