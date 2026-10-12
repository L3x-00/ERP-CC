-- Obs. cliente 2026-10-12 — Flujo de versiones y aceptación de propuestas.
-- Verifica: READY_TO_SEND ya no abre versiones nuevas; reabrir_revision exige
-- motivo/permiso, vuelve a DRAFT, invalida el PDF vigente y registra evento;
-- solo SENT/FOLLOW_UP abren la siguiente versión; la aceptación es única y
-- bloquea versiones/validación/seguimiento/envío/rechazo/cierre posteriores;
-- procesar_solicitud_orden acepta actores con propuesta_aceptar (orden
-- automática al aceptar). Privilegios intactos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(25);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b5c01', 'b5c-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b5c02', 'b5c-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000b5c03', 'b5c-contador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B5C'
WHERE id = '00000000-0000-4000-8000-0000000b5c01';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B5C'
WHERE id = '00000000-0000-4000-8000-0000000b5c02';
UPDATE public.usuarios SET rol = 'contador', activo = true, nombre_completo = 'Contador B5C'
WHERE id = '00000000-0000-4000-8000-0000000b5c03';

INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('B5CMAT', 'Acero B5C');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('B5CLAS', 'Láser B5C', 'CBLC', false);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000b5c20', 'B5C Cliente', 'B5C Cliente SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000b5c30', 'OP-B5C-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto B5C', 'B5C Empresa', '00000000-0000-4000-8000-0000000b5c20',
  '00000000-0000-4000-8000-0000000b5c02', 'MXN'
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad, material_id)
SELECT '00000000-0000-4000-8000-0000000b5c31', '00000000-0000-4000-8000-0000000b5c30', 1, 'IT01',
  'Placa B5C', 4, id FROM public.catalogo_materiales WHERE codigo = 'B5CMAT';
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT '00000000-0000-4000-8000-0000000b5c31', id, 1 FROM public.catalogo_procesos WHERE codigo = 'B5CLAS';

CREATE TEMP TABLE b5c ON COMMIT DROP AS
SELECT
  (r ->> 'revisionId')::uuid AS revision_a,
  (r ->> 'propuestaId')::uuid AS propuesta_id
FROM (SELECT public.crear_propuesta(
  '00000000-0000-4000-8000-0000000b5c30',
  '00000000-0000-4000-8000-0000000b5c01') AS r) AS creada;

SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_items SET precio_unitario = 100 WHERE revision_id = (SELECT revision_a FROM b5c);
UPDATE public.propuesta_revisiones
SET estado = 'READY_TO_SEND', validada_en = now(), validada_por = '00000000-0000-4000-8000-0000000b5c01',
    actualizado_en = now()
WHERE id = (SELECT revision_a FROM b5c);
INSERT INTO public.archivos (
  entidad, entidad_id, clase, nombre_original, nombre_erp, bucket, ruta_storage, mime,
  tamano_bytes, subido_por
) VALUES (
  'propuesta_revision', (SELECT revision_a FROM b5c), 'pdf', 'propuesta.pdf', 'PROPUESTA-B5C',
  'propuestas-archivos', 'b5c/propuesta.pdf', 'application/pdf', 20,
  '00000000-0000-4000-8000-0000000b5c01'
);
INSERT INTO public.propuesta_pdfs (revision_id, archivo_id, contenido_hash, generado_por)
SELECT (SELECT revision_a FROM b5c), id, 'hash-b5c', '00000000-0000-4000-8000-0000000b5c01'
FROM public.archivos WHERE ruta_storage = 'b5c/propuesta.pdf';

CREATE FUNCTION pg_temp.datos_motivo(p_revision uuid, p_motivo text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones WHERE id = p_revision),
    'motivo', p_motivo
  );
$$;
CREATE FUNCTION pg_temp.datos_aceptar(p_revision uuid, p_fecha text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones WHERE id = p_revision),
    'fecha_compromiso_comercial', p_fecha
  );
$$;

-- 1. READY_TO_SEND ya no es origen de una versión nueva.
SELECT throws_ok(
  format('SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT revision_a::text FROM b5c), 'Intento desde lista para enviar',
    '00000000-0000-4000-8000-0000000b5c01'),
  '23514', 'revision_estado_invalido',
  'Lista para enviar ya no abre versiones nuevas');

-- 2-3. Reabrir exige motivo y permiso propuesta_validar.
SELECT throws_ok(
  format('SELECT public.reabrir_revision(%L, %L::jsonb, %L)',
    (SELECT revision_a::text FROM b5c),
    pg_temp.datos_motivo((SELECT revision_a FROM b5c), 'ab')::text,
    '00000000-0000-4000-8000-0000000b5c01'),
  '22023', 'motivo_requerido', 'Reabrir exige motivo (3+)');
SELECT throws_ok(
  format('SELECT public.reabrir_revision(%L, %L::jsonb, %L)',
    (SELECT revision_a::text FROM b5c),
    pg_temp.datos_motivo((SELECT revision_a FROM b5c), 'Ajuste de alcance')::text,
    '00000000-0000-4000-8000-0000000b5c03'),
  '42501', 'sin_permiso_propuesta', 'Sin propuesta_validar no se reabre');

-- 4-8. Reabrir: vuelve a DRAFT, limpia validación, invalida PDF y registra evento.
SELECT lives_ok(
  format('SELECT public.reabrir_revision(%L, %L::jsonb, %L)',
    (SELECT revision_a::text FROM b5c),
    pg_temp.datos_motivo((SELECT revision_a FROM b5c), 'Ajustar cantidades antes de enviar')::text,
    '00000000-0000-4000-8000-0000000b5c02'),
  'El vendedor reabre la revisión lista');
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT revision_a FROM b5c)),
  'DRAFT', 'La revisión vuelve a borrador');
SELECT is(
  (SELECT validada_en IS NULL FROM public.propuesta_revisiones WHERE id = (SELECT revision_a FROM b5c)),
  true, 'La validación anterior queda limpia');
SELECT is(
  (SELECT vigente FROM public.propuesta_pdfs WHERE revision_id = (SELECT revision_a FROM b5c)),
  false, 'El PDF vigente queda invalidado para regenerarlo');
SELECT is(
  (SELECT count(*)::int FROM public.propuesta_revision_eventos
   WHERE revision_id = (SELECT revision_a FROM b5c) AND accion = 'reabrir_revision'),
  1, 'El reabrir queda registrado en el historial');

-- 9-10. Revalidar tras editar devuelve la revisión a READY_TO_SEND.
SELECT lives_ok(
  format('SELECT public.validar_revision(%L, %L::jsonb, %L)',
    (SELECT revision_a::text FROM b5c),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
                         WHERE id = (SELECT revision_a FROM b5c)))::text,
    '00000000-0000-4000-8000-0000000b5c02'),
  'Tras editar, la revisión se puede volver a validar');
SELECT is(
  (SELECT estado FROM public.propuesta_revisiones WHERE id = (SELECT revision_a FROM b5c)),
  'READY_TO_SEND', 'La revisión revalidada queda lista para enviar');

-- 11-14. Versionado: solo desde ENVIADAS; A→B, B→C y B→D tras enviar C.
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones SET estado = 'SENT', actualizado_en = now()
WHERE id = (SELECT revision_a FROM b5c);

SELECT is(
  (public.crear_nueva_revision(
    (SELECT revision_a FROM b5c), 'El cliente cambió cantidades',
    '00000000-0000-4000-8000-0000000b5c02') ->> 'letra'),
  'B', 'Una revisión enviada sí abre la versión siguiente');
SELECT is(
  (public.crear_nueva_revision(
    (SELECT revision_a FROM b5c), 'El cliente cambió cantidades',
    '00000000-0000-4000-8000-0000000b5c02') ->> 'yaExistia')::boolean,
  true, 'Repetir la creación devuelve el borrador existente');

UPDATE public.propuesta_revisiones SET estado = 'SENT', actualizado_en = now()
WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B';
SELECT is(
  (public.crear_nueva_revision(
    (SELECT id FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
    'Revisión C', '00000000-0000-4000-8000-0000000b5c02') ->> 'letra'),
  'C', 'B enviada abre la versión C');

UPDATE public.propuesta_revisiones SET estado = 'READY_TO_SEND', actualizado_en = now()
WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C';
SELECT is(
  (public.crear_nueva_revision(
    (SELECT id FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
    'Revisión D con C ya lista', '00000000-0000-4000-8000-0000000b5c02') ->> 'letra'),
  'D', 'Con C lista, B sigue pudiendo abrir D en borrador');

-- 15. Aceptar la revisión A (anterior a B/C/D) sigue permitido y es único.
SELECT is(
  (public.aceptar_revision(
    (SELECT revision_a FROM b5c),
    pg_temp.datos_aceptar((SELECT revision_a FROM b5c), (current_date + 20)::text),
    '00000000-0000-4000-8000-0000000b5c01') ->> 'estado'),
  'ACCEPTED', 'La revisión anterior se acepta con fecha compromiso');

-- 16-22. Tras la aceptación, las demás versiones quedan inhabilitadas.
SELECT throws_ok(
  format('SELECT public.aceptar_revision(%L, %L::jsonb, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
    pg_temp.datos_aceptar(
      (SELECT id FROM public.propuesta_revisiones
       WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
      (current_date + 25)::text)::text,
    '00000000-0000-4000-8000-0000000b5c01'),
  '23514', 'propuesta_ya_aceptada', 'Una propuesta no se acepta dos veces');
SELECT throws_ok(
  format('SELECT public.crear_nueva_revision(%L, %L, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
    'Versión tras aceptar', '00000000-0000-4000-8000-0000000b5c02'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no nacen versiones nuevas');
SELECT throws_ok(
  format('SELECT public.validar_revision(%L, %L::jsonb, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'D'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
                         WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'D'))::text,
    '00000000-0000-4000-8000-0000000b5c02'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no se valida otro borrador');
SELECT throws_ok(
  format('SELECT public.registrar_seguimiento_propuesta(%L, %L::jsonb, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
    jsonb_build_object(
      'actualizado_en', (SELECT actualizado_en::text FROM public.propuesta_revisiones
                         WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'B'),
      'codigo', (SELECT codigo FROM public.catalogo_proximas_acciones
                 WHERE activo ORDER BY orden LIMIT 1),
      'fecha', (current_date + 5)::text)::text,
    '00000000-0000-4000-8000-0000000b5c02'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no se registra seguimiento de otras versiones');
SELECT throws_ok(
  format('SELECT public.enviar_revision(%L, %L, %L, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C'),
    'CORREO', 'compras@cliente.mx', '00000000-0000-4000-8000-0000000b5c01'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no se envían otras versiones');
SELECT throws_ok(
  format('SELECT public.rechazar_propuesta(%L, %L, %L, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C'),
    'Ya no aplica', (SELECT actualizado_en::text FROM public.propuesta_revisiones
                     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C'),
    '00000000-0000-4000-8000-0000000b5c01'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no se rechazan otras versiones');
SELECT throws_ok(
  format('SELECT public.cerrar_propuesta(%L, %L, %L, %L)',
    (SELECT id::text FROM public.propuesta_revisiones
     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C'),
    'Ya no aplica', (SELECT actualizado_en::text FROM public.propuesta_revisiones
                     WHERE propuesta_id = (SELECT propuesta_id FROM b5c) AND letra = 'C'),
    '00000000-0000-4000-8000-0000000b5c01'),
  '23514', 'propuesta_ya_aceptada', 'Tras aceptar no se cierra la propuesta');

-- 23-24. Orden automática: la aceptación autoriza el intento sin orden_liberar.
SELECT throws_ok(
  format('SELECT public.procesar_solicitud_orden(%L, %L)',
    (SELECT revision_a::text FROM b5c), '00000000-0000-4000-8000-0000000b5c02'),
  '42501', 'sin_permiso_orden', 'Sin orden_liberar ni propuesta_aceptar no se procesa');
INSERT INTO public.permisos_rol (rol, permiso) VALUES ('vendedor', 'propuesta_aceptar')
ON CONFLICT DO NOTHING;
SELECT is(
  (public.procesar_solicitud_orden(
    (SELECT revision_a FROM b5c), '00000000-0000-4000-8000-0000000b5c02') ->> 'estado'),
  'CREATED', 'Con propuesta_aceptar, la solicitud de la aceptada crea la Orden');

-- 25. Privilegios: reabrir sigue siendo solo del servidor.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.reabrir_revision(uuid, jsonb, uuid, uuid)', 'EXECUTE'),
  'authenticated no ejecuta reabrir_revision');

SELECT * FROM finish();
ROLLBACK;
