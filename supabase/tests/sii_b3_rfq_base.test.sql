-- SII-B3 (ola 1) — Modelo RFQ, folio periódico, estados, ítems y validación LISTO.
-- Verifica: columna/índice/tablas, folio atómico con tope, backfill idempotente,
-- transiciones/CAS/permisos, no-reutilización de ITxx, validación LISTO por
-- sección, privilegios, RLS y Realtime.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(56);

-- C2.2: las transiciones no terminales exigen la próxima acción en la misma operación.
CREATE FUNCTION pg_temp.b3_proxima() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('codigo', 'FOLLOW_UP', 'fecha', current_date,
    'responsable_id', '00000000-0000-4000-8000-00000000b303')
$$;

-- -----------------------------------------------------------------------------
-- Fixtures: usuarios, cliente/contacto, catálogos de prueba y RPCs de apoyo
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b301', 'sii-b3-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b302', 'sii-b3-gerente@prueba.local'),
  ('00000000-0000-4000-8000-00000000b303', 'sii-b3-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-00000000b304', 'sii-b3-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B3'
WHERE id = '00000000-0000-4000-8000-00000000b301';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B3'
WHERE id = '00000000-0000-4000-8000-00000000b302';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B3'
WHERE id = '00000000-0000-4000-8000-00000000b303';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B3'
WHERE id = '00000000-0000-4000-8000-00000000b304';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000b305', 'Cliente RFQ B3 SA de CV', 'RFQ B3', 'activo');
INSERT INTO public.contactos_cliente (id, cliente_id, nombre, es_principal, activo) VALUES
  ('00000000-0000-4000-8000-00000000b306', '00000000-0000-4000-8000-00000000b305',
   'Contacto RFQ B3', true, true);

-- Catálogos de prueba: material sin espesores, material con espesor, procesos
-- con y sin requisito de archivo técnico.
INSERT INTO public.catalogo_materiales (id, codigo, nombre, activo) VALUES
  ('00000000-0000-4000-8000-00000000b330', 'B3_MATERIAL', 'Material B3', true),
  ('00000000-0000-4000-8000-00000000b331', 'B3_MATERIAL_ESP', 'Material B3 con espesor', true);
INSERT INTO public.catalogo_espesores (id, material_id, etiqueta, espesor_mm, activo) VALUES
  ('00000000-0000-4000-8000-00000000b332', '00000000-0000-4000-8000-00000000b331', '3 mm', 3.000, true);
INSERT INTO public.catalogo_procesos (id, codigo, nombre, prefijo_corrida, requiere_archivo_tecnico, activo) VALUES
  ('00000000-0000-4000-8000-00000000b340', 'B3_SIN_ARCH', 'Proceso B3 sin archivo', 'BSS', false, true),
  ('00000000-0000-4000-8000-00000000b341', 'B3_CON_ARCH', 'Proceso B3 con archivo', 'BCA', true, true);

-- Salidas de RPC que se consultan en varias aserciones.
CREATE TEMP TABLE b3_out (clave text PRIMARY KEY, valor jsonb);

-- -----------------------------------------------------------------------------
-- 1-5. Columna, índice y tablas nuevas
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'pipeline', 'estado_rfq', 'pipeline.estado_rfq existe');
SELECT has_column('public', 'pipeline', 'folio_rfq', 'pipeline.folio_rfq existe');
SELECT has_index('public', 'pipeline', 'ux_pipeline_folio_rfq', 'Índice único de folio RFQ');
SELECT has_table('public', 'rfq_items', 'Existe rfq_items');
SELECT has_table('public', 'rfq_item_operaciones', 'Existe rfq_item_operaciones');
SELECT has_table('public', 'rfq_eventos', 'Existe rfq_eventos');

-- -----------------------------------------------------------------------------
-- 6-13. Folio periódico: formato, unicidad, privilegios y tope
-- -----------------------------------------------------------------------------
INSERT INTO public.pipeline (id, folio_op, nombre_contacto, empresa, vendedor_id)
VALUES ('00000000-0000-4000-8000-00000000b311', 'OP-B3-FOLIO-1', 'Contacto', 'Empresa', '00000000-0000-4000-8000-00000000b303');
SELECT ok(
  (SELECT folio_rfq ~ '^RFQ-[0-9]{4}_[0-9]{2,}$' FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311'),
  'El alta asigna folio RFQ-MMYY_XX');
INSERT INTO public.pipeline (id, folio_op, nombre_contacto, empresa, vendedor_id)
VALUES ('00000000-0000-4000-8000-00000000b312', 'OP-B3-FOLIO-2', 'Contacto', 'Empresa', '00000000-0000-4000-8000-00000000b303');
SELECT isnt(
  (SELECT folio_rfq FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311'),
  (SELECT folio_rfq FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b312'),
  'Dos altas reciben folios distintos');
SELECT ok(NOT has_function_privilege('authenticated', 'public.generar_folio_periodico(text)', 'EXECUTE'),
  'authenticated no genera folios');
SELECT ok(has_function_privilege('service_role', 'public.generar_folio_periodico(text)', 'EXECUTE'),
  'service_role genera folios');
SELECT throws_ok($$
  SELECT public.generar_folio_periodico('minusculas')
$$, '22023', 'tipo_folio_invalido', 'Rechaza tipos fuera del formato');
INSERT INTO public.contadores_folio_periodico (tipo, periodo, ultimo)
VALUES ('ZZT', to_char(now(), 'MMYY'), 998);
SELECT is(public.generar_folio_periodico('ZZT'), 'ZZT-' || to_char(now(), 'MMYY') || '_999',
  'Emite el último folio del periodo');
SELECT throws_ok($$
  SELECT public.generar_folio_periodico('ZZT')
$$, '23514', 'folio_periodo_agotado', 'El tope 999 no se desborda');

-- -----------------------------------------------------------------------------
-- 14-22. Backfill idempotente del histórico
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline DISABLE TRIGGER trigger_pipeline_asignar_folio_rfq;

INSERT INTO public.pipeline (
  id, folio_op, etapa, nombre_contacto, empresa, vendedor_id, notas, creado_en
) VALUES (
  '00000000-0000-4000-8000-00000000b310', 'OP-B3-LEGACY', 'negociacion',
  'Contacto legacy', 'Empresa legacy', '00000000-0000-4000-8000-00000000b303',
  'Descripción legacy', '2026-08-15T10:00:00+00'
);
INSERT INTO public.cotizacion_lineas (
  pipeline_id, descripcion, cantidad, material, espesor, procesos, precio_unitario, orden
) VALUES
  ('00000000-0000-4000-8000-00000000b310', 'Pieza legacy A', 3, 'ACERO_CARBON', '3 mm',
   ARRAY['LASER_FIBRA'], 10, 1),
  ('00000000-0000-4000-8000-00000000b310', 'Pieza legacy B', 1, 'X-MATERIAL', 'raro',
   ARRAY['proceso_inventado'], 5, 2);

ALTER TABLE public.pipeline ENABLE TRIGGER trigger_pipeline_asignar_folio_rfq;

SELECT public.backfill_rfq_legacy(); 
SELECT is(
  (SELECT estado_rfq FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b310'),
  'CONVERTED', 'negociacion → CONVERTED en el backfill');
SELECT is(
  (SELECT fecha_solicitud FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b310'),
  '2026-08-15'::date, 'fecha_solicitud toma creado_en');
SELECT is(
  (SELECT responsable_id FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b310'),
  '00000000-0000-4000-8000-00000000b303'::uuid, 'responsable_id toma vendedor_id');
SELECT is(
  (SELECT descripcion_general FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b310'),
  'Descripción legacy', 'descripcion_general toma notas');
SELECT is(
  (SELECT count(*) FROM public.rfq_items
   WHERE rfq_id = '00000000-0000-4000-8000-00000000b310'),
  2::bigint, 'Un ítem por línea histórica');
SELECT is(
  (SELECT codigo FROM public.rfq_items
   WHERE rfq_id = '00000000-0000-4000-8000-00000000b310' AND numero = 1),
  'IT01', 'El código ITxx se deriva del orden');
SELECT is(
  (SELECT material_id FROM public.rfq_items
   WHERE rfq_id = '00000000-0000-4000-8000-00000000b310' AND numero = 1),
  (SELECT id FROM public.catalogo_materiales WHERE codigo = 'ACERO_CARBON'),
  'El material legacy se mapea al catálogo');
SELECT is(
  (SELECT count(*) FROM public.rfq_item_operaciones AS o
   JOIN public.rfq_items AS i ON i.id = o.rfq_item_id
   WHERE i.rfq_id = '00000000-0000-4000-8000-00000000b310' AND i.numero = 1),
  1::bigint, 'El proceso legacy se mapea al catálogo');
SELECT ok(
  (SELECT notas LIKE '%procesos_legacy%' AND notas LIKE '%material_legacy%'
   FROM public.rfq_items
   WHERE rfq_id = '00000000-0000-4000-8000-00000000b310' AND numero = 2),
  'Lo no mapeado queda en notas sin bloquear');
SELECT is(
  (public.backfill_rfq_legacy()->>'items')::integer,
  0, 'El backfill es idempotente (no duplica ítems)');

-- -----------------------------------------------------------------------------
-- 23-33. Estados: permisos, CAS, transiciones, motivo, eventos y puente
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311',
    'cerrar', jsonb_build_object('motivo', 'cierre de prueba',
      'actualizado_en', (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b303')
$$, '42501', 'sin_permiso_rfq', 'Vendedor sin rfq_cerrar no cierra');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311',
    'marcar_incompleto', jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en', now()),
    '00000000-0000-4000-8000-00000000b304')
$$, '42501', 'sin_permiso_rfq', 'Operador no edita RFQ');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311',
    'poner_en_espera_cliente', jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en', '2000-01-01T00:00:00+00'),
    '00000000-0000-4000-8000-00000000b303')
$$, '23514', 'rfq_desactualizado', 'CAS rechaza tokens viejos');
SELECT is(
  public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311', 'poner_en_espera_cliente',
    jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en',
      (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b303'),
  'WAITING_CUSTOMER', 'NEW → WAITING_CUSTOMER');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311', 'poner_en_espera_tecnica',
    jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en',
      (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b303')
$$, '23514', 'rfq_transicion_invalida', 'WAITING_CUSTOMER no pasa a espera técnica');
SELECT is(
  public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311', 'marcar_incompleto',
    jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en',
      (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b303'),
  'INCOMPLETE', 'WAITING_CUSTOMER → INCOMPLETE');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311', 'cerrar',
    jsonb_build_object('motivo', '',
      'actualizado_en', (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b302')
$$, '22023', 'motivo_requerido', 'Cerrar exige motivo');
SELECT is(
  public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b311', 'cerrar',
    jsonb_build_object('motivo', 'sin respuesta del cliente',
      'actualizado_en', (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311')),
    '00000000-0000-4000-8000-00000000b302'),
  'CLOSED', 'Gerente cierra con motivo');
SELECT is(
  (SELECT count(*) FROM public.rfq_eventos WHERE rfq_id = '00000000-0000-4000-8000-00000000b311'),
  3::bigint, 'Cada transición exitosa escribe su rfq_evento');
SELECT is(
  (SELECT etapa FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b311'),
  'prospecto', 'Con el puente retirado, estado_rfq ya no mueve la etapa histórica');

-- La columna histórica tampoco deriva estado_rfq (puente retirado en ola 2).
UPDATE public.pipeline SET etapa = 'contactado'
WHERE id = '00000000-0000-4000-8000-00000000b312';
SELECT is(
  (SELECT estado_rfq FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b312'),
  'NEW', 'La etapa histórica ya no deriva estado_rfq');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b312', 'marcar_listo',
    jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en',
      (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b312')),
    '00000000-0000-4000-8000-00000000b303')
$$, '23514', 'rfq_no_listo', 'Marcar listo revalida en servidor');

-- -----------------------------------------------------------------------------
-- 34-42. Ítems: ITxx, cancelación sin reutilizar, CAS, espesor y operaciones
-- -----------------------------------------------------------------------------
INSERT INTO b3_out (clave, valor)
SELECT 'item1', public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b312',
  jsonb_build_object('descripcion', 'Pieza 1', 'cantidad', 2,
    'material_id', '00000000-0000-4000-8000-00000000b330',
    'proceso_ids', jsonb_build_array('00000000-0000-4000-8000-00000000b340')),
  '00000000-0000-4000-8000-00000000b303');
SELECT is((SELECT valor->>'codigo' FROM b3_out WHERE clave = 'item1'), 'IT01',
  'El primer ítem es IT01');
INSERT INTO b3_out (clave, valor)
SELECT 'item2', public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b312',
  jsonb_build_object('descripcion', 'Pieza 2', 'cantidad', 1),
  '00000000-0000-4000-8000-00000000b303');
SELECT is((SELECT valor->>'codigo' FROM b3_out WHERE clave = 'item2'), 'IT02',
  'El segundo ítem es IT02');
INSERT INTO b3_out (clave, valor)
SELECT 'item2c', public.cancelar_item_rfq(
  (SELECT (valor->>'id')::uuid FROM b3_out WHERE clave = 'item2'),
  'pieza duplicada', '00000000-0000-4000-8000-00000000b303');
SELECT is((SELECT valor->>'estado' FROM b3_out WHERE clave = 'item2c'), 'cancelado',
  'Cancelar conserva el ítem como cancelado');
INSERT INTO b3_out (clave, valor)
SELECT 'item3', public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b312',
  jsonb_build_object('descripcion', 'Pieza 3', 'cantidad', 5),
  '00000000-0000-4000-8000-00000000b303');
SELECT is((SELECT valor->>'codigo' FROM b3_out WHERE clave = 'item3'), 'IT03',
  'IT02 cancelado no se reutiliza: el siguiente es IT03');

INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, bucket, ruta_storage, mime, tamano_bytes, vigente
) VALUES (
  'rfq_item', (SELECT (valor->>'id')::uuid FROM b3_out WHERE clave = 'item3'),
  'DIBUJO', 'pieza3.dxf', 'adjuntos-cotizacion', 'b3/pieza3-v1.dxf',
  'application/octet-stream', 100, true);
SELECT throws_ok($$
  SELECT public.cancelar_item_rfq(
    (SELECT (valor->>'id')::uuid FROM b3_out WHERE clave = 'item3'),
    'ya no se requiere', '00000000-0000-4000-8000-00000000b303')
$$, '23514', 'item_con_documentos', 'No se cancela un ítem con documentos vigentes');

SELECT throws_ok($$
  SELECT public.actualizar_item_rfq(
    (SELECT (valor->>'id')::uuid FROM b3_out WHERE clave = 'item1'),
    jsonb_build_object('descripcion', 'Pieza 1 bis', 'actualizado_en', '2000-01-01T00:00:00+00'),
    '00000000-0000-4000-8000-00000000b303')
$$, '23514', 'item_desactualizado', 'La edición de ítem usa CAS');

SELECT throws_ok($$
  SELECT public.crear_item_rfq(
    '00000000-0000-4000-8000-00000000b312',
    jsonb_build_object('descripcion', 'Pieza con espesor faltante', 'cantidad', 1,
      'material_id', '00000000-0000-4000-8000-00000000b331'),
    '00000000-0000-4000-8000-00000000b303')
$$, '22023', 'espesor_requerido', 'El material con espesores exige espesor');

INSERT INTO b3_out (clave, valor)
SELECT 'item4', public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b312',
  jsonb_build_object('descripcion', 'Pieza con espesor', 'cantidad', 1,
    'material_id', '00000000-0000-4000-8000-00000000b331',
    'espesor_id', '00000000-0000-4000-8000-00000000b332'),
  '00000000-0000-4000-8000-00000000b303');
SELECT is((SELECT valor->>'espesor_id' FROM b3_out WHERE clave = 'item4'),
  '00000000-0000-4000-8000-00000000b332', 'El espesor válido del material se acepta');

INSERT INTO b3_out (clave, valor)
SELECT 'ops', public.reemplazar_operaciones_item(
  (SELECT (valor->>'id')::uuid FROM b3_out WHERE clave = 'item1'),
  ARRAY['00000000-0000-4000-8000-00000000b341'::uuid, '00000000-0000-4000-8000-00000000b340'::uuid],
  '00000000-0000-4000-8000-00000000b303');
SELECT is(jsonb_array_length((SELECT valor FROM b3_out WHERE clave = 'ops')), 2,
  'Reemplazar operaciones deja exactamente las enviadas');

-- -----------------------------------------------------------------------------
-- 43-47. Validación LISTO por secciones
-- -----------------------------------------------------------------------------
INSERT INTO public.pipeline (
  id, folio_op, nombre_contacto, empresa, vendedor_id, cliente_id, contacto_id,
  responsable_id, descripcion_general, canal, fecha_solicitud,
  proxima_accion_codigo, fecha_proxima_accion, responsable_proxima_accion_id
) VALUES (
  '00000000-0000-4000-8000-00000000b320', 'OP-B3-COMPLETO', 'Contacto RFQ B3',
  'Empresa B3', '00000000-0000-4000-8000-00000000b303',
  '00000000-0000-4000-8000-00000000b305', '00000000-0000-4000-8000-00000000b306',
  '00000000-0000-4000-8000-00000000b303', 'Descripción completa', 'correo',
  current_date, 'FOLLOW_UP', current_date, '00000000-0000-4000-8000-00000000b303'
);
SELECT public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b320',
  jsonb_build_object('descripcion', 'Pieza completa', 'cantidad', 1,
    'material_id', '00000000-0000-4000-8000-00000000b330',
    'proceso_ids', jsonb_build_array('00000000-0000-4000-8000-00000000b340')),
  '00000000-0000-4000-8000-00000000b303');
SELECT is(
  (public.validar_rfq_listo('00000000-0000-4000-8000-00000000b320')->>'listo')::boolean,
  true, 'Un RFQ completo está listo (proceso sin archivo obligatorio)');

SELECT public.crear_item_rfq(
  '00000000-0000-4000-8000-00000000b320',
  jsonb_build_object('descripcion', 'Pieza con archivo', 'cantidad', 1,
    'material_id', '00000000-0000-4000-8000-00000000b330',
    'proceso_ids', jsonb_build_array('00000000-0000-4000-8000-00000000b341')),
  '00000000-0000-4000-8000-00000000b303');
SELECT is(
  (public.validar_rfq_listo('00000000-0000-4000-8000-00000000b320')->>'listo')::boolean,
  false, 'Un proceso con archivo obligatorio bloquea LISTO');
SELECT ok(
  (public.validar_rfq_listo('00000000-0000-4000-8000-00000000b320')
    ->'secciones'->'archivos') @> '["archivo técnico (CAD/DIBUJO/ESPECIFICACIONES)"]'::jsonb,
  'El faltante se reporta en la sección Archivos');

INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, bucket, ruta_storage, mime, tamano_bytes, vigente
) VALUES (
  'rfq', '00000000-0000-4000-8000-00000000b320', 'CAD', 'conjunto.dwg',
  'adjuntos-cotizacion', 'b3/conjunto-v1.dwg', 'application/octet-stream', 200, true);
SELECT is(
  (public.validar_rfq_listo('00000000-0000-4000-8000-00000000b320')->>'listo')::boolean,
  true, 'Con archivo técnico vigente el RFQ queda listo');
SELECT is(
  public.cambiar_estado_rfq(
    '00000000-0000-4000-8000-00000000b320', 'marcar_listo',
    jsonb_build_object('proxima_accion', pg_temp.b3_proxima(), 'actualizado_en',
      (SELECT actualizado_en FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b320')),
    '00000000-0000-4000-8000-00000000b303'),
  'READY_FOR_PROPOSAL', 'marcar_listo transiciona cuando no hay faltantes');

-- -----------------------------------------------------------------------------
-- 48-54. Privilegios, RLS y Realtime
-- -----------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('authenticated',
  'public.validar_rfq_listo(uuid)', 'EXECUTE'),
  'authenticated no ejecuta validar_rfq_listo');
SELECT ok(has_function_privilege('service_role',
  'public.validar_rfq_listo(uuid)', 'EXECUTE'),
  'service_role ejecuta validar_rfq_listo');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.cambiar_estado_rfq(uuid,text,jsonb,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta cambiar_estado_rfq');
SELECT ok(has_function_privilege('service_role',
  'public.cambiar_estado_rfq(uuid,text,jsonb,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta cambiar_estado_rfq');
SELECT ok(has_table_privilege('authenticated', 'public.rfq_items', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.rfq_items', 'INSERT'),
  'rfq_items es solo lectura para authenticated');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rfq_items'::regclass),
  'rfq_items tiene RLS habilitado');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rfq_items'
), 'rfq_items está publicada en Realtime');

SELECT * FROM finish();
ROLLBACK;
