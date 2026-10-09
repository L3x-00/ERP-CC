-- SII-B4 — Propuestas: alta desde RFQ, revisiones, congelamiento, totales y aceptación.
-- Verifica: folio CNC-MMYY_XX(-A) único, ITxx intacto, motivo obligatorio y copia
-- profunda, tope Z, flags "Requiere revisión", frozen, aceptar revisión anterior,
-- totales/margen, privilegios y RLS de lectura.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
-- El arnés de pruebas escribe fixtures: se declara el rol de servicio para los
-- triggers de protección de columnas de `pipeline` (mismo camino que la app).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(88);

-- -----------------------------------------------------------------------------
-- 0. Actores
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b4a01', 'sii-b4-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4a02', 'sii-b4-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4a03', 'sii-b4-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4a04', 'sii-b4-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000b4a05', 'sii-b4-ajeno@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B4'
WHERE id = '00000000-0000-4000-8000-0000000b4a01';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B4'
WHERE id = '00000000-0000-4000-8000-0000000b4a02';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B4'
WHERE id = '00000000-0000-4000-8000-0000000b4a03';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B4'
WHERE id = '00000000-0000-4000-8000-0000000b4a04';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor ajeno B4'
WHERE id = '00000000-0000-4000-8000-0000000b4a05';

-- Matriz de permisos del catálogo (la BD de prueba parte vacía): vendedor
-- captura/valida/envía; gerente además costea, acepta y cierra.
INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('propuesta_vista', 'propuestas', 'Ver propuestas'),
  ('propuesta_editar_articulo', 'propuestas', 'Editar artículos/cantidades'),
  ('propuesta_editar_precio', 'propuestas', 'Editar precios'),
  ('propuesta_editar_ruteo', 'propuestas', 'Editar ruteo'),
  ('propuesta_editar_costo', 'propuestas', 'Editar costo interno'),
  ('propuesta_validar', 'propuestas', 'Validar revisión'),
  ('propuesta_seguimiento', 'propuestas', 'Registrar seguimiento'),
  ('propuesta_crear_revision', 'propuestas', 'Crear nueva revisión'),
  ('propuesta_aceptar', 'propuestas', 'Aceptar revisión'),
  ('propuesta_cerrar', 'propuestas', 'Rechazar o cerrar'),
  ('ver_pipeline_equipo', 'comercial', 'Ver pipeline del equipo')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('vendedor', 'propuesta_vista'),
  ('vendedor', 'propuesta_editar_articulo'),
  ('vendedor', 'propuesta_editar_precio'),
  ('vendedor', 'propuesta_editar_ruteo'),
  ('vendedor', 'propuesta_validar'),
  ('vendedor', 'propuesta_seguimiento'),
  ('vendedor', 'propuesta_crear_revision'),
  ('gerente', 'propuesta_vista'),
  ('gerente', 'propuesta_editar_costo'),
  ('gerente', 'propuesta_aceptar'),
  ('gerente', 'propuesta_cerrar'),
  ('gerente', 'ver_pipeline_equipo')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Catálogos, cliente y RFQs de prueba
-- -----------------------------------------------------------------------------
INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('B4MAT', 'Acero B4');
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, 'B4 6mm', 6 FROM public.catalogo_materiales WHERE codigo = 'B4MAT';
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida)
VALUES ('B4CORTE', 'Corte B4', 'BCRT');
INSERT INTO public.grupos_equipo (codigo, nombre) VALUES ('B4EQ', 'Equipo B4');
INSERT INTO public.grupos_planeados (codigo, nombre) VALUES ('B4PL', 'Planeado B4');
INSERT INTO public.catalogo_proximas_acciones (codigo, nombre) VALUES ('B4_LLAMAR', 'Llamar B4');
-- Solo puede existir una acción "Otro" (índice único parcial): si la semilla de
-- B1 ya la trae (instalación real), se reutiliza.
INSERT INTO public.catalogo_proximas_acciones (codigo, nombre, es_otro)
SELECT 'B4_OTHER', 'Otro B4', true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogo_proximas_acciones WHERE es_otro);

INSERT INTO public.clientes (nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('B4 Cliente', 'B4 Cliente SA de CV', 'activo', 'contado');

CREATE TEMP TABLE b4_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b4_ids (nombre, valor)
SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'B4 Cliente SA de CV';
INSERT INTO b4_ids (nombre, valor)
SELECT 'espesor', e.id FROM public.catalogo_espesores AS e
JOIN public.catalogo_materiales AS m ON m.id = e.material_id WHERE m.codigo = 'B4MAT';
INSERT INTO b4_ids (nombre, valor)
SELECT 'proceso', id FROM public.catalogo_procesos WHERE codigo = 'B4CORTE';

-- RFQ1 (flujo principal), RFQ2 (rechazo/cierre), RFQ3 (backfill), RFQ4 (no apto),
-- RFQ5 (tope Z), RFQ6 (sin cliente).
INSERT INTO public.pipeline (
  folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id,
  moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud,
  proxima_accion_codigo, fecha_proxima_accion, responsable_proxima_accion_id
) VALUES
  ('OP-B4-0001', 'negociacion', 'READY_FOR_PROPOSAL', 'Ana B4', 'B4 Empresa 1',
   (SELECT valor FROM b4_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo',
   current_date, 'B4_LLAMAR', current_date + 7, '00000000-0000-4000-8000-0000000b4a02'),
  ('OP-B4-0002', 'negociacion', 'READY_FOR_PROPOSAL', 'Beto B4', 'B4 Empresa 2',
   (SELECT valor FROM b4_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo',
   current_date, NULL, NULL, NULL),
  ('OP-B4-0003', 'cotizado', 'NEW', 'Carla B4', 'B4 Empresa 3',
   (SELECT valor FROM b4_ids WHERE nombre = 'cliente'),
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo',
   current_date, NULL, NULL, NULL);

UPDATE public.pipeline SET folio_cnc = 'CNC-1000-0001' WHERE folio_op = 'OP-B4-0003';

INSERT INTO public.pipeline (
  folio_op, etapa, estado_rfq, nombre_contacto, empresa, vendedor_id,
  moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud
) VALUES
  ('OP-B4-0004', 'prospecto', 'NEW', 'Dora B4', 'B4 Empresa 4',
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo', current_date),
  ('OP-B4-0005', 'negociacion', 'READY_FOR_PROPOSAL', 'Eva B4', 'B4 Empresa 5',
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo', current_date),
  ('OP-B4-0006', 'negociacion', 'READY_FOR_PROPOSAL', 'Fabián B4', 'B4 Empresa 6',
   '00000000-0000-4000-8000-0000000b4a02', 'MXN', 16, 'Descripción B4', 'correo', current_date);

-- RFQ histórico sin cliente (el backfill debe omitirlo, no inventarlo).
UPDATE public.pipeline SET folio_cnc = 'CNC-1000-0004' WHERE folio_op = 'OP-B4-0004';

INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq1', id FROM public.pipeline WHERE folio_op = 'OP-B4-0001';
INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq2', id FROM public.pipeline WHERE folio_op = 'OP-B4-0002';
INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq3', id FROM public.pipeline WHERE folio_op = 'OP-B4-0003';
INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq4', id FROM public.pipeline WHERE folio_op = 'OP-B4-0004';
INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq5', id FROM public.pipeline WHERE folio_op = 'OP-B4-0005';
INSERT INTO b4_ids (nombre, valor)
SELECT 'rfq6', id FROM public.pipeline WHERE folio_op = 'OP-B4-0006';

-- Ítems del RFQ1 (IT01/IT02) con operación solicitada.
INSERT INTO public.rfq_items (rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id)
VALUES
  ((SELECT valor FROM b4_ids WHERE nombre = 'rfq1'), 1, 'IT01', 'Pieza B4 uno', 10,
   (SELECT id FROM public.catalogo_materiales WHERE codigo = 'B4MAT'),
   (SELECT valor FROM b4_ids WHERE nombre = 'espesor')),
  ((SELECT valor FROM b4_ids WHERE nombre = 'rfq1'), 2, 'IT02', 'Pieza B4 dos', 1, NULL, NULL);

INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b4_ids WHERE nombre = 'proceso'), 0
FROM public.rfq_items AS i WHERE i.rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq1');

-- RFQ3 legacy: una línea normal con cálculo técnico y una línea de descuento.
INSERT INTO public.rfq_items (rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id)
VALUES
  ((SELECT valor FROM b4_ids WHERE nombre = 'rfq3'), 1, 'IT01', 'Histórica B4', 5,
   (SELECT id FROM public.catalogo_materiales WHERE codigo = 'B4MAT'),
   (SELECT valor FROM b4_ids WHERE nombre = 'espesor'));
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT i.id, (SELECT valor FROM b4_ids WHERE nombre = 'proceso'), 0
FROM public.rfq_items AS i WHERE i.rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq3');

INSERT INTO public.cotizacion_lineas (
  pipeline_id, descripcion, cantidad, precio_unitario, orden, es_descuento, calculo_tecnico
) VALUES
  ((SELECT valor FROM b4_ids WHERE nombre = 'rfq3'), 'Histórica B4', 5, 200, 1, false,
   jsonb_build_object('version', 1, 'tiempoEstimadoMinutos', 90)),
  ((SELECT valor FROM b4_ids WHERE nombre = 'rfq3'), 'Descuento B4', 1, 50, 2, true, NULL);

-- -----------------------------------------------------------------------------
-- 2. Estructura, folio y privilegios
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'propuestas', 'Existe propuestas');
SELECT has_table('public', 'propuesta_revisiones', 'Existe propuesta_revisiones');
SELECT has_table('public', 'propuesta_item_ruteo', 'Existe propuesta_item_ruteo');
SELECT has_table('public', 'propuesta_pdfs', 'Existe propuesta_pdfs');
SELECT matches(public.generar_folio_periodico('CNC'), '^CNC-[0-9]{4}_[0-9]{2}$',
  'El folio CNC nuevo usa CNC-MMYY_XX');
SELECT ok(
  has_function_privilege('service_role', 'public.crear_propuesta(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta crear_propuesta'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.crear_propuesta(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_propuesta'
);
SELECT ok(
  has_function_privilege('service_role', 'public.calcular_totales_revision(uuid)', 'EXECUTE'),
  'service_role ejecuta calcular_totales_revision'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.propuestas', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.propuestas', 'INSERT'),
  'authenticated solo lee propuestas'
);
SELECT policies_are('public', 'propuestas', ARRAY['propuestas_seleccionar'],
  'Solo existe la política de lectura en propuestas');

-- -----------------------------------------------------------------------------
-- 3. Alta desde RFQ (crear_propuesta)
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.crear_propuesta(%L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'rfq1'),
    '00000000-0000-4000-8000-0000000b4a04'),
  '42501', 'sin_permiso_propuesta', 'Un operador no crea propuestas'
);

SELECT throws_ok(
  format('SELECT public.crear_propuesta(%L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'rfq4'),
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'rfq_no_apto_para_propuesta', 'Un RFQ no LISTO no genera propuesta'
);

SELECT throws_ok(
  format('SELECT public.crear_propuesta(%L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'rfq6'),
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'rfq_sin_cliente', 'Un RFQ sin cliente no genera propuesta'
);

SELECT lives_ok(
  format('SELECT public.crear_propuesta(%L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'rfq1'),
    '00000000-0000-4000-8000-0000000b4a02'),
  'Alta de propuesta desde RFQ LISTO'
);

INSERT INTO b4_ids (nombre, valor)
SELECT 'p1', id FROM public.propuestas
WHERE rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq1');
INSERT INTO b4_ids (nombre, valor)
SELECT 'p1a', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1');

SELECT matches(
  (SELECT folio_cnc FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  '^CNC-[0-9]{4}_[0-9]{2}$', 'La propuesta recibe folio CNC-MMYY_XX');
SELECT is(
  (SELECT estado FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'DRAFT', 'La propuesta nace DRAFT');
SELECT is(
  (SELECT folio_revision FROM public.propuesta_revisiones
   WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  (SELECT folio_cnc || '-A' FROM public.propuestas
   WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'La revisión A usa folio CNC-MMYY_XX-A');
SELECT is(
  (SELECT count(*) FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  2::bigint, 'Se copian los ítems activos del RFQ');
SELECT ok(
  (SELECT bool_and(rfq_item_id IS NOT NULL) FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  'Los ítems conservan su rfq_item_id (ITxx intacto)');
SELECT is(
  (SELECT string_agg(codigo, ',' ORDER BY codigo) FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  'IT01,IT02', 'Los códigos ITxx se preservan');
SELECT is(
  (SELECT count(*) FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id
   WHERE i.revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  2::bigint, 'El ruteo inicial se autogenera desde las operaciones');
SELECT is(
  (SELECT estado_rfq FROM public.pipeline WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq1')),
  'CONVERTED', 'El RFQ pasa a CONVERTED en la misma transacción');
SELECT is(
  (SELECT count(*) FROM public.rfq_eventos
   WHERE rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq1') AND accion = 'crear_propuesta'),
  1::bigint, 'El RFQ registra el evento crear_propuesta');
SELECT is(
  (SELECT count(*) FROM public.propuesta_revision_acciones
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  1::bigint, 'La próxima acción del RFQ se hereda a la revisión A');

-- Idempotencia: repetir devuelve la misma revisión DRAFT.
SELECT is(
  public.crear_propuesta(
    (SELECT valor FROM b4_ids WHERE nombre = 'rfq1'),
    '00000000-0000-4000-8000-0000000b4a02') ->> 'revisionId',
  (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
  'Repetir el alta devuelve la revisión DRAFT existente'
);
SELECT is(
  (SELECT count(*) FROM public.propuestas
   WHERE rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq1')),
  1::bigint, 'No se duplica la propuesta del RFQ');

-- -----------------------------------------------------------------------------
-- 4. Edición de ítems, costos y totales
-- -----------------------------------------------------------------------------
INSERT INTO b4_ids (nombre, valor)
SELECT 'it_a1', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a') AND codigo = 'IT01'
ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor;
INSERT INTO b4_ids (nombre, valor)
SELECT 'it_a2', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a') AND codigo = 'IT02'
ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor;

SELECT is(
  (SELECT public.editar_item_propuesta(
    (SELECT valor FROM b4_ids WHERE nombre = 'it_a1'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_items
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'it_a1')),
      'precio_unitario', 100.50),
    '00000000-0000-4000-8000-0000000b4a02', NULL) ->> 'precio_unitario')::numeric,
  100.5000,
  'El vendedor edita el precio del ítem con CAS'
);

SELECT is(
  (SELECT public.editar_item_propuesta(
    (SELECT valor FROM b4_ids WHERE nombre = 'it_a2'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_items
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'it_a2')),
      'precio_unitario', 20, 'es_descuento', true),
    '00000000-0000-4000-8000-0000000b4a02', NULL) ->> 'es_descuento')::boolean,
  true,
  'El vendedor marca la línea de descuento'
);

SELECT throws_ok(
  format('SELECT public.editar_item_propuesta(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'it_a1'),
    jsonb_build_object('actualizado_en', '2000-01-01T00:00:00+00', 'precio_unitario', 1)::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'item_desactualizado', 'El CAS rechaza un token viejo del ítem'
);

SELECT throws_ok(
  format('SELECT public.editar_costos_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    jsonb_build_object('actualizado_en', '2000-01-01T00:00:00+00', 'costos', '[]'::jsonb)::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '42501', 'sin_permiso_propuesta', 'El vendedor no edita costos'
);

SELECT is(
  (SELECT public.editar_costos_revision(
    (SELECT valor FROM b4_ids WHERE nombre = 'p1a'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
      'costos', jsonb_build_array(
        jsonb_build_object('categoria', 'material', 'monto', 400),
        jsonb_build_object('categoria', 'maquina', 'monto', 100)
      )),
    '00000000-0000-4000-8000-0000000b4a03', NULL) ->> 'costoTotal')::numeric,
  500.0000,
  'El gerente captura el costo interno por categorías'
);

SELECT is(
  (SELECT (public.calcular_totales_revision((SELECT valor FROM b4_ids WHERE nombre = 'p1a'))) ->> 'subtotal')::numeric,
  985.00, 'Subtotal = bruto − descuentos');
SELECT is(
  (SELECT (public.calcular_totales_revision((SELECT valor FROM b4_ids WHERE nombre = 'p1a'))) ->> 'iva')::numeric,
  157.60, 'IVA 16% sobre el subtotal');
SELECT is(
  (SELECT (public.calcular_totales_revision((SELECT valor FROM b4_ids WHERE nombre = 'p1a'))) ->> 'total')::numeric,
  1142.60, 'Total = subtotal + IVA');
SELECT is(
  (SELECT (public.calcular_totales_revision((SELECT valor FROM b4_ids WHERE nombre = 'p1a'))) ->> 'costoTotal')::numeric,
  500.0000, 'El costo total suma las categorías');
SELECT is(
  (SELECT (public.calcular_totales_revision((SELECT valor FROM b4_ids WHERE nombre = 'p1a'))) ->> 'margen')::numeric,
  0.4924, 'Margen = (subtotal − costo) / subtotal con 4 decimales');

-- -----------------------------------------------------------------------------
-- 5. Validación (READY_TO_SEND) y congelamiento
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format('SELECT public.validar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')))::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  'Validar la revisión DRAFT la pasa a READY_TO_SEND'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  'READY_TO_SEND', 'La revisión queda READY_TO_SEND');
SELECT is(
  (SELECT estado FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'READY_TO_SEND', 'La propuesta espeja el estado de su revisión vigente');

SELECT set_config('sii.b4_rpc', 'off', true);

SELECT throws_ok(
  format('UPDATE public.propuesta_items SET descripcion = %L WHERE id = %L',
    'Cambio prohibido', (SELECT valor::text FROM b4_ids WHERE nombre = 'it_a1')),
  '23514', 'revision_congelada', 'Editar un ítem fuera de DRAFT falla'
);
SELECT throws_ok(
  format('UPDATE public.propuesta_item_ruteo SET run_horas = 5 WHERE item_id = %L',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'it_a1')),
  '23514', 'revision_congelada', 'Editar el ruteo fuera de DRAFT falla'
);
SELECT throws_ok(
  format('UPDATE public.propuesta_revisiones SET snapshot_cabecera = %L WHERE id = %L',
    '{"version":2}', (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a')),
  '23514', 'revision_congelada', 'El snapshot de una revisión lista no cambia directo'
);
SELECT throws_ok(
  format('SELECT public.editar_item_propuesta(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'it_a1'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_items
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'it_a1')), 'precio_unitario', 1)::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'revision_no_editable', 'La RPC de ítem exige DRAFT'
);

-- -----------------------------------------------------------------------------
-- 6. Nueva revisión: motivo, copia profunda, tope y flags
-- -----------------------------------------------------------------------------
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones SET estado = 'SENT', actualizado_en = now()
WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a');
SELECT set_config('sii.b4_rpc', 'off', true);

SELECT throws_ok(
  format('SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'), 'xy',
    '00000000-0000-4000-8000-0000000b4a02'),
  '22023', 'motivo_requerido', 'La nueva revisión exige motivo'
);

SELECT lives_ok(
  format('SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    'El cliente pidió cambiar cantidad y ruteo',
    '00000000-0000-4000-8000-0000000b4a02'),
  'Crear la revisión B con motivo'
);

INSERT INTO b4_ids (nombre, valor)
SELECT 'p1b', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1') AND letra = 'B';

SELECT is(
  (SELECT letra FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  'B', 'La nueva revisión es la letra siguiente');
SELECT is(
  (SELECT folio_revision FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  (SELECT folio_cnc || '-B' FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'El folio de la revisión B encadena la letra');
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  'DRAFT', 'La revisión B nace DRAFT');
SELECT is(
  (SELECT string_agg(codigo || '=' || rfq_item_id::text, ',' ORDER BY codigo) FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  (SELECT string_agg(codigo || '=' || rfq_item_id::text, ',' ORDER BY codigo) FROM public.propuesta_items
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  'La copia conserva ITxx y rfq_item_id'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id
   WHERE i.revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  2::bigint, 'La copia incluye el ruteo de la revisión anterior');
SELECT is(
  (SELECT count(*) FROM public.propuesta_revision_costos
   WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  2::bigint, 'La copia incluye los costos');
SELECT is(
  (public.crear_nueva_revision(
    (SELECT valor FROM b4_ids WHERE nombre = 'p1a'),
    'El cliente pidió cambiar cantidad y ruteo',
    '00000000-0000-4000-8000-0000000b4a02') ->> 'revisionId'),
  (SELECT valor::text FROM b4_ids WHERE nombre = 'p1b'),
  'Repetir la creación devuelve la DRAFT existente'
);

-- Cambio de alcance en B: marca "Requiere revisión" de ruteo y costeo.
INSERT INTO b4_ids (nombre, valor)
SELECT 'it_b1', id FROM public.propuesta_items
WHERE revision_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b') AND codigo = 'IT01'
ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor;

SELECT is(
  (SELECT public.editar_item_propuesta(
    (SELECT valor FROM b4_ids WHERE nombre = 'it_b1'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_items
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'it_b1')),
      'cantidad', 12),
    '00000000-0000-4000-8000-0000000b4a02', NULL) ->> 'cantidad')::numeric,
  12.00, 'El vendedor cambia la cantidad en la revisión B'
);
SELECT is(
  (SELECT requiere_revision_ruteo FROM public.propuesta_revisiones
   WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  true, 'El cambio de alcance marca requiere revisión de ruteo'
);
SELECT is(
  (SELECT requiere_revision_costeo FROM public.propuesta_revisiones
   WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
  true, 'Con costos existentes, el cambio de alcance marca requiere revisión de costeo'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_item_ruteo
   WHERE item_id = (SELECT valor FROM b4_ids WHERE nombre = 'it_b1') AND requiere_revision),
  1::bigint, 'Las filas de ruteo del ítem quedan marcadas'
);

SELECT throws_ok(
  format('SELECT public.validar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1b'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')))::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'requiere_revision_pendiente', 'Validar con flags pendientes se bloquea'
);

SELECT is(
  (SELECT public.editar_ruteo_item(
    (SELECT valor FROM b4_ids WHERE nombre = 'it_b1'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
      'filas', jsonb_build_array(jsonb_build_object(
        'proceso_id', (SELECT valor FROM b4_ids WHERE nombre = 'proceso'),
        'setup_horas', 1, 'run_horas', 2
      ))),
    '00000000-0000-4000-8000-0000000b4a02', NULL) ->> 'requiereRevisionRuteo')::boolean,
  false, 'Confirmar el ruteo limpia el flag de ruteo'
);
SELECT throws_ok(
  format('SELECT public.validar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1b'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')))::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'requiere_revision_pendiente', 'El flag de costeo sigue bloqueando'
);

SELECT is(
  (SELECT public.editar_costos_revision(
    (SELECT valor FROM b4_ids WHERE nombre = 'p1b'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')),
      'costos', jsonb_build_array(
        jsonb_build_object('categoria', 'material', 'monto', 480),
        jsonb_build_object('categoria', 'maquina', 'monto', 120)
      )),
    '00000000-0000-4000-8000-0000000b4a03', NULL) ->> 'costoTotal')::numeric,
  600.0000, 'Confirmar el costeo limpia el flag'
);
SELECT lives_ok(
  format('SELECT public.validar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1b'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b')))::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  'Sin flags pendientes, la revisión B valida'
);

-- Tope Z: revisión Z no-DRAFT bloquea la creación de la siguiente letra.
SELECT set_config('sii.b4_rpc', 'on', true);
INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, motivo_creacion, snapshot_cabecera, creado_por
) VALUES (
  (SELECT valor FROM b4_ids WHERE nombre = 'p1'), 'Z',
  (SELECT folio_cnc || '-Z' FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'SENT', 'Revisión Z de prueba', '{"version":1}', '00000000-0000-4000-8000-0000000b4a02'
);
UPDATE public.propuesta_revisiones SET estado = 'SENT', actualizado_en = now()
WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1b');
SELECT set_config('sii.b4_rpc', 'off', true);

SELECT throws_ok(
  format('SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1b'), 'Intento de letra extra',
    '00000000-0000-4000-8000-0000000b4a02'),
  '23514', 'limite_revisiones_alcanzado', 'La letra Z es el tope de revisiones'
);

-- -----------------------------------------------------------------------------
-- 7. Aceptación de la revisión exacta y confirmación de venta
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.aceptar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')))::text,
    '00000000-0000-4000-8000-0000000b4a02'),
  '42501', 'sin_permiso_propuesta', 'El vendedor no acepta propuestas'
);

SELECT lives_ok(
  format('SELECT public.aceptar_revision(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
        WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
      'canal', 'correo', 'destino', 'compras@cliente.mx',
      -- C4.1: aceptar confirma la fecha compromiso comercial.
      'fecha_compromiso_comercial', (current_date + 30)::text)::text,
    '00000000-0000-4000-8000-0000000b4a03'),
  'El gerente acepta la revisión A aunque exista una B posterior'
);
SELECT is(
  (SELECT accepted_revision_id FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  (SELECT valor FROM b4_ids WHERE nombre = 'p1a'),
  'accepted_revision_id apunta a la revisión exacta aceptada'
);
SELECT is(
  (SELECT estado FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  'ACCEPTED', 'La propuesta refleja la aceptación de la revisión anterior'
);

SELECT throws_ok(
  format('SELECT public.confirmar_venta(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'), '2000-01-01T00:00:00+00',
    '00000000-0000-4000-8000-0000000b4a03'),
  '23514', 'revision_desactualizada', 'Confirmar venta exige el token vigente'
);
SELECT lives_ok(
  format('SELECT public.confirmar_venta(%L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p1a'),
    (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
    '00000000-0000-4000-8000-0000000b4a03'),
  'Confirmar la venta sobre la revisión aceptada'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
  'SALE_CONFIRMED', 'La revisión aceptada queda SALE_CONFIRMED'
);

-- -----------------------------------------------------------------------------
-- 8. Rechazo y cierre (propuesta P2)
-- -----------------------------------------------------------------------------
SELECT public.crear_propuesta(
  (SELECT valor FROM b4_ids WHERE nombre = 'rfq2'),
  '00000000-0000-4000-8000-0000000b4a02');
INSERT INTO b4_ids (nombre, valor)
SELECT 'p2', id FROM public.propuestas WHERE rfq_id = (SELECT valor FROM b4_ids WHERE nombre = 'rfq2');
INSERT INTO b4_ids (nombre, valor)
SELECT 'p2a', id FROM public.propuesta_revisiones WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p2');

SELECT throws_ok(
  format('SELECT public.rechazar_propuesta(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p2a'), 'no interesado',
    (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p2a')),
    '00000000-0000-4000-8000-0000000b4a02'),
  '42501', 'sin_permiso_propuesta', 'El vendedor no rechaza propuestas'
);
SELECT lives_ok(
  format('SELECT public.rechazar_propuesta(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p2a'), 'El cliente eligió otro proveedor',
    (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p2a')),
    '00000000-0000-4000-8000-0000000b4a03'),
  'El gerente rechaza la propuesta con motivo'
);
SELECT is(
  (SELECT estado FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p2')),
  'REJECTED', 'La propuesta queda REJECTED'
);
SELECT throws_ok(
  format('SELECT public.cerrar_propuesta(%L, %L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p2a'), 'Cierre posterior',
    (SELECT actualizado_en::text FROM public.propuesta_revisiones
      WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p2a')),
    '00000000-0000-4000-8000-0000000b4a03'),
  '23514', 'revision_estado_invalido', 'Un estado terminal no se vuelve a cerrar'
);

-- Cierre desde DRAFT sobre una revisión insertada (letra Z) de P2.
INSERT INTO public.propuesta_revisiones (
  propuesta_id, letra, folio_revision, estado, motivo_creacion, snapshot_cabecera, creado_por
) VALUES (
  (SELECT valor FROM b4_ids WHERE nombre = 'p2'), 'Z',
  (SELECT folio_cnc || '-Z' FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p2')),
  'DRAFT', 'Revisión Z de prueba', '{"version":1}', '00000000-0000-4000-8000-0000000b4a02'
);
SELECT lives_ok(
  format('SELECT public.cerrar_propuesta(%L, %L, %L, %L)',
    (SELECT id::text FROM public.propuesta_revisiones WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p2') AND letra = 'Z'),
    'Se cierra la propuesta sin continuar',
    (SELECT actualizado_en::text FROM public.propuesta_revisiones WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p2') AND letra = 'Z'),
    '00000000-0000-4000-8000-0000000b4a03'),
  'Cerrar una revisión DRAFT con motivo'
);
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones
   WHERE propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p2') AND letra = 'Z'),
  'CLOSED', 'La revisión cerrada queda CLOSED'
);

SELECT throws_ok(
  format('INSERT INTO public.propuesta_revisiones (propuesta_id, letra, folio_revision, estado, motivo_creacion, snapshot_cabecera, creado_por) VALUES (%L, %L, %L, %L, %L, %L, %L)',
    (SELECT valor::text FROM b4_ids WHERE nombre = 'p2'), 'B',
    (SELECT folio_revision FROM public.propuesta_revisiones WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1a')),
    'DRAFT', 'Duplicado de folio', '{"version":1}', '00000000-0000-4000-8000-0000000b4a02'),
  '23505', NULL, 'El folio de revisión es único globalmente'
);

-- -----------------------------------------------------------------------------
-- 9. Backfill de RFQs históricos y RLS
-- -----------------------------------------------------------------------------
SELECT is(
  (public.backfill_propuestas_legacy() ->> 'propuestas')::integer >= 1,
  true, 'El backfill crea propuestas de RFQs históricos con folio_cnc'
);
SELECT is(
  (public.backfill_propuestas_legacy() ->> 'propuestas')::integer,
  0, 'El backfill es idempotente'
);
SELECT matches(
  (SELECT p.folio_cnc FROM public.propuestas AS p
   JOIN public.pipeline AS rfq ON rfq.id = p.rfq_id WHERE rfq.folio_op = 'OP-B4-0003'),
  '^CNC-[0-9]{4}_[0-9]{2}$', 'La propuesta histórica usa el folio nuevo');
SELECT is(
  (SELECT r.snapshot_cabecera ->> 'folio_legacy' FROM public.propuesta_revisiones AS r
   JOIN public.propuestas AS p ON p.id = r.propuesta_id
   JOIN public.pipeline AS rfq ON rfq.id = p.rfq_id
   WHERE rfq.folio_op = 'OP-B4-0003' AND r.letra = 'A'),
  'CNC-1000-0001', 'El folio legacy se conserva en el snapshot');
SELECT is(
  (SELECT p.estado FROM public.propuestas AS p
   JOIN public.pipeline AS rfq ON rfq.id = p.rfq_id WHERE rfq.folio_op = 'OP-B4-0003'),
  'SENT', 'La etapa cotizado mapea a SENT'
);
SELECT is(
  (SELECT count(*) FROM public.propuesta_items AS i
   JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
   JOIN public.propuestas AS p ON p.id = r.propuesta_id
   JOIN public.pipeline AS rfq ON rfq.id = p.rfq_id
   WHERE rfq.folio_op = 'OP-B4-0003'),
  2::bigint, 'El backfill copia las líneas históricas');
SELECT is(
  (SELECT rt.run_horas FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id
   JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
   JOIN public.propuestas AS p ON p.id = r.propuesta_id
   JOIN public.pipeline AS rfq ON rfq.id = p.rfq_id
   WHERE rfq.folio_op = 'OP-B4-0003' AND i.codigo = 'IT01'),
  1.50, 'El cálculo técnico se traduce a horas de ruteo'
);
SELECT ok(
  (public.backfill_propuestas_legacy() ->> 'omitidas_sin_cliente')::integer >= 1,
  'Los RFQs históricos sin cliente se omiten, no se inventan'
);

-- RLS: dueño ve; ajeno no; el administrador sí.
CREATE TEMP TABLE b4_rls (caso text PRIMARY KEY, total bigint) ON COMMIT DROP;
GRANT SELECT, INSERT ON b4_rls TO authenticated;
GRANT SELECT ON b4_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b4a02', true);
INSERT INTO b4_rls
SELECT 'dueno', count(*) FROM public.propuestas
WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b4a05', true);
INSERT INTO b4_rls
SELECT 'ajeno', count(*) FROM public.propuestas
WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1');
INSERT INTO b4_rls
SELECT 'items_ajenos', count(*)
FROM public.propuesta_items AS i
JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
WHERE r.propuesta_id = (SELECT valor FROM b4_ids WHERE nombre = 'p1');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT is(
  (SELECT total FROM b4_rls WHERE caso = 'dueno'),
  1::bigint, 'El vendedor dueño del RFQ ve la propuesta'
);
SELECT is(
  (SELECT total FROM b4_rls WHERE caso = 'ajeno'),
  0::bigint, 'Un vendedor ajeno sin ver_pipeline_equipo no la ve'
);
SELECT is(
  (SELECT total FROM b4_rls WHERE caso = 'items_ajenos'),
  0::bigint, 'RLS también oculta los ítems al ajeno'
);
SELECT is(
  (SELECT count(*) FROM public.propuestas WHERE id = (SELECT valor FROM b4_ids WHERE nombre = 'p1')),
  1::bigint, 'El administrador/ servicio ve la propuesta'
);

SELECT * FROM finish();
ROLLBACK;
