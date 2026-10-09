-- C3.2 — Tarifa estándar por Grupo de Equipo y override por recurso (DC-07).
-- Verifica: constraints de tarifa/moneda, override explícito (cero válido solo
-- si está activo), resolución GRUPO/RECURSO, bloqueo con código estable sin
-- tarifa, versionado del grupo y privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO public.grupos_equipo (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c3201', 'C32LASER', 'Láser C32'),
  ('00000000-0000-4000-8000-0000000c3202', 'C32DOBLEZ', 'Doblez C32');
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, grupo_equipo_id) VALUES
  ('00000000-0000-4000-8000-0000000c3211', 'C32-L1', 'sheet_metal', 'Láser 1 C32', '00000000-0000-4000-8000-0000000c3201'),
  ('00000000-0000-4000-8000-0000000c3212', 'C32-L2', 'sheet_metal', 'Láser 2 C32', '00000000-0000-4000-8000-0000000c3201'),
  ('00000000-0000-4000-8000-0000000c3213', 'C32-SG', 'sheet_metal', 'Sin grupo C32', NULL);

-- 1-4. Constraints
SELECT throws_ok($$
  UPDATE public.grupos_equipo SET tarifa_hora = -1 WHERE codigo = 'C32LASER'
$$, '23514', NULL, 'la tarifa del grupo no puede ser negativa');
SELECT throws_ok($$
  UPDATE public.grupos_equipo SET tarifa_moneda = 'EUR' WHERE codigo = 'C32LASER'
$$, '23514', NULL, 'la moneda del grupo es MXN o USD');
SELECT throws_ok($$
  UPDATE public.recursos_planeacion SET tarifa_override_activa = true WHERE codigo = 'C32-L1'
$$, '23514', NULL, 'un override activo exige tarifa y moneda');
SELECT throws_ok($$
  UPDATE public.recursos_planeacion SET tarifa_override_hora = 10, tarifa_override_moneda = 'MXN'
  WHERE codigo = 'C32-L1'
$$, '23514', NULL, 'sin indicador activo no se guarda un valor de override');

-- 5-6. Sin tarifa: bloqueo con código estable y detalle accionable
SELECT throws_ok($$
  SELECT public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000c3201')
$$, '23514', 'tarifa_no_configurada', 'un grupo sin tarifa bloquea el costeo');
SELECT throws_ok($$
  SELECT public.resolver_tarifa_hora(NULL, '00000000-0000-4000-8000-0000000c3213')
$$, '23514', 'tarifa_sin_grupo', 'un recurso sin grupo ni override bloquea el costeo');

-- 7-8. Tarifa del grupo
UPDATE public.grupos_equipo SET tarifa_hora = 850.5, tarifa_moneda = 'MXN' WHERE codigo = 'C32LASER';
SELECT is(
  public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000c3201'),
  jsonb_build_object('tarifa', 850.5, 'moneda', 'MXN', 'fuente', 'GRUPO',
    'grupo_equipo_id', '00000000-0000-4000-8000-0000000c3201'::uuid, 'recurso_id', NULL),
  'resuelve la tarifa estándar del grupo');
SELECT is(
  public.resolver_tarifa_hora(NULL, '00000000-0000-4000-8000-0000000c3212')->>'fuente',
  'GRUPO', 'un recurso sin override usa la tarifa de su grupo');

-- 9-11. Override explícito, incluido cero
UPDATE public.recursos_planeacion
SET tarifa_override_activa = true, tarifa_override_hora = 0, tarifa_override_moneda = 'USD'
WHERE codigo = 'C32-L1';
SELECT is(
  public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000c3201', '00000000-0000-4000-8000-0000000c3211'),
  jsonb_build_object('tarifa', 0, 'moneda', 'USD', 'fuente', 'RECURSO',
    'grupo_equipo_id', '00000000-0000-4000-8000-0000000c3201'::uuid,
    'recurso_id', '00000000-0000-4000-8000-0000000c3211'::uuid),
  'un override activo en cero es un override válido, no "sin tarifa"');
UPDATE public.recursos_planeacion
SET tarifa_override_activa = true, tarifa_override_hora = 120, tarifa_override_moneda = 'MXN'
WHERE codigo = 'C32-SG';
SELECT is(
  public.resolver_tarifa_hora(NULL, '00000000-0000-4000-8000-0000000c3213')->>'fuente',
  'RECURSO', 'un recurso con override no necesita grupo');
UPDATE public.recursos_planeacion
SET tarifa_override_activa = false, tarifa_override_hora = NULL, tarifa_override_moneda = NULL
WHERE codigo = 'C32-L1';
SELECT is(
  public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000c3201', '00000000-0000-4000-8000-0000000c3211')->>'fuente',
  'GRUPO', 'al retirar el override vuelve a usar el grupo');

-- 12. Grupo de doblez sigue sin tarifa aunque otro grupo la tenga
SELECT throws_ok($$
  SELECT public.resolver_tarifa_hora('00000000-0000-4000-8000-0000000c3202')
$$, '23514', 'tarifa_no_configurada', 'cada grupo exige su propia tarifa');

-- 13-14. Versionado del grupo con la tarifa
SELECT ok(
  (SELECT count(*) FROM public.versiones_catalogo
   WHERE entidad = 'grupos_equipo' AND entidad_id = '00000000-0000-4000-8000-0000000c3201') >= 2,
  'cambiar la tarifa deja una versión del catálogo');
SELECT is(
  (SELECT datos->>'tarifa_hora' FROM public.versiones_catalogo
   WHERE entidad = 'grupos_equipo' AND entidad_id = '00000000-0000-4000-8000-0000000c3201'
   ORDER BY version DESC LIMIT 1),
  '850.5000', 'la versión guarda la tarifa vigente');

-- 15-16. Privilegios
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.resolver_tarifa_hora(uuid, uuid)', 'EXECUTE'),
  'authenticated no ejecuta el resolvedor');
SELECT ok(
  has_function_privilege('service_role', 'public.resolver_tarifa_hora(uuid, uuid)', 'EXECUTE'),
  'service_role ejecuta el resolvedor');

SELECT * FROM finish();
ROLLBACK;
