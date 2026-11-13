-- C14 — el orden de los procesos sigue la secuencia técnica del taller:
-- Corte (láser/router) → Doblado → Soldadura → Maquinado → Acabado → Ensamble.
-- Verifica el rango por familia, la normalización al capturar/reemplazar
-- operaciones RFQ (aunque la UI marque las casillas al revés), el backfill y el
-- saneamiento del ruteo en revisiones DRAFT sin tocar revisiones congeladas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(21);

-- -----------------------------------------------------------------------------
-- Fixtures: vendedor, RFQ, catálogo de procesos y una propuesta con ruteo.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000c140', 'c14-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor C14'
WHERE id = '00000000-0000-4000-8000-00000000c140';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000c141', 'Cliente C14 SA de CV', 'C14', 'activo');

INSERT INTO public.pipeline (id, folio_op, nombre_contacto, empresa, vendedor_id, cliente_id)
VALUES ('00000000-0000-4000-8000-00000000c142', 'OP-C14-0001', 'Contacto C14', 'Empresa C14',
  '00000000-0000-4000-8000-00000000c140', '00000000-0000-4000-8000-00000000c141');

INSERT INTO public.catalogo_procesos (id, codigo, nombre, prefijo_corrida, orden, activo) VALUES
  ('00000000-0000-4000-8000-00000000c143', 'C14_CORTE', 'Corte láser',   'CLAS', 0, true),
  ('00000000-0000-4000-8000-00000000c144', 'C14_DOB',   'DOBLADO_CNC',   'DOBL', 0, true),
  ('00000000-0000-4000-8000-00000000c145', 'C14_SOLD',  'Soldadura',     'SOLD', 0, true),
  ('00000000-0000-4000-8000-00000000c146', 'C14_OTRO',  'Proceso especial', 'OTRO', 0, true);

CREATE TEMP TABLE c14 (nombre text PRIMARY KEY, valor text);
INSERT INTO c14 (nombre, valor)
SELECT 'corte', '00000000-0000-4000-8000-00000000c143'
UNION ALL SELECT 'doblado', '00000000-0000-4000-8000-00000000c144'
UNION ALL SELECT 'soldadura', '00000000-0000-4000-8000-00000000c145'
UNION ALL SELECT 'otro', '00000000-0000-4000-8000-00000000c146';

-- -----------------------------------------------------------------------------
-- 1-4. Rango canónico por familia (tolera acentos: «Corte láser»).
-- -----------------------------------------------------------------------------
SELECT is(privado.rango_proceso_canonico('C14_CORTE', 'Corte láser'), 10,
  'Corte láser abre la secuencia (10)');
SELECT is(privado.rango_proceso_canonico('C14_DOB', 'DOBLADO_CNC'), 20,
  'Doblado va después del corte (20)');
SELECT is(privado.rango_proceso_canonico('C14_SOLD', 'Soldadura'), 30,
  'Soldadura sigue al doblado (30)');
SELECT is(privado.rango_proceso_canonico('C14_OTRO', 'Proceso especial'), 70,
  'Lo no clasificado queda al final (70)');

-- -----------------------------------------------------------------------------
-- 5-7. Captura RFQ: el orden técnico gana sobre el orden de clic de la UI.
-- -----------------------------------------------------------------------------
INSERT INTO c14 (nombre, valor)
SELECT 'item1', (public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000c142',
  jsonb_build_object(
    'descripcion', 'Pieza C14 capturada al revés', 'cantidad', 1,
    'proceso_ids', jsonb_build_array(
      (SELECT valor FROM c14 WHERE nombre = 'doblado'),
      (SELECT valor FROM c14 WHERE nombre = 'soldadura'),
      (SELECT valor FROM c14 WHERE nombre = 'corte'))),
  '00000000-0000-4000-8000-00000000c140')->>'id');

SELECT is(
  (SELECT string_agg(proceso.codigo, '|' ORDER BY operacion.orden)
   FROM public.rfq_item_operaciones AS operacion
   JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
   WHERE operacion.rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item1')),
  'C14_CORTE|C14_DOB|C14_SOLD',
  'crear_item_rfq guarda Corte, Doblado y Soldadura sin importar el orden de clic');

SELECT is(
  (SELECT array_agg(operacion.orden ORDER BY operacion.orden)
   FROM public.rfq_item_operaciones AS operacion
   WHERE operacion.rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item1')),
  ARRAY[0, 1, 2],
  'El orden queda consecutivo desde cero');

INSERT INTO c14 (nombre, valor)
SELECT 'ops', public.reemplazar_operaciones_item(
  (SELECT valor::uuid FROM c14 WHERE nombre = 'item1'),
  ARRAY[(SELECT valor::uuid FROM c14 WHERE nombre = 'doblado'),
        (SELECT valor::uuid FROM c14 WHERE nombre = 'corte')],
  '00000000-0000-4000-8000-00000000c140')::text;

SELECT is(
  (SELECT valor::jsonb FROM c14 WHERE nombre = 'ops') -> 0 ->> 'proceso_id',
  (SELECT valor FROM c14 WHERE nombre = 'corte'),
  'reemplazar_operaciones_item devuelve Corte como primera secuencia');

-- -----------------------------------------------------------------------------
-- 8-10. Inserciones directas (backfill/ajustes manuales) también se normalizan.
-- -----------------------------------------------------------------------------
INSERT INTO c14 (nombre, valor)
SELECT 'item2', (public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000c142',
  jsonb_build_object('descripcion', 'Pieza C14 sin procesos', 'cantidad', 1),
  '00000000-0000-4000-8000-00000000c140')->>'id');

INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
VALUES ((SELECT valor::uuid FROM c14 WHERE nombre = 'item2'),
        (SELECT valor::uuid FROM c14 WHERE nombre = 'doblado'), 5);
SELECT is(
  (SELECT orden FROM public.rfq_item_operaciones
   WHERE rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item2')),
  0, 'Un alta directa con orden 5 se renumera a 0');

INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
VALUES ((SELECT valor::uuid FROM c14 WHERE nombre = 'item2'),
        (SELECT valor::uuid FROM c14 WHERE nombre = 'corte'), 9);
SELECT is(
  (SELECT string_agg(proceso.codigo, '|' ORDER BY operacion.orden)
   FROM public.rfq_item_operaciones AS operacion
   JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
   WHERE operacion.rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item2')),
  'C14_CORTE|C14_DOB',
  'El corte adelanta al doblado capturado antes');

SELECT is(
  (WITH antes AS (
     SELECT string_agg(proceso.codigo, '|' ORDER BY operacion.orden) AS orden
     FROM public.rfq_item_operaciones AS operacion
     JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
     WHERE operacion.rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item2')
   ), normalizado AS (
     SELECT privado.normalizar_orden_operaciones_rfq(
       (SELECT valor::uuid FROM c14 WHERE nombre = 'item2'))
   )
   SELECT string_agg(proceso.codigo, '|' ORDER BY operacion.orden)
   FROM public.rfq_item_operaciones AS operacion
   JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
   WHERE operacion.rfq_item_id = (SELECT valor::uuid FROM c14 WHERE nombre = 'item2')),
  'C14_CORTE|C14_DOB',
  'Renumerar de nuevo es idempotente');

-- -----------------------------------------------------------------------------
-- 11-16. Ruteo de propuestas: se sanea solo en revisiones DRAFT.
-- -----------------------------------------------------------------------------
INSERT INTO public.propuestas (id, rfq_id, cliente_id, folio_cnc, responsable_id, creado_por)
VALUES ('00000000-0000-4000-8000-00000000c150', '00000000-0000-4000-8000-00000000c142',
  '00000000-0000-4000-8000-00000000c141', 'CNC-1126_05',
  '00000000-0000-4000-8000-00000000c140', '00000000-0000-4000-8000-00000000c140');

INSERT INTO public.propuesta_revisiones (id, propuesta_id, letra, folio_revision, estado, creado_por)
VALUES ('00000000-0000-4000-8000-00000000c151', '00000000-0000-4000-8000-00000000c150',
  'A', 'CNC-1126_05-A', 'DRAFT', '00000000-0000-4000-8000-00000000c140');

INSERT INTO public.propuesta_items (id, revision_id, codigo, descripcion, cantidad)
VALUES ('00000000-0000-4000-8000-00000000c152', '00000000-0000-4000-8000-00000000c151',
  'IT01', 'Pieza C14 propuesta', 1);

INSERT INTO public.propuesta_item_ruteo (item_id, secuencia, proceso_id) VALUES
  ('00000000-0000-4000-8000-00000000c152', 1, '00000000-0000-4000-8000-00000000c144'),
  ('00000000-0000-4000-8000-00000000c152', 2, '00000000-0000-4000-8000-00000000c145'),
  ('00000000-0000-4000-8000-00000000c152', 3, '00000000-0000-4000-8000-00000000c143');

SELECT is(privado.normalizar_ruteo_propuestas_draft(), 3,
  'El saneamiento renumera las tres operaciones del ítem invertido');

SELECT is(
  (SELECT string_agg(proceso.codigo, '|' ORDER BY ruteo.secuencia)
   FROM public.propuesta_item_ruteo AS ruteo
   JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
   WHERE ruteo.item_id = '00000000-0000-4000-8000-00000000c152'),
  'C14_CORTE|C14_DOB|C14_SOLD',
  'El ruteo DRAFT queda Corte 1, Doblado 2, Soldadura 3');

SELECT is(privado.normalizar_ruteo_propuestas_draft(), 0,
  'El saneamiento del ruteo es idempotente');

-- Revisión ya enviada: aunque el ruteo esté invertido, no se toca.
INSERT INTO public.propuesta_revisiones (id, propuesta_id, letra, folio_revision, estado, motivo_creacion, creado_por)
VALUES ('00000000-0000-4000-8000-00000000c153', '00000000-0000-4000-8000-00000000c150',
  'B', 'CNC-1126_05-B', 'SENT', 'Revisión enviada al cliente', '00000000-0000-4000-8000-00000000c140');
SELECT set_config('sii.b4_rpc', 'on', true);
INSERT INTO public.propuesta_items (id, revision_id, codigo, descripcion, cantidad)
VALUES ('00000000-0000-4000-8000-00000000c154', '00000000-0000-4000-8000-00000000c153',
  'IT01', 'Pieza C14 enviada', 1);
INSERT INTO public.propuesta_item_ruteo (item_id, secuencia, proceso_id) VALUES
  ('00000000-0000-4000-8000-00000000c154', 1, '00000000-0000-4000-8000-00000000c144'),
  ('00000000-0000-4000-8000-00000000c154', 2, '00000000-0000-4000-8000-00000000c143');
SELECT set_config('sii.b4_rpc', 'off', true);

SELECT is(privado.normalizar_ruteo_propuestas_draft(), 0,
  'Una revisión enviada no se renumera');
SELECT is(
  (SELECT string_agg(proceso.codigo, '|' ORDER BY ruteo.secuencia)
   FROM public.propuesta_item_ruteo AS ruteo
   JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
   WHERE ruteo.item_id = '00000000-0000-4000-8000-00000000c154'),
  'C14_DOB|C14_CORTE',
  'El ruteo congelado conserva su orden histórico');

-- -----------------------------------------------------------------------------
-- 17-19. Orden interna sin cliente: la partida hereda la secuencia técnica.
-- -----------------------------------------------------------------------------
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-00000000c160', 'OP-991401',
  '00000000-0000-4000-8000-00000000c141', 'borrador', now());

INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos)
VALUES ('00000000-0000-4000-8000-00000000c161', '00000000-0000-4000-8000-00000000c160',
  'PIEZA-C14', 4, 'pza', ARRAY['Doblado CNC', 'Corte láser']);

SELECT is(
  (SELECT array_agg(nombre ORDER BY secuencia) FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-00000000c161'),
  ARRAY['Corte láser', 'Doblado CNC']::text[],
  'Las metas de una orden interna empiezan por Corte láser');

SELECT is(
  (SELECT procesos FROM public.partidas_orden_produccion
   WHERE id = '00000000-0000-4000-8000-00000000c161'),
  ARRAY['Corte láser', 'Doblado CNC']::text[],
  'La partida guarda la misma secuencia técnica');

SELECT is(
  privado.ordenar_procesos_canonicos(
    ARRAY['Proceso especial', 'Soldadura', 'Corte láser']),
  ARRAY['Corte láser', 'Soldadura', 'Proceso especial']::text[],
  'Las familias se ordenan y lo desconocido queda al final');

-- -----------------------------------------------------------------------------
-- 20-21. Camino real del reporte: RFQ capturado al revés → propuesta → ruteo.
-- -----------------------------------------------------------------------------
INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('propuesta_editar_articulo', 'propuestas', 'Editar artículos/cantidades')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('vendedor', 'propuesta_editar_articulo')
ON CONFLICT (rol, permiso) DO NOTHING;

INSERT INTO public.contactos_cliente (id, cliente_id, nombre, es_principal, activo)
VALUES ('00000000-0000-4000-8000-00000000c170', '00000000-0000-4000-8000-00000000c141',
  'Contacto C14 propuesta', true, true);

INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, contacto_id,
  vendedor_id, moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud
) VALUES (
  '00000000-0000-4000-8000-00000000c171', 'OP-C14-0002', 'cotizado', 'READY_FOR_PROPOSAL',
  'Contacto C14 propuesta', 'Empresa C14', '00000000-0000-4000-8000-00000000c141',
  '00000000-0000-4000-8000-00000000c170', '00000000-0000-4000-8000-00000000c140',
  'MXN', 16, 'RFQ C14 capturado con doblado antes que corte', 'correo', current_date);

INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad)
VALUES ('00000000-0000-4000-8000-00000000c172', '00000000-0000-4000-8000-00000000c171',
  1, 'IT01', 'Pieza C14 del reporte', 2);

-- Captura invertida (como la UI cuando se marca Doblado antes que Corte).
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden) VALUES
  ('00000000-0000-4000-8000-00000000c172', '00000000-0000-4000-8000-00000000c144', 0),
  ('00000000-0000-4000-8000-00000000c172', '00000000-0000-4000-8000-00000000c143', 1);

SELECT public.crear_propuesta('00000000-0000-4000-8000-00000000c171',
  '00000000-0000-4000-8000-00000000c140');

SELECT is(
  (SELECT string_agg(proceso.codigo, '|' ORDER BY ruteo.secuencia)
   FROM public.propuesta_item_ruteo AS ruteo
   JOIN public.propuesta_items AS item ON item.id = ruteo.item_id
   JOIN public.propuesta_revisiones AS revision ON revision.id = item.revision_id
   JOIN public.propuestas AS propuesta ON propuesta.id = revision.propuesta_id
   JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
   WHERE propuesta.rfq_id = '00000000-0000-4000-8000-00000000c171'),
  'C14_CORTE|C14_DOB',
  'La propuesta nace con Corte antes que Doblado');

SELECT is(
  (SELECT array_agg(ruteo.secuencia ORDER BY ruteo.secuencia)
   FROM public.propuesta_item_ruteo AS ruteo
   JOIN public.propuesta_items AS item ON item.id = ruteo.item_id
   JOIN public.propuesta_revisiones AS revision ON revision.id = item.revision_id
   JOIN public.propuestas AS propuesta ON propuesta.id = revision.propuesta_id
   WHERE propuesta.rfq_id = '00000000-0000-4000-8000-00000000c171'),
  ARRAY[1, 2],
  'El ruteo inicial queda en secuencias 1 y 2');

SELECT ok(
  NOT has_function_privilege('authenticated', 'privado.normalizar_ruteo_propuestas_draft()', 'EXECUTE'),
  'authenticated no ejecuta el saneamiento del ruteo');

SELECT * FROM finish();
ROLLBACK;
