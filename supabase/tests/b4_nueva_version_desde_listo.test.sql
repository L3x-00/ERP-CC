-- Obs. cliente 2026-10-11: «Crear nueva versión» desde una propuesta LISTA
-- PARA ENVIAR. Verifica: READY_TO_SEND es origen válido, la revisión nueva nace
-- DRAFT copiando ítems, la original queda intacta y el reintento es idempotente.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(8);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b5b01', 'b5b-admin@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B5B'
WHERE id = '00000000-0000-4000-8000-0000000b5b01';

INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('B5BMAT', 'Acero B5B');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('B5BLAS', 'Láser B5B', 'CBLA', false);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000b5b20', 'B5B Cliente', 'B5B Cliente SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000b5b30', 'OP-B5B-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto B5B', 'B5B Empresa', '00000000-0000-4000-8000-0000000b5b20',
  '00000000-0000-4000-8000-0000000b5b01', 'MXN'
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad, material_id)
SELECT '00000000-0000-4000-8000-0000000b5b31', '00000000-0000-4000-8000-0000000b5b30', 1, 'IT01',
  'Placa B5B', 4, id FROM public.catalogo_materiales WHERE codigo = 'B5BMAT';
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT '00000000-0000-4000-8000-0000000b5b31', id, 1 FROM public.catalogo_procesos WHERE codigo = 'B5BLAS';

CREATE TEMP TABLE b5b ON COMMIT DROP AS
SELECT (public.crear_propuesta('00000000-0000-4000-8000-0000000b5b30',
  '00000000-0000-4000-8000-0000000b5b01')->>'revisionId')::uuid AS revision_a;

-- La revisión A queda LISTA PARA ENVIAR (origen nuevo de esta migración).
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones SET estado = 'READY_TO_SEND', actualizado_en = now()
WHERE id = (SELECT revision_a FROM b5b);

-- 1-2. Desde READY_TO_SEND se crea la versión B en borrador.
CREATE TEMP TABLE b5b_nueva ON COMMIT DROP AS
SELECT public.crear_nueva_revision(
  (SELECT revision_a FROM b5b), 'El cliente cambió cantidades',
  '00000000-0000-4000-8000-0000000b5b01') AS resultado;

SELECT is(
  (SELECT resultado->>'letra' FROM b5b_nueva), 'B',
  'READY_TO_SEND abre la versión B');

SELECT is(
  (SELECT resultado->>'yaExistia' FROM b5b_nueva), 'false',
  'la versión B es nueva, no un borrador reutilizado');

-- 3-5. La versión nueva nace DRAFT, copia ítems y queda vigente.
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones
    WHERE id = (SELECT (resultado->>'revisionId')::uuid FROM b5b_nueva)),
  'DRAFT', 'la versión B nace en borrador');

SELECT is(
  (SELECT count(*)::int FROM public.propuesta_items
    WHERE revision_id = (SELECT (resultado->>'revisionId')::uuid FROM b5b_nueva)),
  1, 'la versión B copia los ítems de la revisión lista');

SELECT is(
  (SELECT revision_vigente_id FROM public.propuestas
    WHERE id = (SELECT (resultado->>'propuestaId')::uuid FROM b5b_nueva)),
  (SELECT (resultado->>'revisionId')::uuid FROM b5b_nueva),
  'la propuesta apunta a la versión nueva');

-- 6. La revisión original queda intacta como historial.
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT revision_a FROM b5b)),
  'READY_TO_SEND', 'la revisión original conserva su estado');

-- 7. Reintentar es idempotente: devuelve el mismo borrador.
SELECT is(
  (public.crear_nueva_revision(
    (SELECT revision_a FROM b5b), 'Reintento',
    '00000000-0000-4000-8000-0000000b5b01')->>'yaExistia')::boolean
  AND (public.crear_nueva_revision(
    (SELECT revision_a FROM b5b), 'Reintento',
    '00000000-0000-4000-8000-0000000b5b01')->>'revisionId')
      = (SELECT resultado->>'revisionId' FROM b5b_nueva),
  true, 'reintentar devuelve el mismo borrador sin duplicar');

-- 8. Privilegios: la RPC sigue siendo solo del servidor.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.crear_nueva_revision(uuid, text, uuid, uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_nueva_revision');

SELECT * FROM finish();
ROLLBACK;
