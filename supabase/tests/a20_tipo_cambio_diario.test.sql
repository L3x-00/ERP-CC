-- A20 / ACC-06: vigencia dedicada del tipo de cambio diario.
-- La fecha del TC no puede depender de `actualizado_en`, que cambia con
-- cualquier sección de configuración.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000a2001', 'a20-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000a2002', 'a20-vendedor@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin'
WHERE id = '00000000-0000-4000-8000-0000000a2001';

SELECT has_column(
  'public', 'configuracion_sistema', 'tipo_cambio_actualizado_en',
  'Existe la fecha dedicada de la última captura del TC'
);
SELECT has_column(
  'public', 'configuracion_sistema', 'tipo_cambio_actualizado_por',
  'Existe el actor de la última captura del TC'
);
SELECT col_type_is(
  'public', 'configuracion_sistema', 'tipo_cambio_actualizado_en', 'timestamp with time zone',
  'La fecha del TC es timestamptz'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.actualizar_configuracion_seccion(text,jsonb,numeric,uuid)',
    'EXECUTE'
  ),
  false,
  'La RPC de configuración solo la ejecuta el servidor'
);

-- Captura inicial del día.
CREATE TEMP TABLE a20_tc AS
SELECT public.actualizar_configuracion_seccion(
  'tipo_cambio', NULL, 18.75, '00000000-0000-4000-8000-0000000a2001'
) AS datos;

SELECT is(
  ((SELECT datos FROM a20_tc) ->> 'tipo_cambio_usd')::numeric,
  18.7500::numeric,
  'La RPC guarda el TC redondeado a 4 decimales'
);
SELECT is(
  (SELECT datos FROM a20_tc) ->> 'tipo_cambio_actualizado_por',
  '00000000-0000-4000-8000-0000000a2001',
  'La RPC registra al administrador que capturó el TC'
);
SELECT ok(
  ((SELECT datos FROM a20_tc) ->> 'tipo_cambio_actualizado_en') IS NOT NULL
  AND (SELECT tipo_cambio_actualizado_en FROM public.configuracion_sistema WHERE id = 'main')
      >= now() - interval '1 minute',
  'La captura del TC sella la fecha con now()'
);

-- Cambiar otra sección no debe mover la vigencia del TC.
CREATE TEMP TABLE a20_empresa AS
SELECT public.actualizar_configuracion_seccion(
  'empresa', '{}'::jsonb, NULL, '00000000-0000-4000-8000-0000000a2001'
) AS datos;

SELECT is(
  (SELECT datos FROM a20_empresa) ->> 'tipo_cambio_actualizado_en',
  (SELECT datos FROM a20_tc) ->> 'tipo_cambio_actualizado_en',
  'Guardar empresa no altera la fecha de vigencia del TC'
);
SELECT is(
  (SELECT datos FROM a20_empresa) ->> 'tipo_cambio_actualizado_por',
  '00000000-0000-4000-8000-0000000a2001',
  'Guardar empresa tampoco pierde al actor del TC'
);

SELECT throws_ok($$
  SELECT public.actualizar_configuracion_seccion(
    'tipo_cambio', NULL, 19, '00000000-0000-4000-8000-0000000a2002')
$$, '42501', 'configuracion_sin_permiso', 'Un vendedor no puede fijar el TC');

SELECT throws_ok($$
  SELECT public.actualizar_configuracion_seccion(
    'tipo_cambio', NULL, 0, '00000000-0000-4000-8000-0000000a2001')
$$, '23514', 'tipo_cambio_invalido', 'Un TC no positivo se rechaza sin mover la fecha');

SELECT * FROM finish();
ROLLBACK;
