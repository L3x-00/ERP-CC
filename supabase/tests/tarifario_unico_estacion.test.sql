-- Obs. cliente 2026-10-13 — Tarifario único: Tarifas / TC alimenta el ruteo.
-- Verifica: columna y constraint del vínculo grupo→estación, lectura de la
-- tarifa de la estación (con y sin valores en el JSON), resolución
-- recurso > grupo propio > estación > error, snapshot con fuente ESTACION y
-- privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(21);

INSERT INTO public.grupos_equipo (id, codigo, nombre, estacion_tarifa) VALUES
  ('00000000-0000-4000-8000-0000000e0001', 'TU_LASER', 'Láser TU', 'laser'),
  ('00000000-0000-4000-8000-0000000e0002', 'TU_SOLO', 'Sin vínculo TU', NULL);
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, grupo_equipo_id) VALUES
  ('00000000-0000-4000-8000-0000000e0011', 'TU-L1', 'sheet_metal', 'Láser 1 TU', '00000000-0000-4000-8000-0000000e0001');

-- 1-3. Estructura
SELECT has_column('public', 'grupos_equipo', 'estacion_tarifa', 'El grupo puede vincularse a una estación de Tarifas / TC');
SELECT throws_ok($$
  UPDATE public.grupos_equipo SET estacion_tarifa = 'plasma' WHERE codigo = 'TU_LASER'
$$, '23514', NULL, 'solo se aceptan las estaciones conocidas');
SELECT matches(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'propuesta_item_ruteo_snapshot_costeo'),
  'ESTACION', 'El snapshot del ruteo acepta la fuente ESTACION');

-- 4-9. tarifa_estacion_hora: valores por defecto cuando el JSON no trae estaciones
UPDATE public.configuracion_sistema SET tarifas_json = '{}'::jsonb WHERE id = 'main';
SELECT is(public.tarifa_estacion_hora('laser'), 650::numeric, 'láser: defecto del cotizador');
SELECT is(public.tarifa_estacion_hora('router'), 550::numeric, 'router: defecto del cotizador');
SELECT is(public.tarifa_estacion_hora('doblado'), 600::numeric, 'dobladora: defecto del cotizador');
SELECT is(public.tarifa_estacion_hora('soldadura'), 450::numeric, 'soldadura: defecto del cotizador');
SELECT is(public.tarifa_estacion_hora('mano_obra'), 350::numeric, 'mano de obra: defecto del cotizador');
SELECT is(public.tarifa_estacion_hora('acabado'), 300::numeric, 'acabado: defecto del cotizador');

-- 10-12. Con valores guardados en Tarifas / TC mandan esos; un valor inválido cae al defecto
UPDATE public.configuracion_sistema
SET tarifas_json = jsonb_build_object('estaciones', jsonb_build_object(
  'laser', jsonb_build_object('maquinaHora', 777.25),
  'router', jsonb_build_object('maquinaHora', 'mucho'),
  'fabricacion', jsonb_build_object('soldaduraHora', 480)
))
WHERE id = 'main';
SELECT is(public.tarifa_estacion_hora('laser'), 777.25::numeric, 'usa la tarifa guardada en Tarifas / TC');
SELECT is(public.tarifa_estacion_hora('soldadura'), 480::numeric, 'usa la tarifa guardada de fabricación');
SELECT is(public.tarifa_estacion_hora('router'), 550::numeric, 'un valor no numérico cae al defecto');

-- 13. Estación desconocida
SELECT throws_ok($$ SELECT public.tarifa_estacion_hora('plasma') $$, '22023', 'estacion_tarifa_invalida',
  'una estación desconocida se rechaza');

-- 14-15. Resolución: sin tarifa propia usa la estación vinculada
SELECT is(
  public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000e0001'),
  jsonb_build_object('tarifa', 777.25, 'moneda', 'MXN', 'fuente', 'ESTACION', 'estacion', 'laser',
    'grupo_equipo_id', '00000000-0000-4000-8000-0000000e0001'::uuid, 'recurso_id', NULL),
  'sin tarifa propia el grupo toma la de su estación vinculada');
SELECT is(
  public.resolver_tarifa_hora(NULL, '00000000-0000-4000-8000-0000000e0011')->>'fuente',
  'ESTACION', 'un recurso sin override usa la estación de su grupo');

-- 16. La tarifa propia del grupo gana a la estación
UPDATE public.grupos_equipo SET tarifa_hora = 900, tarifa_moneda = 'USD' WHERE codigo = 'TU_LASER';
SELECT is(
  public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000e0001')->>'fuente',
  'GRUPO', 'la tarifa propia del grupo tiene prioridad sobre la estación');

-- 17. El override del recurso gana a todo
UPDATE public.recursos_planeacion
SET tarifa_override_activa = true, tarifa_override_hora = 5, tarifa_override_moneda = 'MXN'
WHERE codigo = 'TU-L1';
SELECT is(
  public.resolver_tarifa_hora(NULL, '00000000-0000-4000-8000-0000000e0011')->>'fuente',
  'RECURSO', 'el override explícito del recurso tiene prioridad total');

-- 18. Sin tarifa propia ni estación sigue bloqueando con código estable
SELECT throws_ok($$
  SELECT public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000e0002')
$$, '23514', 'tarifa_no_configurada', 'sin tarifa ni estación el costeo se bloquea');

-- 19-21. Privilegios
SELECT ok(has_function_privilege('service_role', 'public.tarifa_estacion_hora(text)', 'EXECUTE'),
  'service_role lee la tarifa de la estación');
SELECT ok(NOT has_function_privilege('authenticated', 'public.tarifa_estacion_hora(text)', 'EXECUTE'),
  'authenticated no ejecuta la lectura directa');
SELECT ok(NOT has_function_privilege('anon', 'public.tarifa_estacion_hora(text)', 'EXECUTE'),
  'anon no ejecuta la lectura directa');

SELECT * FROM finish();
ROLLBACK;
