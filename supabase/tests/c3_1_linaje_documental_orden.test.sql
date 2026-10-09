-- C3.1 — Linaje documental al congelar la Orden.
-- RED/GREEN del HIGH de linaje: la identidad documental estable dentro de una
-- propuesta es (propuesta_id, codigo) para los ítems y la propuesta completa
-- para la cabecera. Verifica que el snapshot de Orden congele A..revisión
-- aceptada, excluya revisiones posteriores, otro código, otra propuesta y
-- archivos no vigentes, y que no copie ni mute ninguna fila de `archivos`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(29);

-- -----------------------------------------------------------------------------
-- 0. Contrato de la RPC (no cambia con el linaje)
-- -----------------------------------------------------------------------------
SELECT has_function(
  'public', 'crear_orden_desde_revision', ARRAY['uuid', 'uuid', 'uuid'],
  'Existe la RPC de alta de orden desde la revisión aceptada'
);
SELECT ok(
  (SELECT p.prosecdef FROM pg_proc AS p
   WHERE p.oid = 'public.crear_orden_desde_revision(uuid,uuid,uuid)'::regprocedure),
  'La RPC sigue siendo SECURITY DEFINER'
);
SELECT ok(
  (SELECT 'search_path=' = ANY (
     array(SELECT left(opcion, 12) FROM unnest(p.proconfig) AS opcion)
   )
   FROM pg_proc AS p
   WHERE p.oid = 'public.crear_orden_desde_revision(uuid,uuid,uuid)'::regprocedure),
  'La RPC conserva search_path fijado'
);
SELECT ok(has_function_privilege('service_role',
  'public.crear_orden_desde_revision(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta la RPC');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_orden_desde_revision(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta la RPC');

-- -----------------------------------------------------------------------------
-- 1. Actor y origen comercial
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-00000c31d001', 'c31d-admin@prueba.local');
UPDATE public.usuarios
SET rol = 'admin', activo = true, nombre_completo = 'Admin C3.1 documental'
WHERE id = '00000000-0000-4000-8000-00000c31d001';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, condiciones_pago)
VALUES (
  '00000000-0000-4000-8000-00000c31d010',
  'Cliente C3.1D', 'Cliente C3.1 Documental SA de CV', 'activo', 'contado'
);

INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id,
  vendedor_id, moneda, iva_porcentaje, descripcion_general, canal,
  fecha_solicitud, fecha_requerida, prioridad
) VALUES (
  '00000000-0000-4000-8000-00000c31d020',
  'OP-C31D-0001', 'negociacion', 'READY_FOR_PROPOSAL', 'Contacto C3.1D',
  'Empresa C3.1D', '00000000-0000-4000-8000-00000c31d010',
  '00000000-0000-4000-8000-00000c31d001', 'MXN', 16,
  'Solicitud con planos por revisión', 'correo', current_date,
  now() + interval '15 days', 'alta'
), (
  '00000000-0000-4000-8000-00000c31d021',
  'OP-C31D-0002', 'negociacion', 'READY_FOR_PROPOSAL', 'Contacto ajeno',
  'Empresa ajena', '00000000-0000-4000-8000-00000c31d010',
  '00000000-0000-4000-8000-00000c31d001', 'MXN', 16,
  'Propuesta ajena con el mismo ITxx', 'correo', current_date,
  now() + interval '15 days', 'normal'
);

INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad)
VALUES
  ('00000000-0000-4000-8000-00000c31d031', '00000000-0000-4000-8000-00000c31d020',
   1, 'IT01', 'Pieza documental uno', 2),
  ('00000000-0000-4000-8000-00000c31d032', '00000000-0000-4000-8000-00000c31d020',
   2, 'IT02', 'Pieza documental dos', 1),
  ('00000000-0000-4000-8000-00000c31d033', '00000000-0000-4000-8000-00000c31d021',
   1, 'IT01', 'Pieza de otra propuesta', 1);

CREATE TEMP TABLE c31d_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;

SELECT lives_ok(
  $$SELECT public.crear_propuesta(
    '00000000-0000-4000-8000-00000c31d020',
    '00000000-0000-4000-8000-00000c31d001'
  )$$,
  'Se crea la propuesta con su revisión A'
);
SELECT lives_ok(
  $$SELECT public.crear_propuesta(
    '00000000-0000-4000-8000-00000c31d021',
    '00000000-0000-4000-8000-00000c31d001'
  )$$,
  'Se crea la propuesta ajena de control'
);

INSERT INTO c31d_ids
SELECT 'propuesta', id FROM public.propuestas
WHERE rfq_id = '00000000-0000-4000-8000-00000c31d020';
INSERT INTO c31d_ids
SELECT 'propuesta_ajena', id FROM public.propuestas
WHERE rfq_id = '00000000-0000-4000-8000-00000c31d021';
INSERT INTO c31d_ids
SELECT 'rev_a', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta') AND letra = 'A';
INSERT INTO c31d_ids
SELECT 'rev_ajena', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta_ajena') AND letra = 'A';
INSERT INTO c31d_ids
SELECT 'item_a_it01', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_a') AND codigo = 'IT01';
INSERT INTO c31d_ids
SELECT 'item_a_it02', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_a') AND codigo = 'IT02';
INSERT INTO c31d_ids
SELECT 'item_ajeno_it01', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_ajena') AND codigo = 'IT01';

-- -----------------------------------------------------------------------------
-- 2. Archivos de la revisión A (cabecera, ítems, propuesta, RFQ y controles)
-- -----------------------------------------------------------------------------
INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket,
  ruta_storage, mime, tamano_bytes, vigente, subido_por
) VALUES
  ('propuesta_revision', (SELECT valor FROM c31d_ids WHERE nombre = 'rev_a'), 'tecnico',
   'cabecera-a.pdf', 'CAB-A', 'adjuntos-cotizacion', 'c31d/cab-a.pdf',
   'application/pdf', 1024, true, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta', (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta'), 'comercial',
   'propuesta.pdf', 'CAB-PROP', 'adjuntos-cotizacion', 'c31d/cab-prop.pdf',
   'application/pdf', 1024, true, '00000000-0000-4000-8000-00000c31d001'),
  ('rfq', '00000000-0000-4000-8000-00000c31d020', 'comercial',
   'rfq.pdf', 'CAB-RFQ', 'adjuntos-cotizacion', 'c31d/cab-rfq.pdf',
   'application/pdf', 1024, true, '00000000-0000-4000-8000-00000c31d001'),
  ('rfq_item', '00000000-0000-4000-8000-00000c31d031', 'tecnico',
   'rfq-item.dxf', 'CAB-RFQITEM', 'adjuntos-cotizacion', 'c31d/cab-rfqitem.dxf',
   'application/dxf', 1024, true, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_a_it01'), 'tecnico',
   'plano-it01-a.dxf', 'IT01-A', 'adjuntos-cotizacion', 'c31d/it01-a.dxf',
   'application/dxf', 2048, true, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_a_it01'), 'tecnico',
   'plano-it01-a-obsoleto.dxf', 'IT01-A-OBSOLETO', 'adjuntos-cotizacion',
   'c31d/it01-a-obsoleto.dxf', 'application/dxf', 2048, false,
   '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_a_it02'), 'tecnico',
   'plano-it02-a.dxf', 'IT02-A', 'adjuntos-cotizacion', 'c31d/it02-a.dxf',
   'application/dxf', 2048, true, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_ajeno_it01'), 'tecnico',
   'plano-ajeno.dxf', 'IT01-OTRA-PROPUESTA', 'adjuntos-cotizacion',
   'c31d/it01-ajeno.dxf', 'application/dxf', 2048, true,
   '00000000-0000-4000-8000-00000c31d001');

-- -----------------------------------------------------------------------------
-- 3. Revisión B: copia profunda (los ids de ítem cambian) + ítem nuevo IT03
-- -----------------------------------------------------------------------------
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_a');
UPDATE public.propuestas SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta');

SELECT lives_ok(
  format(
    'SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM c31d_ids WHERE nombre = 'rev_a'),
    'Ampliar alcance con nuevo plano',
    '00000000-0000-4000-8000-00000c31d001'
  ),
  'Se crea la revisión B copiando los ítems de A'
);
INSERT INTO c31d_ids
SELECT 'rev_b', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta') AND letra = 'B';
INSERT INTO c31d_ids
SELECT 'item_b_it01', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b') AND codigo = 'IT01';

SELECT isnt(
  (SELECT valor FROM c31d_ids WHERE nombre = 'item_b_it01'),
  (SELECT valor FROM c31d_ids WHERE nombre = 'item_a_it01'),
  'IT01 cambia de UUID entre revisiones (el linaje no puede depender del id)'
);

SELECT lives_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31d_ids WHERE nombre = 'rev_b'),
    '{"descripcion":"Pieza nacida en B","cantidad":3,"precio_unitario":100}',
    '00000000-0000-4000-8000-00000c31d001'
  ),
  'Se agrega IT03 directamente en la revisión B'
);
INSERT INTO c31d_ids
SELECT 'item_b_it03', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b') AND codigo = 'IT03';

INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket,
  ruta_storage, mime, tamano_bytes, subido_por
) VALUES
  ('propuesta_revision', (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b'), 'tecnico',
   'cabecera-b.pdf', 'CAB-B', 'adjuntos-cotizacion', 'c31d/cab-b.pdf',
   'application/pdf', 1024, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_b_it01'), 'tecnico',
   'plano-it01-b.dxf', 'IT01-B', 'adjuntos-cotizacion', 'c31d/it01-b.dxf',
   'application/dxf', 2048, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_b_it03'), 'tecnico',
   'plano-it03-b.dxf', 'IT03-B', 'adjuntos-cotizacion', 'c31d/it03-b.dxf',
   'application/dxf', 2048, '00000000-0000-4000-8000-00000c31d001');

-- -----------------------------------------------------------------------------
-- 4. B aceptada y C posterior (DRAFT) con archivos que no deben congelarse
-- -----------------------------------------------------------------------------
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones SET estado = 'ACCEPTED'
WHERE id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b');
UPDATE public.propuestas
SET estado = 'ACCEPTED',
    accepted_revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b'),
    revision_vigente_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b')
WHERE id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta');

SELECT lives_ok(
  format(
    'SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM c31d_ids WHERE nombre = 'rev_b'),
    'Revision posterior en borrador',
    '00000000-0000-4000-8000-00000c31d001'
  ),
  'Se crea la revisión C posterior a la aceptada'
);
INSERT INTO c31d_ids
SELECT 'rev_c', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31d_ids WHERE nombre = 'propuesta') AND letra = 'C';
INSERT INTO c31d_ids
SELECT 'item_c_it01', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31d_ids WHERE nombre = 'rev_c') AND codigo = 'IT01';

INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket,
  ruta_storage, mime, tamano_bytes, subido_por
) VALUES
  ('propuesta_revision', (SELECT valor FROM c31d_ids WHERE nombre = 'rev_c'), 'tecnico',
   'cabecera-c.pdf', 'CAB-C', 'adjuntos-cotizacion', 'c31d/cab-c.pdf',
   'application/pdf', 1024, '00000000-0000-4000-8000-00000c31d001'),
  ('propuesta_item', (SELECT valor FROM c31d_ids WHERE nombre = 'item_c_it01'), 'tecnico',
   'plano-it01-c.dxf', 'IT01-C', 'adjuntos-cotizacion', 'c31d/it01-c.dxf',
   'application/dxf', 2048, '00000000-0000-4000-8000-00000c31d001');

-- Estado exacto de `archivos` antes de congelar: la RPC no copia ni muta blobs.
CREATE TEMP TABLE c31d_archivos_antes AS
SELECT id, entidad, entidad_id, ruta_storage, vigente, version, reemplaza_a
FROM public.archivos;

-- -----------------------------------------------------------------------------
-- 5. Orden desde la revisión aceptada
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE c31d_orden AS
SELECT * FROM public.crear_orden_desde_revision(
  (SELECT valor FROM c31d_ids WHERE nombre = 'rev_b'),
  '00000000-0000-4000-8000-00000c31d001',
  gen_random_uuid()
);
INSERT INTO c31d_ids SELECT 'orden', id FROM c31d_orden;

SELECT is((SELECT ya_existia FROM c31d_orden), false, 'La orden se crea por primera vez');
SELECT is(
  (SELECT jsonb_array_length(snapshot_json -> 'items') FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')),
  3, 'El snapshot congela los tres ítems de la revisión aceptada'
);

-- -----------------------------------------------------------------------------
-- 6. Linaje de cabecera: A..aceptada, sin revisiones posteriores
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT string_agg(entrada ->> 'nombre_erp', ',' ORDER BY entrada ->> 'nombre_erp')
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'archivos') AS entrada
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')),
  'CAB-A,CAB-B,CAB-PROP,CAB-RFQ,CAB-RFQITEM',
  'La cabecera congela A y B, más propuesta/RFQ/ítem de RFQ actuales'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.ordenes_produccion AS orden,
         jsonb_array_elements(orden.snapshot_json -> 'archivos') AS entrada
    WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
      AND entrada ->> 'nombre_erp' = 'CAB-C'
  ),
  'La cabecera excluye la revisión posterior a la aceptada'
);
SELECT is(
  (SELECT entrada ->> 'revision_letra'
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'archivos') AS entrada
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND entrada ->> 'nombre_erp' = 'CAB-A'),
  'A', 'Cada archivo de cabecera declara la revisión donde vive'
);
SELECT ok(
  (SELECT entrada -> 'revision_id' = 'null'::jsonb
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'archivos') AS entrada
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND entrada ->> 'nombre_erp' = 'CAB-RFQ'),
  'Un archivo de RFQ no inventa revisión de origen'
);
SELECT ok(
  (SELECT min(CASE WHEN entrada ->> 'nombre_erp' = 'CAB-A' THEN orden_entrada END)
        < min(CASE WHEN entrada ->> 'nombre_erp' = 'CAB-B' THEN orden_entrada END)
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'archivos')
          WITH ORDINALITY AS t(entrada, orden_entrada)
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')),
  'La cabecera queda ordenada por letra de revisión'
);

-- -----------------------------------------------------------------------------
-- 7. Linaje por ítem: mismo ITxx en A..aceptada
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT string_agg(archivo ->> 'nombre_erp', ',' ORDER BY archivo ->> 'nombre_erp')
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND item ->> 'codigo' = 'IT01'),
  'IT01-A,IT01-B',
  'IT01 congela sus planos de A y B pese a cambiar de UUID'
);
SELECT is(
  (SELECT string_agg(archivo ->> 'nombre_erp', ',' ORDER BY archivo ->> 'nombre_erp')
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND item ->> 'codigo' = 'IT02'),
  'IT02-A',
  'IT02 solo recibe su propio plano (sin fuga entre códigos)'
);
SELECT is(
  (SELECT string_agg(archivo ->> 'nombre_erp', ',' ORDER BY archivo ->> 'nombre_erp')
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND item ->> 'codigo' = 'IT03'),
  'IT03-B',
  'El ítem nacido en B conserva su plano'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.ordenes_produccion AS orden,
         jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
         jsonb_array_elements(item -> 'archivos') AS archivo
    WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
      AND archivo ->> 'nombre_erp' IN ('IT01-C', 'IT01-A-OBSOLETO', 'IT01-OTRA-PROPUESTA')
  ),
  'Ningún ítem congela revisiones posteriores, archivos no vigentes ni otra propuesta'
);
SELECT ok(
  (SELECT min(CASE WHEN archivo ->> 'nombre_erp' = 'IT01-A' THEN orden_archivo END)
        < min(CASE WHEN archivo ->> 'nombre_erp' = 'IT01-B' THEN orden_archivo END)
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos')
          WITH ORDINALITY AS t(archivo, orden_archivo)
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND item ->> 'codigo' = 'IT01'),
  'Los planos del ítem quedan ordenados por letra de revisión'
);
SELECT is(
  (SELECT archivo ->> 'revision_letra'
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND archivo ->> 'nombre_erp' = 'IT01-A'),
  'A', 'El plano histórico declara la revisión donde fue adjuntado'
);
SELECT is(
  (SELECT archivo ->> 'item_id'
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')
     AND archivo ->> 'nombre_erp' = 'IT01-A'),
  (SELECT valor::text FROM c31d_ids WHERE nombre = 'item_a_it01'),
  'El plano histórico apunta a la fila de ítem que lo posee'
);
SELECT ok(
  (SELECT bool_and(archivo ->> 'archivo_id' IN (
      SELECT id::text FROM public.archivos
    ))
   FROM public.ordenes_produccion AS orden,
        jsonb_array_elements(orden.snapshot_json -> 'items') AS item,
        jsonb_array_elements(item -> 'archivos') AS archivo
   WHERE orden.id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')),
  'El snapshot referencia ids reales de `archivos`'
);

-- -----------------------------------------------------------------------------
-- 8. No se copian ni mutan archivos ni blobs
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM public.archivos),
  (SELECT count(*)::integer FROM c31d_archivos_antes),
  'Congelar la orden no crea filas en `archivos`'
);
SELECT is(
  (SELECT count(*)::integer FROM (
    (SELECT id, entidad, entidad_id, ruta_storage, vigente, version, reemplaza_a
     FROM c31d_archivos_antes)
    EXCEPT
    (SELECT id, entidad, entidad_id, ruta_storage, vigente, version, reemplaza_a
     FROM public.archivos)
  ) AS diferencias),
  0, 'Congelar la orden no muta ninguna fila de `archivos`'
);
SELECT is(
  (SELECT count(*)::integer FROM public.partidas_orden_produccion
   WHERE orden_id = (SELECT valor FROM c31d_ids WHERE nombre = 'orden')),
  3, 'Las tres piezas fabricables se vuelven partidas'
);

SELECT * FROM finish();
ROLLBACK;
