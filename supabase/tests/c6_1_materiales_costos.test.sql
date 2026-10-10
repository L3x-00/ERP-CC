-- C6.1 — maestro canónico, propuesta/confirmación y bitácora append-only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(29);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c6101', 'c61-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c6102', 'c61-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true WHERE id = '00000000-0000-4000-8000-0000000c6101';
UPDATE public.usuarios SET rol = 'vendedor', activo = true WHERE id = '00000000-0000-4000-8000-0000000c6102';
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base)
VALUES ('00000000-0000-4000-8000-0000000c6110', 'C61ACERO', 'Acero C61', 'kg');

SELECT has_column('public', 'catalogo_materiales', 'unidad_base', 'el maestro tiene unidad base');
SELECT has_column('public', 'catalogo_materiales', 'moneda_costo', 'el maestro tiene moneda de costo');
SELECT has_column('public', 'catalogo_materiales', 'costo_vigente', 'el maestro tiene último costo confirmado');
SELECT has_table('public', 'propuestas_costo_material', 'existe la bandeja de propuestas');
SELECT has_table('public', 'historial_costos_material', 'existe la bitácora de costos');

SELECT throws_ok($$UPDATE public.catalogo_materiales SET unidad_base = ' kg ' WHERE codigo = 'C61ACERO'$$,
  '23514', NULL, 'la unidad base no admite espacios ambiguos');
SELECT throws_ok($$INSERT INTO public.catalogo_materiales (codigo, nombre, moneda_costo)
  VALUES ('C61INVALIDO', 'Inválido C61', 'EUR')$$,
  '23514', NULL, 'solo MXN o USD');
SELECT throws_ok($$UPDATE public.catalogo_materiales SET costo_vigente = 10 WHERE codigo = 'C61ACERO'$$,
  '42501', 'costo_requiere_confirmacion', 'nadie cambia el costo directamente');

CREATE TEMP TABLE c61 ON COMMIT DROP AS
SELECT public.proponer_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 12.5, 'usd', current_date,
  'GASTO', 'GAS-C61-01', '00000000-0000-4000-8000-0000000c6101'
) AS propuesta_id;
SELECT is((SELECT costo_vigente FROM public.catalogo_materiales WHERE codigo = 'C61ACERO'),
  NULL::numeric, 'proponer no cambia el costo maestro');
SELECT is((SELECT fuente FROM public.propuestas_costo_material WHERE id = (SELECT propuesta_id FROM c61)),
  'GASTO', 'la propuesta conserva su fuente');
SELECT is((SELECT referencia FROM public.propuestas_costo_material WHERE id = (SELECT propuesta_id FROM c61)),
  'GAS-C61-01', 'la propuesta conserva su referencia');
SELECT throws_ok($$SELECT public.proponer_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 13, 'MXN', current_date,
  'COMPRA', 'OC-C61', '00000000-0000-4000-8000-0000000c6102')$$,
  '42501', 'sin_permiso_materiales', 'un actor no autorizado no propone costos');

SELECT lives_ok(format($sql$SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 12.5, 'USD', current_date,
  'GASTO', 'GAS-C61-01', '00000000-0000-4000-8000-0000000c6101', %L, %L)$sql$,
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE codigo = 'C61ACERO'),
  (SELECT propuesta_id FROM c61)), 'la confirmación autorizada cambia el maestro');
SELECT is((SELECT costo_vigente FROM public.catalogo_materiales WHERE codigo = 'C61ACERO'),
  12.5000::numeric, 'queda el costo confirmado');
SELECT is((SELECT moneda_costo FROM public.catalogo_materiales WHERE codigo = 'C61ACERO'),
  'USD', 'queda la moneda confirmada');
SELECT is((SELECT estado FROM public.propuestas_costo_material WHERE id = (SELECT propuesta_id FROM c61)),
  'CONFIRMADA', 'la propuesta queda confirmada');
SELECT is((SELECT fuente FROM public.historial_costos_material WHERE material_id = '00000000-0000-4000-8000-0000000c6110'),
  'GASTO', 'el historial congela la fuente');
SELECT is((SELECT actor_id FROM public.historial_costos_material WHERE material_id = '00000000-0000-4000-8000-0000000c6110'),
  '00000000-0000-4000-8000-0000000c6101'::uuid, 'el historial congela el actor');
SELECT throws_ok($$UPDATE public.historial_costos_material SET costo_nuevo = 99$$,
  '42501', 'historial_costos_append_only', 'el historial no se modifica');
SELECT throws_ok($$DELETE FROM public.historial_costos_material$$,
  '42501', 'historial_costos_append_only', 'el historial no se elimina');
SELECT throws_ok(format($sql$SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 12.5, 'USD', current_date,
  'GASTO', 'GAS-C61-01', '00000000-0000-4000-8000-0000000c6101', %L, %L)$sql$,
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE codigo = 'C61ACERO'),
  (SELECT propuesta_id FROM c61)), '23514', 'propuesta_costo_no_coincide',
  'una propuesta confirmada no se aplica dos veces');
SELECT throws_ok(format($sql$SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 20, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-0000000c6101', '2000-01-01', NULL)$sql$),
  '40001', 'material_desactualizado', 'el CAS impide pisar una edición reciente');
SELECT lives_ok(format($sql$SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-0000000c6110', 20, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-0000000c6101', %L, NULL)$sql$,
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE codigo = 'C61ACERO')),
  'permite confirmar costo manual sin propuesta');
SELECT is((SELECT count(*) FROM public.historial_costos_material
  WHERE material_id = '00000000-0000-4000-8000-0000000c6110'), 2::bigint,
  'cada confirmación agrega exactamente una versión');
SELECT is((SELECT costo_anterior FROM public.historial_costos_material
  WHERE fuente = 'MANUAL' AND material_id = '00000000-0000-4000-8000-0000000c6110'),
  12.5000::numeric, 'la versión manual conserva el costo anterior');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.confirmar_costo_material(uuid,numeric,text,date,text,text,uuid,timestamptz,uuid)', 'EXECUTE'),
  'authenticated no ejecuta la confirmación privilegiada');
SELECT ok(has_function_privilege('service_role',
  'public.confirmar_costo_material(uuid,numeric,text,date,text,text,uuid,timestamptz,uuid)', 'EXECUTE'),
  'service_role ejecuta la confirmación');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalogo_materiales', 'costo_vigente', 'SELECT'),
  'el costo no se filtra por el catálogo general');
SELECT ok(has_column_privilege('authenticated', 'public.catalogo_materiales', 'nombre', 'SELECT'),
  'las columnas públicas del catálogo siguen disponibles');

SELECT * FROM finish();
ROLLBACK;
