-- C3.1 — ítems agregados directamente en revisiones de Propuesta.
-- RED/GREEN: origen de revisión, ITxx estable/no reutilizable, RFQ inmutable,
-- copia a la siguiente revisión y permisos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(26);

SELECT has_column(
  'public', 'propuesta_items', 'revision_origen_id',
  'Cada ítem registra la revisión donde fue agregado'
);
SELECT col_not_null(
  'public', 'propuesta_items', 'revision_origen_id',
  'La revisión de origen es obligatoria'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.propuesta_items'::regclass
      AND conname = 'propuesta_items_codigo_valido'
      AND contype = 'c'
  ),
  'El formato ITxx queda protegido en la tabla que usa el contador'
);
SELECT is(
  (SELECT tgenabled::text FROM pg_trigger
   WHERE tgrelid = 'public.propuesta_items'::regclass
     AND tgname = 'trigger_propuesta_items_actualizado_en'),
  'O', 'El trigger de actualizado_en queda habilitado después del backfill'
);
SELECT has_function(
  'public', 'agregar_item_propuesta', ARRAY['uuid', 'jsonb', 'uuid', 'uuid'],
  'Existe la RPC transaccional de alta de ítem'
);
SELECT ok(
  has_function_privilege(
    'service_role', 'public.agregar_item_propuesta(uuid,jsonb,uuid,uuid)', 'EXECUTE'
  ),
  'service_role puede ejecutar el alta'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.agregar_item_propuesta(uuid,jsonb,uuid,uuid)', 'EXECUTE'
  ),
  'authenticated no ejecuta directamente el alta'
);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c3101', 'c31-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c3102', 'c31-operador@prueba.local');
UPDATE public.usuarios
SET rol = 'admin', activo = true, nombre_completo = 'Admin C3.1'
WHERE id = '00000000-0000-4000-8000-0000000c3101';
UPDATE public.usuarios
SET rol = 'operador', activo = true, nombre_completo = 'Operador C3.1'
WHERE id = '00000000-0000-4000-8000-0000000c3102';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES (
  '00000000-0000-4000-8000-0000000c3110',
  'Cliente C3.1', 'Cliente C3.1 SA de CV', 'activo'
);
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id,
  vendedor_id, moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud
) VALUES (
  '00000000-0000-4000-8000-0000000c3120',
  'OP-C3-0001', 'negociacion', 'READY_FOR_PROPOSAL', 'Contacto C3.1',
  'Empresa C3.1', '00000000-0000-4000-8000-0000000c3110',
  '00000000-0000-4000-8000-0000000c3101', 'MXN', 16,
  'Solicitud C3.1', 'correo', current_date
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad)
VALUES
  ('00000000-0000-4000-8000-0000000c3131', '00000000-0000-4000-8000-0000000c3120', 1, 'IT01', 'Origen uno', 1),
  ('00000000-0000-4000-8000-0000000c3132', '00000000-0000-4000-8000-0000000c3120', 2, 'IT02', 'Origen dos', 2);

SELECT lives_ok(
  $$SELECT public.crear_propuesta(
    '00000000-0000-4000-8000-0000000c3120',
    '00000000-0000-4000-8000-0000000c3101'
  )$$,
  'Se crea la revisión A base'
);

CREATE TEMP TABLE c31_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO c31_ids
SELECT 'propuesta', id FROM public.propuestas
WHERE rfq_id = '00000000-0000-4000-8000-0000000c3120';
INSERT INTO c31_ids
SELECT 'rev_a', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31_ids WHERE nombre = 'propuesta') AND letra = 'A';

SELECT ok(
  (SELECT bool_and(revision_origen_id = revision_id)
   FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_a')),
  'Los ítems iniciales nacen en la revisión A'
);

SELECT throws_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_a'),
    '{"descripcion":"No permitido en A","cantidad":1}',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  '23514', 'item_nuevo_solo_revision',
  'Rev A no admite ítems ajenos al RFQ congelado'
);

SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones
SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_a');
UPDATE public.propuestas
SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'propuesta');

SELECT lives_ok(
  format(
    'SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_a'),
    'Agregar alcance solicitado',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  'Se crea la revisión B'
);
INSERT INTO c31_ids
SELECT 'rev_b', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31_ids WHERE nombre = 'propuesta') AND letra = 'B';

SELECT ok(
  (SELECT bool_and(revision_origen_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_a'))
   FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b')),
  'Copiar a B conserva la revisión de origen A'
);

INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto, nota)
VALUES (
  (SELECT valor FROM c31_ids WHERE nombre = 'rev_b'),
  'material', 100, 'Costo previo al nuevo alcance'
);
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones
SET requiere_revision_costeo = false
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b');

SELECT lives_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_b'),
    '{"descripcion":"Ítem agregado en B","cantidad":3,"precio_unitario":125.5}',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  'Se agrega un ítem directamente en B'
);
INSERT INTO c31_ids
SELECT 'item_b', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b') AND codigo = 'IT03';

SELECT is(
  (SELECT codigo FROM public.propuesta_items WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'item_b')),
  'IT03', 'El servidor asigna el siguiente ITxx de la propuesta'
);
SELECT is(
  (SELECT revision_origen_id FROM public.propuesta_items WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'item_b')),
  (SELECT valor FROM c31_ids WHERE nombre = 'rev_b'),
  'El nuevo ítem registra B como revisión de origen'
);
SELECT is(
  (SELECT rfq_item_id FROM public.propuesta_items WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'item_b')),
  NULL::uuid, 'El nuevo ítem no inventa vínculo con RFQ'
);
SELECT is(
  (SELECT count(*) FROM public.rfq_items WHERE rfq_id = '00000000-0000-4000-8000-0000000c3120'),
  2::bigint, 'Agregar en Propuesta no modifica los ítems del RFQ'
);
SELECT is(
  (SELECT requiere_revision_costeo FROM public.propuesta_revisiones
   WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b')),
  true, 'Agregar alcance exige reconfirmar el costeo ya capturado'
);
SELECT throws_ok(
  format(
    'UPDATE public.propuesta_items SET revision_origen_id = %L WHERE id = %L',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_a'),
    (SELECT valor::text FROM c31_ids WHERE nombre = 'item_b')
  ),
  '23514', 'revision_origen_inmutable',
  'La revisión de origen no se puede reescribir'
);

SELECT lives_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_b'),
    '{"descripcion":"Segundo en B","cantidad":1}',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  'La segunda alta recibe el siguiente código'
);
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_items
SET activo = false
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'item_b');
SELECT lives_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_b'),
    '{"descripcion":"No reutiliza IT03","cantidad":1}',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  'Un ítem inactivo no libera su ITxx'
);
SELECT is(
  (SELECT max((substring(codigo FROM 3))::integer)
   FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b')),
  5, 'La numeración avanza a IT05 sin reutilizar IT03'
);

SELECT throws_ok(
  format(
    'SELECT public.agregar_item_propuesta(%L, %L::jsonb, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_b'),
    '{"descripcion":"Sin permiso","cantidad":1}',
    '00000000-0000-4000-8000-0000000c3102'
  ),
  '42501', 'sin_permiso_propuesta',
  'Un operador no agrega ítems'
);

SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones
SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_b');
UPDATE public.propuestas
SET estado = 'SENT'
WHERE id = (SELECT valor FROM c31_ids WHERE nombre = 'propuesta');
SELECT lives_ok(
  format(
    'SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM c31_ids WHERE nombre = 'rev_b'),
    'Conservar historia en C',
    '00000000-0000-4000-8000-0000000c3101'
  ),
  'Se crea C desde B'
);
INSERT INTO c31_ids
SELECT 'rev_c', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c31_ids WHERE nombre = 'propuesta') AND letra = 'C';

SELECT is(
  (SELECT revision_origen_id FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_c') AND codigo = 'IT03'),
  (SELECT valor FROM c31_ids WHERE nombre = 'rev_b'),
  'IT03 conserva B como revisión donde fue agregado'
);
SELECT is(
  (SELECT activo FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM c31_ids WHERE nombre = 'rev_c') AND codigo = 'IT03'),
  false, 'La baja lógica del ítem se conserva al crear C'
);

SELECT * FROM finish();
ROLLBACK;
