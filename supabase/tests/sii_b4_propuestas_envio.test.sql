-- SII-B4.7 — PDF por revisión y envío atómico con congelamiento.
-- Verifica: bucket privado, registro idempotente por hash, único vigente por
-- revisión, envío con PDF/canal/destino/próxima acción y frozen tras SENT.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(32);

-- -----------------------------------------------------------------------------
-- 0. Actores y permisos
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b4e01', 'sii-b4e-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4e02', 'sii-b4e-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4e03', 'sii-b4e-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B4E'
WHERE id = '00000000-0000-4000-8000-0000000b4e01';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B4E'
WHERE id = '00000000-0000-4000-8000-0000000b4e02';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B4E'
WHERE id = '00000000-0000-4000-8000-0000000b4e03';

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('propuesta_vista', 'propuestas', 'Ver propuestas'),
  ('propuesta_editar_articulo', 'propuestas', 'Editar artículos/cantidades'),
  ('propuesta_editar_precio', 'propuestas', 'Editar precios'),
  ('propuesta_editar_ruteo', 'propuestas', 'Editar ruteo'),
  ('propuesta_validar', 'propuestas', 'Validar revisión'),
  ('propuesta_generar_pdf', 'propuestas', 'Generar PDF'),
  ('propuesta_enviar', 'propuestas', 'Enviar propuesta')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('vendedor', 'propuesta_vista'),
  ('vendedor', 'propuesta_editar_articulo'),
  ('vendedor', 'propuesta_editar_precio'),
  ('vendedor', 'propuesta_editar_ruteo'),
  ('vendedor', 'propuesta_validar'),
  ('vendedor', 'propuesta_generar_pdf'),
  ('vendedor', 'propuesta_enviar')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Catálogos, cliente y RFQs
-- -----------------------------------------------------------------------------
INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('B4EMAT', 'Acero B4E');
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, 'B4E 5mm', 5 FROM public.catalogo_materiales WHERE codigo = 'B4EMAT';
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida)
VALUES ('B4ECORTE', 'Corte B4E', 'BECE');
INSERT INTO public.catalogo_proximas_acciones (codigo, nombre) VALUES ('B4E_LLAMAR', 'Llamar B4E');
INSERT INTO public.catalogo_proximas_acciones (codigo, nombre, es_otro)
SELECT 'B4E_OTHER', 'Otro B4E', true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogo_proximas_acciones WHERE es_otro);

INSERT INTO public.clientes (nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('B4E Cliente', 'B4E Cliente SA de CV', 'activo', 'contado');

CREATE TEMP TABLE b4e_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b4e_ids (nombre, valor)
SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'B4E Cliente SA de CV';
INSERT INTO b4e_ids (nombre, valor)
SELECT 'material', id FROM public.catalogo_materiales WHERE codigo = 'B4EMAT';
INSERT INTO b4e_ids (nombre, valor)
SELECT 'espesor', e.id FROM public.catalogo_espesores AS e
JOIN public.catalogo_materiales AS m ON m.id = e.material_id WHERE m.codigo = 'B4EMAT';
INSERT INTO b4e_ids (nombre, valor)
SELECT 'proceso', id FROM public.catalogo_procesos WHERE codigo = 'B4ECORTE';

INSERT INTO public.pipeline (
  folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id,
  moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud,
  proxima_accion_codigo, fecha_proxima_accion, responsable_proxima_accion_id
) VALUES
  ('OP-B4E-0001', 'negociacion', 'READY_FOR_PROPOSAL', 'Ana B4E', 'B4E Empresa 1',
   (SELECT valor FROM b4e_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b4e02', 'MXN', 16, 'Descripción B4E', 'correo',
   current_date, 'B4E_LLAMAR', current_date + 7, '00000000-0000-4000-8000-0000000b4e02'),
  ('OP-B4E-0002', 'negociacion', 'READY_FOR_PROPOSAL', 'Beto B4E', 'B4E Empresa 2',
   (SELECT valor FROM b4e_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b4e02', 'MXN', 16, 'Descripción B4E', 'correo',
   current_date, NULL, NULL, NULL);

INSERT INTO b4e_ids (nombre, valor)
SELECT 'rfq1', id FROM public.pipeline WHERE folio_op = 'OP-B4E-0001';
INSERT INTO b4e_ids (nombre, valor)
SELECT 'rfq2', id FROM public.pipeline WHERE folio_op = 'OP-B4E-0002';

INSERT INTO public.rfq_items (rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id)
SELECT valor, 1, 'IT01', 'Pieza B4E', 2,
  (SELECT id FROM public.catalogo_materiales WHERE codigo = 'B4EMAT'),
  (SELECT valor FROM b4e_ids WHERE nombre = 'espesor')
FROM b4e_ids WHERE nombre IN ('rfq1', 'rfq2');

INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b4e_ids WHERE nombre = 'proceso'), 0
FROM public.rfq_items AS i
WHERE i.rfq_id IN (SELECT valor FROM b4e_ids WHERE nombre IN ('rfq1', 'rfq2'));

SELECT public.crear_propuesta((SELECT valor FROM b4e_ids WHERE nombre = 'rfq1'),
  '00000000-0000-4000-8000-0000000b4e02');
SELECT public.crear_propuesta((SELECT valor FROM b4e_ids WHERE nombre = 'rfq2'),
  '00000000-0000-4000-8000-0000000b4e02');

INSERT INTO b4e_ids (nombre, valor)
SELECT 'p1', id FROM public.propuestas WHERE rfq_id = (SELECT valor FROM b4e_ids WHERE nombre = 'rfq1');
INSERT INTO b4e_ids (nombre, valor)
SELECT 'p1a', id FROM public.propuesta_revisiones WHERE propuesta_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1');
INSERT INTO b4e_ids (nombre, valor)
SELECT 'p2', id FROM public.propuestas WHERE rfq_id = (SELECT valor FROM b4e_ids WHERE nombre = 'rfq2');
INSERT INTO b4e_ids (nombre, valor)
SELECT 'p2a', id FROM public.propuesta_revisiones WHERE propuesta_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p2');
INSERT INTO b4e_ids (nombre, valor)
SELECT 'item1', id FROM public.propuesta_items WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a');

-- -----------------------------------------------------------------------------
-- 2. Estructura, bucket y privilegios
-- -----------------------------------------------------------------------------
SELECT ok(
  has_function_privilege('service_role', 'public.registrar_pdf_revision(uuid,uuid,text,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta registrar_pdf_revision'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.registrar_pdf_revision(uuid,uuid,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta registrar_pdf_revision'
);
SELECT ok(
  has_function_privilege('service_role', 'public.enviar_revision(uuid,text,text,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta enviar_revision'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.enviar_revision(uuid,text,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta enviar_revision'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'propuestas-pdf'),
  false, 'El bucket propuestas-pdf es privado'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'propuestas-pdf'),
  10485760::bigint, 'El bucket limita el tamaño a 10 MB'
);

-- -----------------------------------------------------------------------------
-- 3. registrar_pdf_revision
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.registrar_pdf_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'),
    gen_random_uuid()::text, repeat('a', 32), '00000000-0000-4000-8000-0000000b4e03'),
  '42501', 'sin_permiso_propuesta', 'Un operador no registra PDFs'
);
SELECT throws_ok(
  format('SELECT public.registrar_pdf_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'),
    gen_random_uuid()::text, repeat('a', 32), '00000000-0000-4000-8000-0000000b4e02'),
  '23514', 'revision_no_apta_pdf', 'Una revisión DRAFT no genera PDF'
);

SELECT public.validar_revision(
  (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'),
  jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
    WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'))),
  '00000000-0000-4000-8000-0000000b4e02');

-- Archivos fixture: uno válido para P1 y uno inválido (entidad rfq).
INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket, ruta_storage, mime, tamano_bytes, subido_por
) VALUES (
  'propuesta_revision', (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'), 'pdf',
  'propuesta.pdf', 'B4E-P1.pdf', 'propuestas-pdf', 'propuesta_revision/p1/uno.pdf',
  'application/pdf', 1024, '00000000-0000-4000-8000-0000000b4e02'
);
INSERT INTO b4e_ids (nombre, valor)
SELECT 'pdf_archivo1', id FROM public.archivos WHERE ruta_storage = 'propuesta_revision/p1/uno.pdf';
INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket, ruta_storage, mime, tamano_bytes, subido_por
) VALUES (
  'rfq', (SELECT valor FROM b4e_ids WHERE nombre = 'rfq1'), 'pdf',
  'otro.pdf', 'B4E-OTRO.pdf', 'propuestas-pdf', 'rfq/p1/malo.pdf',
  'application/pdf', 1024, '00000000-0000-4000-8000-0000000b4e02'
);
INSERT INTO b4e_ids (nombre, valor)
SELECT 'pdf_archivo_malo', id FROM public.archivos WHERE ruta_storage = 'rfq/p1/malo.pdf';

SELECT throws_ok(
  format('SELECT public.registrar_pdf_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'),
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'pdf_archivo_malo'),
    repeat('b', 32), '00000000-0000-4000-8000-0000000b4e02'),
  '22023', 'pdf_archivo_invalido', 'Solo se registra un archivo de la revisión en el bucket de PDFs'
);

SELECT is(
  (public.registrar_pdf_revision(
    (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'),
    (SELECT valor FROM b4e_ids WHERE nombre = 'pdf_archivo1'),
    repeat('c', 64),
    '00000000-0000-4000-8000-0000000b4e02') ->> 'version')::integer,
  1, 'El primer PDF registra la versión 1'
);
INSERT INTO b4e_ids (nombre, valor)
SELECT 'pdf1', id FROM public.propuesta_pdfs WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a');

SELECT is(
  (public.registrar_pdf_revision(
    (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'),
    (SELECT valor FROM b4e_ids WHERE nombre = 'pdf_archivo1'),
    repeat('c', 64),
    '00000000-0000-4000-8000-0000000b4e02') ->> 'yaExistia')::boolean,
  true, 'El mismo contenido no regenera el PDF (idempotente por hash)'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_pdfs WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a')),
  1::bigint, 'No se duplica la fila del PDF'
);

SELECT is(
  (public.registrar_pdf_revision(
    (SELECT valor FROM b4e_ids WHERE nombre = 'p1a'),
    (SELECT valor FROM b4e_ids WHERE nombre = 'pdf_archivo1'),
    repeat('d', 64),
    '00000000-0000-4000-8000-0000000b4e02') ->> 'version')::integer,
  2, 'Regenerar con otro contenido crea la versión 2'
);
SELECT is(
  (SELECT vigente FROM public.propuesta_pdfs WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'pdf1')),
  false, 'La versión anterior deja de estar vigente'
);
SELECT is(
  (SELECT reemplaza_a FROM public.propuesta_pdfs
   WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a') AND vigente),
  (SELECT valor FROM b4e_ids WHERE nombre = 'pdf1'),
  'La nueva versión encadena reemplaza_a'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_pdfs
   WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a') AND vigente),
  1::bigint, 'Un solo PDF vigente por revisión'
);

-- -----------------------------------------------------------------------------
-- 4. enviar_revision
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'), 'correo', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e03'),
  '42501', 'sin_permiso_propuesta', 'Un operador no envía propuestas'
);
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'), '', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e02'),
  '22023', 'canal_requerido', 'El envío exige canal'
);
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'), 'correo', '',
    '00000000-0000-4000-8000-0000000b4e02'),
  '22023', 'destino_requerido', 'El envío exige destino'
);

-- P2 lista sin PDF: el envío falla por PDF y luego por próxima acción.
SELECT public.validar_revision(
  (SELECT valor FROM b4e_ids WHERE nombre = 'p2a'),
  jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
    WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p2a'))),
  '00000000-0000-4000-8000-0000000b4e02');
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p2a'), 'correo', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e02'),
  '23514', 'pdf_requerido', 'El envío exige PDF vigente'
);

SELECT lives_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'), 'correo', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e02'),
  'Enviar la revisión lista con PDF/canal/destino/próxima acción'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a')),
  'SENT', 'La revisión enviada queda SENT'
);
SELECT is(
  (SELECT estado FROM public.propuestas WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1')),
  'SENT', 'La propuesta espeja SENT'
);
SELECT is(
  (SELECT canal_envio || '|' || destino_envio FROM public.propuesta_revisiones
   WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a')),
  'correo|compras@cliente.mx', 'El envío guarda canal y destino'
);
SELECT is(
  (SELECT enviado_por FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a')),
  '00000000-0000-4000-8000-0000000b4e02'::uuid, 'El envío registra al actor'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_revision_eventos
   WHERE revision_id = (SELECT valor FROM b4e_ids WHERE nombre = 'p1a') AND accion = 'enviar_revision'),
  1::bigint, 'El envío deja evento de revisión'
);
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'), 'correo', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e02'),
  '23514', 'revision_estado_invalido', 'Una revisión SENT no se vuelve a enviar'
);

-- Congelamiento tras SENT: DML directo y registro de PDF fallan.
SELECT set_config('sii.b4_rpc', 'off', true);
SELECT throws_ok(
  format('UPDATE public.propuesta_items SET precio_unitario = 10 WHERE id = %L',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'item1')),
  '23514', 'revision_congelada', 'Editar un ítem tras SENT falla'
);
SELECT throws_ok(
  format('SELECT public.registrar_pdf_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p1a'),
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'pdf_archivo1'),
    repeat('e', 64), '00000000-0000-4000-8000-0000000b4e02'),
  '23514', 'revision_no_apta_pdf', 'Tras SENT el PDF es inmutable'
);

-- P2: con PDF pero sin próxima acción el envío se bloquea; con acción, envía.
INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket, ruta_storage, mime, tamano_bytes, subido_por
) VALUES (
  'propuesta_revision', (SELECT valor FROM b4e_ids WHERE nombre = 'p2a'), 'pdf',
  'propuesta2.pdf', 'B4E-P2.pdf', 'propuestas-pdf', 'propuesta_revision/p2/dos.pdf',
  'application/pdf', 1024, '00000000-0000-4000-8000-0000000b4e02'
);
INSERT INTO b4e_ids (nombre, valor)
SELECT 'pdf_archivo2', id FROM public.archivos WHERE ruta_storage = 'propuesta_revision/p2/dos.pdf';
SELECT public.registrar_pdf_revision(
  (SELECT valor FROM b4e_ids WHERE nombre = 'p2a'),
  (SELECT valor FROM b4e_ids WHERE nombre = 'pdf_archivo2'),
  repeat('f', 64), '00000000-0000-4000-8000-0000000b4e02');

SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p2a'), 'correo', 'compras@cliente.mx',
    '00000000-0000-4000-8000-0000000b4e02'),
  '23514', 'proxima_accion_requerida', 'El envío exige próxima acción registrada'
);

INSERT INTO public.propuesta_revision_acciones (
  revision_id, codigo, fecha, responsable_id, creado_por
) VALUES (
  (SELECT valor FROM b4e_ids WHERE nombre = 'p2a'), 'B4E_LLAMAR', current_date + 3,
  '00000000-0000-4000-8000-0000000b4e02', '00000000-0000-4000-8000-0000000b4e02'
);
SELECT lives_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4e_ids WHERE nombre = 'p2a'), 'whatsapp', '+52 555 000 0000',
    '00000000-0000-4000-8000-0000000b4e02'),
  'Con la próxima acción registrada, el envío procede'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4e_ids WHERE nombre = 'p2a')),
  'SENT', 'P2 también queda SENT'
);

SELECT * FROM finish();
ROLLBACK;
