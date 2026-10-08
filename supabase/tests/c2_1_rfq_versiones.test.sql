-- C2.1 — Versiones append-only del RFQ y congelamiento al crear Rev A.
-- Verifica: privilegios/RLS, versión por guardado con actor y causa, snapshot
-- de ítems activos y cancelados con operaciones, inmutabilidad, edición en
-- READY_FOR_PROPOSAL (CV-01), revalidación y versión final al crear Rev A,
-- congelamiento posterior y RFQ legados sin versiones intactos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(29);

-- -----------------------------------------------------------------------------
-- 0. Actores y permisos
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c2101', 'c21-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000c2102', 'c21-operador@prueba.local');
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor C21'
WHERE id = '00000000-0000-4000-8000-0000000c2101';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C21'
WHERE id = '00000000-0000-4000-8000-0000000c2102';

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('rfq_editar', 'rfq', 'Editar RFQ'),
  ('rfq_item_editar', 'rfq', 'Editar ítems RFQ'),
  ('propuesta_editar_articulo', 'propuestas', 'Editar artículos/cantidades')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('vendedor', 'rfq_editar'),
  ('vendedor', 'rfq_item_editar'),
  ('vendedor', 'propuesta_editar_articulo')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Catálogos, cliente y RFQs
-- -----------------------------------------------------------------------------
INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('C21MAT', 'Acero C21');
INSERT INTO public.catalogo_espesores (material_id, etiqueta, espesor_mm)
SELECT id, 'C21 3mm', 3 FROM public.catalogo_materiales WHERE codigo = 'C21MAT';
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('C21DOB', 'Doblez C21', 'CDOB', false);
INSERT INTO public.catalogo_proximas_acciones (codigo, nombre) VALUES ('C21_LLAMAR', 'Llamar C21');
INSERT INTO public.clientes (nombre_comercial, razon_social, estado)
VALUES ('C21 Cliente', 'C21 Cliente SA', 'activo');

CREATE TEMP TABLE c21 (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO c21 SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'C21 Cliente SA';
INSERT INTO public.contactos_cliente (cliente_id, nombre, es_principal, activo)
SELECT valor, 'Contacto C21', true, true FROM c21 WHERE nombre = 'cliente';
INSERT INTO c21 SELECT 'contacto', id FROM public.contactos_cliente WHERE nombre = 'Contacto C21';
INSERT INTO c21 SELECT 'material', id FROM public.catalogo_materiales WHERE codigo = 'C21MAT';
INSERT INTO c21 SELECT 'espesor', e.id FROM public.catalogo_espesores AS e
  JOIN public.catalogo_materiales AS m ON m.id = e.material_id WHERE m.codigo = 'C21MAT';
INSERT INTO c21 SELECT 'proceso', id FROM public.catalogo_procesos WHERE codigo = 'C21DOB';

-- RFQ A: completo y listo. RFQ B: listo pero sin contacto (lo deja incompleto).
-- RFQ L: legado convertido antes de C2.1 (sin versiones).
INSERT INTO public.pipeline (
  folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, contacto_id, vendedor_id,
  responsable_id, moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud,
  proxima_accion_codigo, fecha_proxima_accion, responsable_proxima_accion_id
)
SELECT v.folio, 'negociacion', v.estado, 'Contacto C21', v.empresa,
  (SELECT valor FROM c21 WHERE nombre = 'cliente'),
  CASE WHEN v.con_contacto THEN (SELECT valor FROM c21 WHERE nombre = 'contacto') END,
  '00000000-0000-4000-8000-0000000c2101', '00000000-0000-4000-8000-0000000c2101',
  'MXN', 16, 'Pieza C21', 'CORREO', current_date,
  'C21_LLAMAR', current_date + 3, '00000000-0000-4000-8000-0000000c2101'
FROM (VALUES
  ('OP-C21-A', 'READY_FOR_PROPOSAL', 'C21 Empresa A', true),
  ('OP-C21-B', 'READY_FOR_PROPOSAL', 'C21 Empresa B', false),
  ('OP-C21-L', 'CONVERTED', 'C21 Empresa L', true)
) AS v(folio, estado, empresa, con_contacto);

INSERT INTO c21 SELECT 'rfq_a', id FROM public.pipeline WHERE folio_op = 'OP-C21-A';
INSERT INTO c21 SELECT 'rfq_b', id FROM public.pipeline WHERE folio_op = 'OP-C21-B';
INSERT INTO c21 SELECT 'rfq_l', id FROM public.pipeline WHERE folio_op = 'OP-C21-L';

CREATE TEMP TABLE c21_datos ON COMMIT DROP AS
SELECT jsonb_build_object(
  'descripcion', 'Soporte C21',
  'cantidad', 4,
  'material_id', (SELECT valor FROM c21 WHERE nombre = 'material'),
  'espesor_id', (SELECT valor FROM c21 WHERE nombre = 'espesor'),
  'proceso_ids', jsonb_build_array((SELECT valor FROM c21 WHERE nombre = 'proceso'))
) AS datos;

-- -----------------------------------------------------------------------------
-- 2. Esquema, privilegios y RLS
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'rfq_versiones', 'existe rfq_versiones');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rfq_versiones'::regclass),
  true, 'RLS activo en rfq_versiones');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.rfq_versiones', 'INSERT, UPDATE, DELETE'),
  'authenticated no escribe versiones');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.registrar_version_rfq(uuid, text, uuid, uuid)', 'EXECUTE'),
  'authenticated no ejecuta registrar_version_rfq');

-- -----------------------------------------------------------------------------
-- 3. CV-01: READY_FOR_PROPOSAL admite editar ítems
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format($$SELECT public.crear_item_rfq(%L, %L::jsonb, %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a'), (SELECT datos FROM c21_datos),
    '00000000-0000-4000-8000-0000000c2101'),
  'crear ítem en READY_FOR_PROPOSAL (CV-01)');
SELECT lives_ok(
  format($$SELECT public.crear_item_rfq(%L, %L::jsonb, %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a'), (SELECT datos FROM c21_datos),
    '00000000-0000-4000-8000-0000000c2101'),
  'segundo ítem en READY_FOR_PROPOSAL');
SELECT lives_ok(
  format($$SELECT public.cancelar_item_rfq(%L, 'duplicado', %L)$$,
    (SELECT id FROM public.rfq_items
     WHERE rfq_id = (SELECT valor FROM c21 WHERE nombre = 'rfq_a') AND codigo = 'IT02'),
    '00000000-0000-4000-8000-0000000c2101'),
  'cancelar ítem en READY_FOR_PROPOSAL');

-- -----------------------------------------------------------------------------
-- 4. Versión por guardado
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format($$SELECT public.registrar_version_rfq(%L, 'ITEM', %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a'), '00000000-0000-4000-8000-0000000c2102'),
  '42501', 'sin_permiso_rfq', 'actor sin permiso no versiona');
SELECT throws_ok(
  format($$SELECT public.registrar_version_rfq(%L, 'CREAR_REV_A', %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a'), '00000000-0000-4000-8000-0000000c2101'),
  '22023', 'rfq_version_causa_invalida', 'la versión final no se registra a mano');
SELECT is(
  public.registrar_version_rfq((SELECT valor FROM c21 WHERE nombre = 'rfq_a'), 'ITEM',
    '00000000-0000-4000-8000-0000000c2101', '00000000-0000-4000-8000-00000000c21a'),
  1, 'primera versión numero 1');
SELECT is(
  public.registrar_version_rfq((SELECT valor FROM c21 WHERE nombre = 'rfq_a'), 'CABECERA',
    '00000000-0000-4000-8000-0000000c2101'),
  2, 'segunda versión numero 2');

SELECT results_eq(
  format($$SELECT causa, actor_id, correlation_id FROM public.rfq_versiones
           WHERE rfq_id = %L AND numero = 1$$, (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  $$VALUES ('ITEM'::text, '00000000-0000-4000-8000-0000000c2101'::uuid,
            '00000000-0000-4000-8000-00000000c21a'::uuid)$$,
  'la versión guarda causa, actor y correlation_id');
SELECT results_eq(
  format($$SELECT e->>'codigo', e->>'estado', jsonb_array_length(e->'operaciones')
           FROM public.rfq_versiones AS v, jsonb_array_elements(v.snapshot_items) AS e
           WHERE v.rfq_id = %L AND v.numero = 1 ORDER BY e->>'codigo'$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  $$VALUES ('IT01'::text, 'activo'::text, 1), ('IT02', 'cancelado', 1)$$,
  'el snapshot incluye ítems activos y cancelados con operaciones');
SELECT is(
  (SELECT snapshot_cabecera->>'descripcion_general' FROM public.rfq_versiones
   WHERE rfq_id = (SELECT valor FROM c21 WHERE nombre = 'rfq_a') AND numero = 1),
  'Pieza C21', 'el snapshot incluye la cabecera');

-- -----------------------------------------------------------------------------
-- 5. Inmutabilidad
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format($$UPDATE public.rfq_versiones SET causa = 'CABECERA' WHERE rfq_id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '42501', 'rfq_version_inmutable', 'una versión no se modifica');
SELECT throws_ok(
  format($$DELETE FROM public.rfq_versiones WHERE rfq_id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '42501', 'rfq_version_inmutable', 'una versión no se borra');

-- -----------------------------------------------------------------------------
-- 6. Rev A revalida un RFQ editado y registra la versión final
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format($$SELECT public.crear_item_rfq(%L, %L::jsonb, %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_b'), (SELECT datos FROM c21_datos),
    '00000000-0000-4000-8000-0000000c2101'),
  'RFQ B recibe un ítem');
SELECT lives_ok(
  format($$SELECT public.registrar_version_rfq(%L, 'ITEM', %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_b'), '00000000-0000-4000-8000-0000000c2101'),
  'RFQ B queda versionado');
SELECT throws_ok(
  format($$SELECT public.crear_propuesta(%L, %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_b'), '00000000-0000-4000-8000-0000000c2101'),
  '23514', 'rfq_no_listo', 'Rev A rechaza un RFQ editado que dejó de cumplir');
SELECT is(
  (SELECT count(*)::integer FROM public.propuestas
   WHERE rfq_id = (SELECT valor FROM c21 WHERE nombre = 'rfq_b')),
  0, 'el rechazo no deja propuesta a medias');

SELECT lives_ok(
  format($$SELECT public.crear_propuesta(%L, %L, %L)$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a'), '00000000-0000-4000-8000-0000000c2101',
    '00000000-0000-4000-8000-00000000c21b'),
  'crear Rev A del RFQ completo');
SELECT results_eq(
  format($$SELECT numero, actor_id, correlation_id FROM public.rfq_versiones
           WHERE rfq_id = %L AND causa = 'CREAR_REV_A'$$, (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  $$VALUES (3, '00000000-0000-4000-8000-0000000c2101'::uuid, '00000000-0000-4000-8000-00000000c21b'::uuid)$$,
  'Rev A registra la versión final con actor y correlation_id');

-- -----------------------------------------------------------------------------
-- 7. Congelamiento posterior
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format($$UPDATE public.pipeline SET descripcion_general = 'Cambio tardío' WHERE id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '23514', 'rfq_congelado', 'la cabecera del RFQ congelado no cambia');
SELECT throws_ok(
  format($$UPDATE public.rfq_items SET cantidad = 9 WHERE rfq_id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '23514', 'rfq_congelado', 'los ítems del RFQ congelado no cambian');
SELECT lives_ok(
  format($$UPDATE public.pipeline SET fecha_ultimo_contacto = now() WHERE id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  'el seguimiento comercial del RFQ congelado sigue operando');
SELECT lives_ok(
  format($$UPDATE public.pipeline SET descripcion_general = 'Legado editable' WHERE id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_l')),
  'un RFQ legado convertido sin versión final no se bloquea');

-- La aplicación escribe como service_role (sin USAGE sobre `privado`).
GRANT SELECT ON c21 TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  format($$UPDATE public.pipeline SET descripcion_general = 'Edición B' WHERE id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_b')),
  'service_role edita la cabecera de un RFQ no congelado');
SELECT throws_ok(
  format($$UPDATE public.pipeline SET descripcion_general = 'Tardío' WHERE id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '23514', 'rfq_congelado', 'service_role recibe rfq_congelado, no un error de permisos');
SELECT throws_ok(
  format($$UPDATE public.rfq_items SET cantidad = 2 WHERE rfq_id = %L$$,
    (SELECT valor FROM c21 WHERE nombre = 'rfq_a')),
  '23514', 'rfq_congelado', 'service_role no altera ítems congelados');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
