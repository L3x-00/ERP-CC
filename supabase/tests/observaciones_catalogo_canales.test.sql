-- DC-02 — catálogo configurable de canales y detalle obligatorio de Otro.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c1301', 'canales-rfq@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1301';

SELECT has_table('public', 'catalogo_canales', 'Existe catalogo_canales');
SELECT has_column('public', 'pipeline', 'canal_detalle', 'pipeline.canal_detalle existe');
SELECT is(
  (ARRAY(
    SELECT codigo
    FROM public.catalogo_canales
    WHERE codigo = ANY (ARRAY['WHATSAPP', 'CORREO', 'TELEFONO', 'VISITA', 'REFERIDO', 'OTRO']::text[])
    ORDER BY orden
  )),
  ARRAY['WHATSAPP', 'CORREO', 'TELEFONO', 'VISITA', 'REFERIDO', 'OTRO']::text[],
  'Los seis canales aprobados están sembrados en orden'
);
SELECT is((SELECT count(*)::integer FROM public.catalogo_canales WHERE es_otro), 1,
  'Solo existe un canal Otro');
SELECT has_index('public', 'catalogo_canales', 'ux_catalogo_canales_otro',
  'Existe unicidad parcial para Otro');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.catalogo_canales'::regclass),
  'catalogo_canales tiene RLS'
);
SELECT ok(NOT has_table_privilege('anon', 'public.catalogo_canales', 'SELECT'),
  'anon no lee el catálogo');
SELECT ok(has_table_privilege('authenticated', 'public.catalogo_canales', 'SELECT'),
  'authenticated tiene SELECT sujeto a RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.catalogo_canales', 'INSERT'),
  'authenticated no escribe el catálogo');
SELECT policies_are('public', 'catalogo_canales', ARRAY['catalogo_canales_seleccionar'],
  'Solo existe la política de lectura');

SELECT lives_ok($$
  INSERT INTO public.catalogo_canales (codigo, nombre, orden)
  VALUES ('FERIA', 'Feria industrial', 70)
$$, 'Se puede agregar un canal configurable');
SELECT is(
  (SELECT count(*)::integer FROM public.versiones_catalogo
   WHERE entidad = 'catalogo_canales'
     AND entidad_id = (SELECT id FROM public.catalogo_canales WHERE codigo = 'FERIA')),
  1,
  'El alta del canal registra versión 1'
);
SELECT lives_ok($$
  UPDATE public.catalogo_canales SET nombre = 'Feria y evento' WHERE codigo = 'FERIA'
$$, 'Se puede editar el canal');
SELECT is(
  (SELECT max(version)::integer FROM public.versiones_catalogo
   WHERE entidad = 'catalogo_canales'
     AND entidad_id = (SELECT id FROM public.catalogo_canales WHERE codigo = 'FERIA')),
  2,
  'La edición registra versión 2'
);
SELECT throws_ok($$
  DELETE FROM public.catalogo_canales WHERE codigo = 'FERIA'
$$, 'P0001', 'catalogo_sin_borrado', 'Un canal no se borra físicamente');
SELECT has_trigger(
  'public', 'catalogo_canales', 'trigger_catalogo_canales_codigo_inmutable',
  'El código estable del canal está protegido'
);
SELECT throws_ok($$
  UPDATE public.catalogo_canales SET codigo = 'FERIA_NUEVA' WHERE codigo = 'FERIA'
$$, '23514', 'codigo_canal_inmutable', 'El código de un canal existente no cambia');

SELECT throws_ok($$
  INSERT INTO public.pipeline (
    folio_op, nombre_contacto, empresa, vendedor_id, canal
  ) VALUES (
    'OP-CANAL-SIN-DETALLE', 'Contacto', 'Empresa',
    '00000000-0000-4000-8000-0000000c1301', 'OTRO'
  )
$$, '23514', 'canal_otro_requiere_detalle', 'Otro exige detalle');

SELECT lives_ok($$
  INSERT INTO public.pipeline (
    id, folio_op, nombre_contacto, empresa, vendedor_id, canal, canal_detalle
  ) VALUES (
    '00000000-0000-4000-8000-0000000c1302', 'OP-CANAL-OTRO', 'Contacto', 'Empresa',
    '00000000-0000-4000-8000-0000000c1301', 'OTRO', 'Evento industrial'
  )
$$, 'Otro acepta y conserva el detalle');
SELECT is(
  (SELECT canal_detalle FROM public.pipeline WHERE id = '00000000-0000-4000-8000-0000000c1302'),
  'Evento industrial',
  'El detalle de Otro queda persistido'
);
SELECT lives_ok($$
  UPDATE public.pipeline SET canal = 'correo'
  WHERE id = '00000000-0000-4000-8000-0000000c1302'
$$, 'Acepta una variante legacy de un canal catalogado');
SELECT is(
  (SELECT canal FROM public.pipeline WHERE id = '00000000-0000-4000-8000-0000000c1302'),
  'CORREO',
  'La variante legacy queda normalizada al código estable'
);
UPDATE public.catalogo_canales SET activo = false WHERE codigo = 'CORREO';
SELECT lives_ok($$
  UPDATE public.pipeline SET canal = 'Correo'
  WHERE id = '00000000-0000-4000-8000-0000000c1302'
$$, 'Un RFQ conserva su canal histórico después de desactivarlo');
SELECT throws_ok($$
  INSERT INTO public.pipeline (
    folio_op, nombre_contacto, empresa, vendedor_id, canal
  ) VALUES (
    'OP-CANAL-INACTIVO', 'Contacto', 'Empresa',
    '00000000-0000-4000-8000-0000000c1301', 'CORREO'
  )
$$, '23514', 'canal_rfq_inactivo', 'Un canal inactivo no se puede elegir en un RFQ nuevo');
SELECT throws_ok($$
  UPDATE public.pipeline SET canal = 'NO_EXISTE'
  WHERE id = '00000000-0000-4000-8000-0000000c1302'
$$, '23514', 'canal_rfq_no_catalogado', 'No se eligen canales fuera del catálogo');

SELECT * FROM finish();
ROLLBACK;
