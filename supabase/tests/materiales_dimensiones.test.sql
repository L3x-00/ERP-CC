-- Materiales — ancho y largo opcionales (mm) en catalogo_materiales.
-- Cubre: columnas aditivas NULL, materiales existentes intactos, límites del
-- CHECK, limpieza a NULL, escritura con service_role (rol de la app), versionado
-- del catálogo y que los permisos de escritura no se amplían.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(26);

-- Verdadero si la sentencia falla (cualquier código); útil para valores
-- especiales cuyo código depende de la versión de PostgreSQL (±Infinity).
CREATE FUNCTION pg_temp.rechaza(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$f$;

-- Material «preexistente»: se crea sin dimensiones, como los del catálogo actual.
INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000d0101', 'DIM_BASE', 'Material sin dimensiones');

-- 1-5. Estructura aditiva: columnas nulables y sus dos restricciones.
SELECT has_column('public', 'catalogo_materiales', 'ancho_mm', 'Existe ancho_mm');
SELECT has_column('public', 'catalogo_materiales', 'largo_mm', 'Existe largo_mm');
SELECT col_is_null('public', 'catalogo_materiales', 'ancho_mm', 'ancho_mm admite NULL (opcional)');
SELECT col_is_null('public', 'catalogo_materiales', 'largo_mm', 'largo_mm admite NULL (opcional)');
SELECT is(
  (SELECT count(*) FROM pg_constraint
   WHERE conrelid = 'public.catalogo_materiales'::regclass
     AND conname IN ('catalogo_materiales_ancho_mm_valido', 'catalogo_materiales_largo_mm_valido')),
  2::bigint,
  'Existen los CHECK de ancho y largo');

-- 6. Compatibilidad: un material sin dimensiones queda con NULL.
SELECT is(
  (SELECT ancho_mm IS NULL AND largo_mm IS NULL
   FROM public.catalogo_materiales WHERE id = '00000000-0000-4000-8000-0000000d0101'),
  true,
  'Un material existente conserva ancho y largo en NULL');

-- 7-9. Alta con dimensiones.
SELECT lives_ok($$
  INSERT INTO public.catalogo_materiales (id, codigo, nombre, ancho_mm, largo_mm)
  VALUES ('00000000-0000-4000-8000-0000000d0102', 'DIM_A', 'Material con dimensiones', 1219.2, 2438.4)
$$, 'Se puede dar de alta un material con ancho y largo');
SELECT is(
  (SELECT ancho_mm FROM public.catalogo_materiales WHERE codigo = 'DIM_A'),
  1219.2::numeric, 'Se guarda el ancho');
SELECT is(
  (SELECT largo_mm FROM public.catalogo_materiales WHERE codigo = 'DIM_A'),
  2438.4::numeric, 'Se guarda el largo');

-- 10-12. Límites válidos: 0.001 y 99999.999.
SELECT lives_ok($$
  UPDATE public.catalogo_materiales SET ancho_mm = 0.001, largo_mm = 99999.999 WHERE codigo = 'DIM_A'
$$, 'Se aceptan los valores límite');
SELECT is(
  (SELECT ancho_mm FROM public.catalogo_materiales WHERE codigo = 'DIM_A'),
  0.001::numeric, 'El mínimo es 0.001 mm');
SELECT is(
  (SELECT largo_mm FROM public.catalogo_materiales WHERE codigo = 'DIM_A'),
  99999.999::numeric, 'El máximo es 99999.999 mm');

-- 13-19. Valores inválidos rechazados por la base aunque se salte la validación de la app.
SELECT throws_ok($$UPDATE public.catalogo_materiales SET ancho_mm = 0 WHERE codigo = 'DIM_A'$$,
  '23514', NULL, 'El ancho cero se rechaza');
SELECT throws_ok($$UPDATE public.catalogo_materiales SET ancho_mm = -1 WHERE codigo = 'DIM_A'$$,
  '23514', NULL, 'El ancho negativo se rechaza');
SELECT throws_ok($$UPDATE public.catalogo_materiales SET largo_mm = 100000 WHERE codigo = 'DIM_A'$$,
  '23514', NULL, 'Un largo sobre el máximo se rechaza');
SELECT throws_ok($$UPDATE public.catalogo_materiales SET largo_mm = -0.001 WHERE codigo = 'DIM_A'$$,
  '23514', NULL, 'El largo negativo se rechaza');
SELECT ok(
  pg_temp.rechaza($$UPDATE public.catalogo_materiales SET ancho_mm = 'NaN'::numeric WHERE codigo = 'DIM_A'$$),
  'NaN se rechaza');
SELECT ok(
  pg_temp.rechaza($$UPDATE public.catalogo_materiales SET largo_mm = 'Infinity'::numeric WHERE codigo = 'DIM_A'$$),
  'Infinity se rechaza');
SELECT ok(
  pg_temp.rechaza($$UPDATE public.catalogo_materiales SET largo_mm = '-Infinity'::numeric WHERE codigo = 'DIM_A'$$),
  '-Infinity se rechaza');

-- 20-21. Limpieza: NULL borra las dimensiones guardadas.
SELECT lives_ok($$
  UPDATE public.catalogo_materiales SET ancho_mm = NULL, largo_mm = NULL WHERE codigo = 'DIM_A'
$$, 'Se pueden limpiar ancho y largo');
SELECT is(
  (SELECT ancho_mm IS NULL AND largo_mm IS NULL FROM public.catalogo_materiales WHERE codigo = 'DIM_A'),
  true, 'Tras limpiar quedan en NULL');

-- 22. service_role (rol con el que escribe la app): alta, edición y limpieza parcial.
SELECT lives_ok($test$
DO $body$
DECLARE
  v_ancho numeric;
  v_largo numeric;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.catalogo_materiales (id, codigo, nombre, ancho_mm, largo_mm)
  VALUES ('00000000-0000-4000-8000-0000000d0103', 'DIM_SVC', 'Material service_role', 600, 1200);
  UPDATE public.catalogo_materiales
  SET ancho_mm = 610.5, largo_mm = NULL
  WHERE codigo = 'DIM_SVC';
  SELECT ancho_mm, largo_mm INTO v_ancho, v_largo
  FROM public.catalogo_materiales WHERE codigo = 'DIM_SVC';
  RESET ROLE;
  IF v_ancho IS DISTINCT FROM 610.5 OR v_largo IS NOT NULL THEN
    RAISE EXCEPTION 'dimensiones inesperadas: % / %', v_ancho, v_largo;
  END IF;
END $body$;
$test$, 'service_role inserta, edita y limpia dimensiones');

-- 23-25. El versionado del catálogo captura las dimensiones de cada cambio.
SELECT is(
  (SELECT (datos ->> 'ancho_mm')::numeric FROM public.versiones_catalogo
   WHERE entidad = 'catalogo_materiales'
     AND entidad_id = '00000000-0000-4000-8000-0000000d0103' AND version = 1),
  600::numeric, 'La versión 1 guarda el ancho inicial');
SELECT is(
  (SELECT (datos ->> 'ancho_mm')::numeric FROM public.versiones_catalogo
   WHERE entidad = 'catalogo_materiales'
     AND entidad_id = '00000000-0000-4000-8000-0000000d0103' AND version = 2),
  610.5::numeric, 'La versión 2 guarda el ancho editado');
SELECT is(
  (SELECT datos -> 'largo_mm' FROM public.versiones_catalogo
   WHERE entidad = 'catalogo_materiales'
     AND entidad_id = '00000000-0000-4000-8000-0000000d0103' AND version = 2),
  'null'::jsonb, 'La versión 2 registra el largo limpiado');

-- 26. Los permisos no se amplían: authenticated no escribe las columnas nuevas.
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.catalogo_materiales', 'ancho_mm', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.catalogo_materiales', 'largo_mm', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.catalogo_materiales', 'ancho_mm', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.catalogo_materiales', 'largo_mm', 'INSERT'),
  'authenticated no puede insertar ni actualizar las dimensiones');

SELECT * FROM finish();
ROLLBACK;
