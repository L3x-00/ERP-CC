-- C4.1 — Aceptación durable y «Orden pendiente» (DC-09).
-- Verifica: fecha compromiso obligatoria, aceptación + solicitud única en la
-- misma transacción, BLOCKED con causa sin revertir la aceptación, reintento
-- con permiso propio, exactamente una Orden y privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(13);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c4101', 'c41-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c4102', 'c41-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C41'
WHERE id = '00000000-0000-4000-8000-0000000c4101';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor C41'
WHERE id = '00000000-0000-4000-8000-0000000c4102';

INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('C41MAT', 'Acero C41');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('C41LAS', 'Láser C41', 'CLAX', false);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c4120', 'C41 Cliente', 'C41 Cliente SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000c4130', 'OP-C41-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C41', 'C41 Empresa', '00000000-0000-4000-8000-0000000c4120',
  '00000000-0000-4000-8000-0000000c4102', 'MXN'
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad, material_id)
SELECT '00000000-0000-4000-8000-0000000c4131', '00000000-0000-4000-8000-0000000c4130', 1, 'IT01',
  'Placa C41', 5, id FROM public.catalogo_materiales WHERE codigo = 'C41MAT';
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT '00000000-0000-4000-8000-0000000c4131', id, 1 FROM public.catalogo_procesos WHERE codigo = 'C41LAS';

CREATE TEMP TABLE c41 ON COMMIT DROP AS
SELECT (public.crear_propuesta('00000000-0000-4000-8000-0000000c4130',
  '00000000-0000-4000-8000-0000000c4101')->>'revisionId')::uuid AS revision_id;
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_items SET precio_unitario = 100 WHERE revision_id = (SELECT revision_id FROM c41);
UPDATE public.propuesta_revisiones SET estado = 'SENT' WHERE id = (SELECT revision_id FROM c41);

CREATE FUNCTION pg_temp.datos(p_fecha text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'actualizado_en', (SELECT actualizado_en FROM public.propuesta_revisiones
                       WHERE id = (SELECT revision_id FROM c41)),
    'fecha_compromiso_comercial', p_fecha))
$$;

-- 1-2. Fecha compromiso obligatoria; sin ella nada cambia
SELECT throws_ok(
  format($$SELECT public.aceptar_revision(%L, pg_temp.datos(NULL), %L)$$,
    (SELECT revision_id FROM c41), '00000000-0000-4000-8000-0000000c4101'),
  '22023', 'fecha_compromiso_requerida', 'aceptar exige la fecha compromiso comercial');
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT revision_id FROM c41)),
  'SENT', 'sin fecha la revisión no se acepta');

-- 3-5. Aceptación + solicitud única en la misma transacción
SELECT lives_ok(
  format($$SELECT public.aceptar_revision(%L, pg_temp.datos(%L), %L)$$,
    (SELECT revision_id FROM c41), (current_date + 30)::text, '00000000-0000-4000-8000-0000000c4101'),
  'acepta con fecha compromiso');
SELECT results_eq(
  format($$SELECT estado, fecha_compromiso_comercial, intentos FROM public.solicitudes_orden WHERE revision_id = %L$$,
    (SELECT revision_id FROM c41)),
  $$VALUES ('PENDING'::text, current_date + 30, 0)$$,
  'la aceptación deja una solicitud PENDING con la fecha comprometida');
SELECT is(
  (SELECT fecha_compromiso_comercial FROM public.propuesta_revisiones WHERE id = (SELECT revision_id FROM c41)),
  current_date + 30, 'la revisión aceptada congela la fecha compromiso');

-- 6-7. Reintentar exige permiso propio y no marca bloqueo
SELECT throws_ok(
  format($$SELECT public.procesar_solicitud_orden(%L, %L)$$,
    (SELECT revision_id FROM c41), '00000000-0000-4000-8000-0000000c4102'),
  '42501', 'sin_permiso_orden', 'sin orden_liberar no se procesa');
SELECT is(
  (SELECT estado FROM public.solicitudes_orden WHERE revision_id = (SELECT revision_id FROM c41)),
  'PENDING', 'un intento sin permiso no bloquea la solicitud');

-- 8-10. Un gate fallido deja BLOCKED con causa y conserva la aceptación
UPDATE public.clientes SET estado = 'inactivo' WHERE id = '00000000-0000-4000-8000-0000000c4120';
SELECT is(
  public.procesar_solicitud_orden((SELECT revision_id FROM c41), '00000000-0000-4000-8000-0000000c4101')->>'estado',
  'BLOCKED', 'un gate fallido deja la solicitud BLOCKED');
SELECT results_eq(
  format($$SELECT causa_codigo, intentos FROM public.solicitudes_orden WHERE revision_id = %L$$,
    (SELECT revision_id FROM c41)),
  $$VALUES ('cliente_no_activo'::text, 1)$$,
  'registra la causa y el intento');
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT revision_id FROM c41)),
  'ACCEPTED', 'el fallo al crear la Orden no revierte la aceptación');

-- 11-12. Reintento tras corregir: exactamente una Orden
UPDATE public.clientes SET estado = 'activo' WHERE id = '00000000-0000-4000-8000-0000000c4120';
SELECT is(
  public.procesar_solicitud_orden((SELECT revision_id FROM c41), '00000000-0000-4000-8000-0000000c4101')->>'estado',
  'CREATED', 'el reintento crea la Orden');
SELECT is(
  (public.procesar_solicitud_orden((SELECT revision_id FROM c41), '00000000-0000-4000-8000-0000000c4101')->>'yaExistia')::boolean
  AND (SELECT count(*) FROM public.ordenes_produccion WHERE propuesta_revision_id = (SELECT revision_id FROM c41)) = 1,
  true, 'reprocesar es idempotente: exactamente una Orden');

-- 13. Privilegios
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.procesar_solicitud_orden(uuid, uuid, uuid)', 'EXECUTE'),
  'authenticated no procesa solicitudes');

SELECT * FROM finish();
ROLLBACK;
