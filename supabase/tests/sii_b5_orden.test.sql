-- SII-B5 â€” Orden de trabajo: nacimiento desde revisiÃ³n aceptada, snapshot,
-- folio O-/OI-, estados derivados, cierre administrativo y TI autorizada.
-- Verifica: idempotencia, rechazo de revisiÃ³n no aceptada, reconstrucciÃ³n del
-- snapshot tras mutar el origen, backfill/puente, derivaciones y privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(66);

-- -----------------------------------------------------------------------------
-- 0. Actores
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b5a02', 'sii-b5-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000b5a03', 'sii-b5-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000000b5a04', 'sii-b5-operador@prueba.local');
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B5'
WHERE id = '00000000-0000-4000-8000-0000000b5a02';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B5'
WHERE id = '00000000-0000-4000-8000-0000000b5a03';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B5'
WHERE id = '00000000-0000-4000-8000-0000000b5a04';

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('orden_vista', 'ordenes', 'Ver Ã³rdenes'),
  ('orden_editar', 'ordenes', 'Editar orden'),
  ('orden_liberar', 'ordenes', 'Liberar orden'),
  ('orden_cerrar_admin', 'ordenes', 'Cierre administrativo'),
  ('orden_crear_interna', 'ordenes', 'Crear orden interna')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('gerente', 'orden_vista'),
  ('gerente', 'orden_editar'),
  ('gerente', 'orden_liberar'),
  ('gerente', 'orden_cerrar_admin'),
  ('gerente', 'orden_crear_interna')
ON CONFLICT (rol, permiso) DO NOTHING;

-- Los fixtures de propuestas escriben sobre revisiones no DRAFT.
SELECT set_config('sii.b4_rpc', 'on', true);

-- -----------------------------------------------------------------------------
-- 1. CatÃ¡logos, cliente, RFQ, propuesta aceptada y archivo vivo
-- -----------------------------------------------------------------------------
INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('B5MAT', 'Acero B5');
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, 'B5 6mm', 6 FROM public.catalogo_materiales WHERE codigo = 'B5MAT';
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida)
VALUES ('B5CORTE', 'Corte B5', 'BCT'), ('B5DOB', 'Doblado B5', 'BDB');
INSERT INTO public.grupos_equipo (codigo, nombre) VALUES ('B5EQ', 'Equipo B5');
INSERT INTO public.grupos_planeados (codigo, nombre) VALUES ('B5PL', 'Planeado B5');

INSERT INTO public.clientes (nombre_comercial, razon_social, estado, condiciones_pago, limite_credito)
VALUES ('B5 Cliente', 'B5 Cliente SA de CV', 'activo', 'contado', 0);

CREATE TEMP TABLE b5_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b5_ids (nombre, valor)
SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'B5 Cliente SA de CV';
INSERT INTO b5_ids (nombre, valor)
SELECT 'material', id FROM public.catalogo_materiales WHERE codigo = 'B5MAT';
INSERT INTO b5_ids (nombre, valor)
SELECT 'espesor', e.id FROM public.catalogo_espesores AS e
JOIN public.catalogo_materiales AS m ON m.id = e.material_id WHERE m.codigo = 'B5MAT';
INSERT INTO b5_ids (nombre, valor)
SELECT 'proceso', id FROM public.catalogo_procesos WHERE codigo = 'B5CORTE';
INSERT INTO b5_ids (nombre, valor)
SELECT 'proceso2', id FROM public.catalogo_procesos WHERE codigo = 'B5DOB';

INSERT INTO public.pipeline (
  folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id,
  moneda, iva_porcentaje, fecha_requerida, prioridad
) VALUES
  ('OP-B5-0001', 'negociacion', 'READY_FOR_PROPOSAL', 'Ana B5', 'B5 Empresa',
   (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b5a02', 'MXN', 16, now() + interval '10 days', 'alta'),
  ('OP-B5-0002', 'negociacion', 'READY_FOR_PROPOSAL', 'Beto B5', 'B5 Interna',
   (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b5a02', 'MXN', 16, now() + interval '20 days', 'normal');

UPDATE public.pipeline SET es_orden_interna = true WHERE folio_op = 'OP-B5-0002';

INSERT INTO b5_ids (nombre, valor)
SELECT 'rfq1', id FROM public.pipeline WHERE folio_op = 'OP-B5-0001';
INSERT INTO b5_ids (nombre, valor)
SELECT 'rfq2', id FROM public.pipeline WHERE folio_op = 'OP-B5-0002';

-- Propuesta P1 con revisiÃ³n A aceptada y revisiÃ³n B enviada (rechazo).
INSERT INTO public.propuestas (
  rfq_id, cliente_id, folio_cnc, estado, responsable_id, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'rfq1'),
  (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
  'CNC-9001_01', 'ACCEPTED', '00000000-0000-4000-8000-0000000b5a03',
  '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'propuesta1', id FROM public.propuestas WHERE folio_cnc = 'CNC-9001_01';

INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, snapshot_cabecera, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'propuesta1'), 'A', 'CNC-9001_01-A',
  'ACCEPTED',
  jsonb_build_object(
    'version', 1,
    'cliente_id', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
    'cliente', jsonb_build_object('razon_social', 'B5 Cliente SA de CV'),
    'moneda', 'MXN', 'condiciones_pago', 'contado', 'iva_porcentaje', 16,
    'folio_rfq', 'RFQ-9001_01'
  ),
  '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'revision1', id FROM public.propuesta_revisiones WHERE folio_revision = 'CNC-9001_01-A';
UPDATE public.propuestas
SET accepted_revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1'),
    revision_vigente_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1')
WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'propuesta1');

INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, snapshot_cabecera, motivo_creacion, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'propuesta1'), 'B', 'CNC-9001_01-B',
  'SENT', '{}'::jsonb, 'RevisiÃ³n de prueba B5', '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'revision2', id FROM public.propuesta_revisiones WHERE folio_revision = 'CNC-9001_01-B';

INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, snapshot_cabecera, motivo_creacion, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'propuesta1'), 'C', 'CNC-9001_01-C',
  'DRAFT', '{}'::jsonb, 'Revisión borrador B5', '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'revision_draft', id FROM public.propuesta_revisiones WHERE folio_revision = 'CNC-9001_01-C';

-- Ãtems IT01 (2Ã—100), IT02 (1Ã—50) y descuento IT03 (1Ã—10, no fabricable).
INSERT INTO public.propuesta_items (
  revision_id, codigo, descripcion, cantidad, material_id, espesor_id, precio_unitario, es_descuento
) VALUES
  ((SELECT valor FROM b5_ids WHERE nombre = 'revision1'), 'IT01', 'Pieza B5 uno', 2,
   (SELECT valor FROM b5_ids WHERE nombre = 'material'),
   (SELECT valor FROM b5_ids WHERE nombre = 'espesor'), 100, false),
  ((SELECT valor FROM b5_ids WHERE nombre = 'revision1'), 'IT02', 'Pieza B5 dos', 1, NULL, NULL, 50, false),
  ((SELECT valor FROM b5_ids WHERE nombre = 'revision1'), 'IT03', 'Descuento B5', 1, NULL, NULL, 10, true);

INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b5_ids WHERE nombre = 'proceso'), 0
FROM public.propuesta_items AS i
WHERE i.revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1') AND i.codigo = 'IT01';
INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b5_ids WHERE nombre = 'proceso'), 0
FROM public.propuesta_items AS i
WHERE i.revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1') AND i.codigo = 'IT02';

INSERT INTO public.propuesta_item_ruteo (
  item_id, secuencia, proceso_id, setup_horas, run_horas
)
SELECT i.id, 1, (SELECT valor FROM b5_ids WHERE nombre = 'proceso'), 0.5, 1.5
FROM public.propuesta_items AS i
WHERE i.revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1') AND i.codigo = 'IT01';
INSERT INTO public.propuesta_item_ruteo (
  item_id, secuencia, proceso_id, setup_horas, run_horas
)
SELECT i.id, 1, (SELECT valor FROM b5_ids WHERE nombre = 'proceso2'), 0, 1
FROM public.propuesta_items AS i
WHERE i.revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1') AND i.codigo = 'IT02';

INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket, ruta_storage, mime, tamano_bytes,
  subido_por
) VALUES (
  'propuesta_revision', (SELECT valor FROM b5_ids WHERE nombre = 'revision1'), 'tecnico',
  'plano-b5.dxf', 'CNC-9001_01-A_IT01_DXF.dxf', 'adjuntos-cotizacion',
  'b5/prueba/plano.dxf', 'application/dxf', 1024, '00000000-0000-4000-8000-0000000b5a03'
);

-- Propuesta interna P2 con revisiÃ³n A aceptada.
INSERT INTO public.propuestas (
  rfq_id, cliente_id, folio_cnc, estado, responsable_id, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'rfq2'),
  (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
  'CNC-9001_02', 'ACCEPTED', '00000000-0000-4000-8000-0000000b5a03',
  '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'propuesta2', id FROM public.propuestas WHERE folio_cnc = 'CNC-9001_02';
INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, snapshot_cabecera, creado_por
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'propuesta2'), 'A', 'CNC-9001_02-A',
  'ACCEPTED', jsonb_build_object('version', 1, 'moneda', 'MXN', 'iva_porcentaje', 16),
  '00000000-0000-4000-8000-0000000b5a03'
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'revision3', id FROM public.propuesta_revisiones WHERE folio_revision = 'CNC-9001_02-A';
UPDATE public.propuestas
SET accepted_revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision3'),
    revision_vigente_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision3')
WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'propuesta2');
INSERT INTO public.propuesta_items (
  revision_id, codigo, descripcion, cantidad, precio_unitario, es_descuento
) VALUES (
  (SELECT valor FROM b5_ids WHERE nombre = 'revision3'), 'IT01', 'TI B5', 1, 0, false
);
INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b5_ids WHERE nombre = 'proceso'), 0
FROM public.propuesta_items AS i
WHERE i.revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision3');

-- Recursos de planeaciÃ³n para programar la orden comercial.
INSERT INTO public.recursos_planeacion (codigo, area, nombre)
VALUES ('B5-LASER', 'sheet_metal', 'LÃ¡ser B5');

-- Orden temporal para probar el puente de estados.
INSERT INTO public.ordenes_produccion (folio, cliente_id, estado, fecha_compromiso)
VALUES ('OP-999001', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'), 'borrador', now() + interval '3 days');

-- -----------------------------------------------------------------------------
-- 2. Estructura y privilegios
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'orden_eventos_cambio', 'Existe orden_eventos_cambio');
SELECT has_column('public', 'ordenes_produccion', 'estado_sii', 'ordenes_produccion.estado_sii existe');
SELECT has_column('public', 'partidas_orden_produccion', 'codigo_item', 'partidas.codigo_item existe');
SELECT has_index('public', 'ordenes_produccion', 'ux_ordenes_folio_sii', 'Ãndice Ãºnico ux_ordenes_folio_sii');
SELECT has_index('public', 'ordenes_produccion', 'ux_ordenes_revision_unica', 'Ãndice Ãºnico por revisiÃ³n');
SELECT ok(has_function_privilege('service_role',
  'public.crear_orden_desde_revision(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta crear_orden_desde_revision');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_orden_desde_revision(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_orden_desde_revision');
SELECT ok(has_function_privilege('service_role',
  'public.crear_orden_interna(jsonb,jsonb,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta crear_orden_interna');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_orden_interna(jsonb,jsonb,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_orden_interna');

-- -----------------------------------------------------------------------------
-- 3. Backfill y puente temporal
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM public.ordenes_produccion WHERE estado_sii IS NULL),
  0,
  'El backfill deja estado_sii en todas las Ã³rdenes'
);
SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.ordenes_produccion AS orden
  WHERE orden.folio = 'OP-999001'
    AND (
      (orden.estado = 'borrador' AND orden.estado_sii <> 'CONFIRMADA')
      OR (orden.estado = 'en_proceso' AND orden.estado_sii <> 'EN_PRODUCCION')
      OR (orden.estado = 'completada' AND orden.estado_sii NOT IN ('PRODUCCION_COMPLETADA', 'CERRADA'))
      OR (orden.estado = 'cancelada' AND orden.estado_sii <> 'CANCELADA')
      OR (orden.estado = 'programada' AND orden.estado_sii NOT IN ('PLANIFICADA', 'LISTA'))
    )
), 'El puente mantiene coherentes estado y estado_sii en el fixture');

-- El puente también deriva en INSERT: solo un lado explícito.
INSERT INTO public.ordenes_produccion (folio, cliente_id, estado, fecha_compromiso)
VALUES ('OP-999002', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'), 'en_proceso', now() + interval '3 days');
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE folio = 'OP-999002'),
  'EN_PRODUCCION',
  'En INSERT, el estado legacy explícito deriva estado_sii'
);
INSERT INTO public.ordenes_produccion (folio, cliente_id, estado_sii, fecha_compromiso)
VALUES ('OP-999003', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'), 'LISTA', now() + interval '3 days');
SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE folio = 'OP-999003'),
  'programada',
  'En INSERT, el estado_sii explícito deriva el legacy'
);

UPDATE public.ordenes_produccion SET estado = 'programada' WHERE folio = 'OP-999001';
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE folio = 'OP-999001'),
  'PLANIFICADA',
  'Actualizar el estado legacy actualiza estado_sii'
);
UPDATE public.ordenes_produccion SET estado_sii = 'LISTA' WHERE folio = 'OP-999001';
SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE folio = 'OP-999001'),
  'programada',
  'Actualizar estado_sii actualiza el estado legacy'
);

-- -----------------------------------------------------------------------------
-- 4. Orden comercial desde la revisiÃ³n aceptada
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.crear_orden_desde_revision(%L, %L)',
    (SELECT valor::text FROM b5_ids WHERE nombre = 'revision_draft'),
    '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'revision_no_aceptada',
  'Una revisión DRAFT no genera orden'
);
SELECT throws_ok(
  format('SELECT public.crear_orden_desde_revision(%L, %L)',
    (SELECT valor::text FROM b5_ids WHERE nombre = 'revision2'),
    '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'revision_no_aceptada',
  'Una revisión SENT no genera orden'
);

CREATE TEMP TABLE b5_resultado AS
SELECT * FROM public.crear_orden_desde_revision(
  (SELECT valor FROM b5_ids WHERE nombre = 'revision1'),
  '00000000-0000-4000-8000-0000000b5a03',
  gen_random_uuid()
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'orden', id FROM b5_resultado;

SELECT is((SELECT ya_existia FROM b5_resultado), false, 'El primer alta no es idempotente');
SELECT matches(
  (SELECT folio_sii FROM b5_resultado), '^O-[0-9]{4}_[0-9]{2,3}$',
  'La orden comercial usa folio O-MMYY_XX'
);
SELECT is(
  (SELECT folio FROM b5_resultado), (SELECT folio_sii FROM b5_resultado),
  'El folio legacy espeja al folio SII en Ã³rdenes nuevas'
);
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'CONFIRMADA', 'La orden nace CONFIRMADA'
);
SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'borrador', 'El estado legacy espeja borrador'
);
SELECT is(
  (SELECT propuesta_revision_id FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  (SELECT valor FROM b5_ids WHERE nombre = 'revision1'),
  'La orden queda ligada a la revisiÃ³n exacta'
);
SELECT is(
  (SELECT count(*)::integer FROM public.partidas_orden_produccion
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  2, 'Solo los Ã­tems fabricables se vuelven partidas (excluye descuento)'
);
SELECT is(
  (SELECT string_agg(codigo_item, ',' ORDER BY codigo_item) FROM public.partidas_orden_produccion
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'IT01,IT02', 'Las partidas conservan el ITxx'
);
SELECT is(
  (SELECT jsonb_array_length(snapshot_json -> 'items') FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  3, 'El snapshot conserva tambiÃ©n el Ã­tem de descuento'
);
SELECT is(
  (SELECT snapshot_json -> 'origen' ->> 'revision_id' FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  (SELECT valor::text FROM b5_ids WHERE nombre = 'revision1'),
  'El snapshot registra la revisiÃ³n de origen'
);
SELECT is(
  (SELECT jsonb_array_length(snapshot_json -> 'archivos') FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  1, 'El snapshot congela el archivo vivo de la revisiÃ³n'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1')),
  'SALE_CONFIRMED', 'La orden confirma la venta de la revisiÃ³n'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  1, 'La orden crea su AR no cobrable'
);
SELECT ok((
  SELECT cuenta.estado = 'pendiente' AND cuenta.cobrable_desde IS NULL
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')
), 'La AR nace pendiente y no cobrable');
SELECT is(
  (SELECT monto_total FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  278.4::numeric, 'La AR usa el total de la revisiÃ³n (240 + IVA)'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden') AND tipo = 'orden_creada'),
  1, 'La creaciÃ³n deja su evento con correlationId'
);
SELECT is(
  (SELECT ya_existia FROM public.crear_orden_desde_revision(
    (SELECT valor FROM b5_ids WHERE nombre = 'revision1'),
    '00000000-0000-4000-8000-0000000b5a03')),
  true, 'Repetir el alta devuelve ya_existia'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ordenes_produccion
   WHERE propuesta_revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1')),
  1, 'No se duplica la orden de la revisiÃ³n'
);

-- Snapshot reconstruible: mutar el origen no cambia la orden.
CREATE TEMP TABLE b5_snapshot_antes AS
SELECT snapshot_json FROM public.ordenes_produccion
WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden');
UPDATE public.propuesta_items
SET descripcion = 'Pieza mutada despuÃ©s', precio_unitario = 999
WHERE revision_id = (SELECT valor FROM b5_ids WHERE nombre = 'revision1') AND codigo = 'IT01';
SELECT is(
  (SELECT snapshot_json FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  (SELECT snapshot_json FROM b5_snapshot_antes),
  'El snapshot no depende del origen vivo'
);
SELECT is(
  (SELECT snapshot_json #>> '{items,0,descripcion}' FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'Pieza B5 uno', 'El Ã­tem congelado conserva su descripciÃ³n original'
);

-- -----------------------------------------------------------------------------
-- 5. Orden interna desde pipeline (es_orden_interna) y alta directa TI
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE b5_resultado_interna AS
SELECT * FROM public.crear_orden_desde_revision(
  (SELECT valor FROM b5_ids WHERE nombre = 'revision3'),
  '00000000-0000-4000-8000-0000000b5a03',
  gen_random_uuid()
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'orden_interna', id FROM b5_resultado_interna;

SELECT matches(
  (SELECT folio_sii FROM b5_resultado_interna), '^OI-[0-9]{4}_[0-9]{2,3}$',
  'La orden interna usa folio OI-MMYY_XX'
);
SELECT ok((
  SELECT es_interna AND estado_sii = 'CONFIRMADA'
  FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_interna')
), 'La orden interna nace CONFIRMADA y marcada es_interna');
SELECT is(
  (SELECT count(*)::integer FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_interna')),
  0, 'La orden interna no genera AR'
);
SELECT is(
  (SELECT snapshot_json -> 'es_interna' FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_interna')),
  'true'::jsonb, 'El snapshot interno se marca como tal'
);

CREATE TEMP TABLE b5_resultado_ti AS
SELECT * FROM public.crear_orden_interna(
  jsonb_build_object(
    'cliente_id', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
    'fecha_compromiso', '2026-11-01T18:00:00Z',
    'prioridad', 'normal',
    'descripcion', 'Mantenimiento interno',
    'items', jsonb_build_array(jsonb_build_object(
      'descripcion', 'Base TI', 'cantidad', 1, 'material', 'ACERO_CARBON', 'espesor', '6 mm',
      'procesos', jsonb_build_array('Corte'), 'tiempo_estimado_minutos', 30
    ))
  ),
  jsonb_build_object('motivo', 'Mantenimiento interno autorizado'),
  '00000000-0000-4000-8000-0000000b5a03',
  gen_random_uuid()
);
INSERT INTO b5_ids (nombre, valor)
SELECT 'orden_ti', id FROM b5_resultado_ti;

SELECT is((SELECT ya_existia FROM b5_resultado_ti), false, 'El alta directa TI no es idempotente');
SELECT matches(
  (SELECT folio_sii FROM b5_resultado_ti), '^OI-[0-9]{4}_[0-9]{2,3}$',
  'El alta directa TI usa folio OI-'
);
SELECT is(
  (SELECT snapshot_json -> 'origen' ->> 'tipo' FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti')),
  'ORDEN_INTERNA', 'El snapshot TI declara su origen'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti')),
  0, 'La TI de alta directa no genera AR'
);
SELECT throws_ok(format(
  'SELECT public.crear_orden_interna(%L, %L, %L)',
  jsonb_build_object('cliente_id', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
    'fecha_compromiso', '2026-11-01T18:00:00Z',
    'items', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'cantidad', 1)))::text,
  jsonb_build_object('motivo', 'ok')::text,
  '00000000-0000-4000-8000-0000000b5a03'),
  '22023', 'motivo_autorizacion_requerido', 'La TI exige motivo de autorizaciÃ³n');
SELECT throws_ok(format(
  'SELECT public.crear_orden_interna(%L, %L, %L)',
  jsonb_build_object('cliente_id', (SELECT valor FROM b5_ids WHERE nombre = 'cliente'),
    'fecha_compromiso', '2026-11-01T18:00:00Z',
    'items', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'cantidad', 1)))::text,
  jsonb_build_object('motivo', 'Mantenimiento autorizado')::text,
  '00000000-0000-4000-8000-0000000b5a02'),
  '42501', 'sin_permiso_orden_interna', 'Un vendedor no autoriza TI');

-- -----------------------------------------------------------------------------
-- 6. Derivaciones de estado y cierre
-- -----------------------------------------------------------------------------
SELECT throws_ok(format(
  'SELECT public.liberar_orden(%L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden_interna'), now()::text,
  '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'transicion_invalida', 'No se libera una orden CONFIRMADA');

INSERT INTO public.programacion_areas (
  orden_id, partida_id, recurso_id, fecha_programada, turno, horas_estimadas, secuencia
)
SELECT
  (SELECT valor FROM b5_ids WHERE nombre = 'orden'),
  partida.id,
  (SELECT id FROM public.recursos_planeacion WHERE codigo = 'B5-LASER'),
  current_date, 'matutino', 2, 1
FROM public.partidas_orden_produccion AS partida
WHERE partida.orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')
  AND partida.codigo_item = 'IT01';
INSERT INTO public.programacion_areas (
  orden_id, partida_id, recurso_id, fecha_programada, turno, horas_estimadas, secuencia
)
SELECT
  (SELECT valor FROM b5_ids WHERE nombre = 'orden'),
  partida.id,
  (SELECT id FROM public.recursos_planeacion WHERE codigo = 'B5-LASER'),
  current_date + 1, 'matutino', 2, 1
FROM public.partidas_orden_produccion AS partida
WHERE partida.orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')
  AND partida.codigo_item = 'IT02';

SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'PLANIFICADA', 'Con todas las partidas programadas la orden pasa a PLANIFICADA'
);

SELECT throws_ok(format(
  'SELECT public.liberar_orden(%L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden'), '2000-01-01T00:00:00Z'::text,
  '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'orden_desactualizada', 'Liberar exige el CAS vigente');

SELECT lives_ok(format(
  'SELECT public.liberar_orden(%L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden'),
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  '00000000-0000-4000-8000-0000000b5a03'),
  'Liberar una orden planificada con programaciÃ³n, ruteo y archivos vivos');
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'LISTA', 'La orden liberada queda LISTA'
);
SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'programada', 'El puente mantiene el estado legacy de LISTA'
);

INSERT INTO public.sesiones_trabajo (orden_id, partida_id, programacion_id, operador_id)
SELECT
  (SELECT valor FROM b5_ids WHERE nombre = 'orden'),
  programacion.partida_id, programacion.id,
  '00000000-0000-4000-8000-0000000b5a04'
FROM public.programacion_areas AS programacion
WHERE programacion.orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')
ORDER BY programacion.secuencia, programacion.creado_en
LIMIT 1;

SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'EN_PRODUCCION', 'La primera sesiÃ³n pone la orden EN_PRODUCCION sin acciÃ³n manual'
);
SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'en_proceso', 'El puente acompaÃ±a la sesiÃ³n en el estado legacy'
);

INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap, meta_proceso_id
)
SELECT meta.partida_id, '00000000-0000-4000-8000-0000000b5a04', meta.meta_piezas, 0, meta.id
FROM public.metas_proceso_partida AS meta
JOIN public.partidas_orden_produccion AS partida ON partida.id = meta.partida_id
WHERE partida.orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden');

SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'PRODUCCION_COMPLETADA', 'Al cumplir todas las metas la orden queda PRODUCCION_COMPLETADA'
);

SELECT throws_ok(format(
  'SELECT public.cerrar_orden_administrativa(%L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden'),
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'orden_no_entregada_completa', 'El cierre administrativo exige el 100 % entregado');

INSERT INTO public.notas_entrega (folio, orden_id, recibido_por, creado_por)
VALUES ('NE-000001', (SELECT valor FROM b5_ids WHERE nombre = 'orden'),
  'RecepciÃ³n B5', '00000000-0000-4000-8000-0000000b5a03');
INSERT INTO public.partidas_nota_entrega (nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada)
SELECT nota.id, partida.id, partida.cantidad_solicitada, partida.cantidad_solicitada
FROM public.notas_entrega AS nota
JOIN public.partidas_orden_produccion AS partida ON partida.orden_id = nota.orden_id
WHERE nota.folio = 'NE-000001';

SELECT lives_ok(format(
  'SELECT public.cerrar_orden_administrativa(%L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden'),
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  '00000000-0000-4000-8000-0000000b5a03'),
  'Cierre administrativo con el 100 % entregado');
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'CERRADA', 'La orden queda CERRADA'
);
SELECT ok((
  SELECT cerrada_admin_en IS NOT NULL AND cerrada_admin_por IS NOT NULL
  FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')
), 'El cierre registra fecha y actor');
SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  'pendiente', 'El cierre administrativo no cobra la AR'
);

SELECT throws_ok(format(
  'SELECT public.ajustar_orden_post_aceptacion(%L, %L, %L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden'),
  jsonb_build_object('prioridad', 'alta')::text, 'Cambio tardÃ­o solicitado',
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden')),
  '00000000-0000-4000-8000-0000000b5a03'),
  '23514', 'orden_en_produccion', 'Una orden cerrada ya no admite ajustes');

-- Ajuste vÃ¡lido sobre la TI aÃºn CONFIRMADA.
SELECT lives_ok(format(
  'SELECT public.ajustar_orden_post_aceptacion(%L, %L, %L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden_ti'),
  jsonb_build_object('prioridad', 'alta', 'notas', 'Ajustada por el cliente')::text,
  'Cambio solicitado por el cliente',
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti')),
  '00000000-0000-4000-8000-0000000b5a03'),
  'La orden pre-producciÃ³n admite ajustes con motivo');
SELECT is(
  (SELECT prioridad FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti')),
  'alta', 'El ajuste aplica la prioridad'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti') AND tipo = 'ajuste_post_aceptacion'),
  1, 'El ajuste deja evento trazable'
);
SELECT throws_ok(format(
  'SELECT public.ajustar_orden_post_aceptacion(%L, %L, %L, %L, %L)',
  (SELECT valor::text FROM b5_ids WHERE nombre = 'orden_ti'),
  jsonb_build_object('prioridad', 'baja')::text, 'no',
  (SELECT actualizado_en::text FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b5_ids WHERE nombre = 'orden_ti')),
  '00000000-0000-4000-8000-0000000b5a03'),
  '22023', 'motivo_requerido', 'El ajuste exige motivo de 3 a 500 caracteres');

SELECT * FROM finish();
ROLLBACK;
