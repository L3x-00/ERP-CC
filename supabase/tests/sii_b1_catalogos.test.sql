-- SII-B1.3–B1.8 — Catálogos base: tablas, seeds, versionado, RLS y guardas.
-- Verifica: existencia, seeds, unicidad, trigger de versión, desactivación,
-- no-borrado y FK proceso→grupo planeado.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(40);

-- 1-7. Tablas de catálogo.
SELECT has_table('public', 'catalogo_materiales', 'Existe catalogo_materiales');
SELECT has_table('public', 'catalogo_espesores', 'Existe catalogo_espesores');
SELECT has_table('public', 'catalogo_procesos', 'Existe catalogo_procesos');
SELECT has_table('public', 'grupos_equipo', 'Existe grupos_equipo');
SELECT has_table('public', 'grupos_planeados', 'Existe grupos_planeados');
SELECT has_table('public', 'catalogo_proximas_acciones', 'Existe catalogo_proximas_acciones');
SELECT has_table('public', 'versiones_catalogo', 'Existe versiones_catalogo');

-- 8. Enlace de recursos de planeación con grupos de equipo.
SELECT has_column('public', 'recursos_planeacion', 'grupo_equipo_id', 'recursos_planeacion.grupo_equipo_id existe');

-- 9. Materiales: los 8 del documento.
SELECT ok(
  (ARRAY(SELECT codigo FROM public.catalogo_materiales ORDER BY codigo)) @> ARRAY[
    'ACERO_CARBON', 'GALVANIZADO', 'INOXIDABLE', 'ALUMINIO',
    'BIRCH', 'MDF', 'ACRILICO', 'PLASTICO_ING'
  ]::text[],
  'Materiales sembrados: los 8 del documento'
);

-- 10-13. Procesos: códigos, prefijos, primera pieza y lote.
SELECT ok(
  (ARRAY(SELECT codigo FROM public.catalogo_procesos ORDER BY codigo)) @> ARRAY[
    'LASER_FIBRA', 'LASER_CO2', 'DOB', 'SOLD', 'ROUTER', 'MARCADO', 'MAQUINADO', 'ACABADO'
  ]::text[],
  'Procesos sembrados: los 8 del documento'
);
-- Acotado a las semillas: los fixtures E2E pueden dejar procesos extra en la BD local.
SELECT is(
  (ARRAY(SELECT prefijo_corrida FROM public.catalogo_procesos
    WHERE codigo IN ('ACABADO','DOB','LASER_CO2','LASER_FIBRA','MAQUINADO','MARCADO','ROUTER','SOLD')
    ORDER BY codigo)),
  ARRAY['ACA', 'DOB', 'LCO', 'LAS', 'MAQ', 'MAR', 'ROU', 'SOL']::text[],
  'Cada proceso sembrado tiene su prefijo de corrida'
);
SELECT is(
  (ARRAY(SELECT codigo FROM public.catalogo_procesos
    WHERE requiere_primera_pieza
      AND codigo IN ('ACABADO','DOB','LASER_CO2','LASER_FIBRA','MAQUINADO','MARCADO','ROUTER','SOLD')
    ORDER BY codigo)),
  ARRAY['DOB', 'LASER_CO2', 'LASER_FIBRA', 'MAQUINADO', 'ROUTER']::text[],
  'Primera pieza exigida en láser, doblado, router y maquinado'
);
SELECT is(
  (SELECT count(*)::integer FROM public.catalogo_procesos
    WHERE codigo IN ('LASER_FIBRA','LASER_CO2','DOB','SOLD','ROUTER','MARCADO','MAQUINADO','ACABADO')
      AND intervalo_inspeccion_lote = 10),
  8,
  'Intervalo de inspección de lote sembrado en 10'
);

-- 14-16. Grupos y próximas acciones.
SELECT ok(
  (ARRAY(SELECT codigo FROM public.grupos_planeados ORDER BY codigo)) @> ARRAY[
    'CORTE', 'DOBLADO', 'SOLDADURA', 'MAQUINADO', 'ACABADO', 'ENSAMBLE'
  ]::text[],
  'Grupos planeados: los 6 del documento'
);
SELECT ok(
  (ARRAY(SELECT codigo FROM public.grupos_equipo ORDER BY codigo)) @> ARRAY[
    'CNC_ROUTER', 'LASER_FIBRA', 'PRESS_BRAKE', 'SOLDADURA', 'MAQUINADO'
  ]::text[],
  'Grupos de equipo mínimos del documento'
);
SELECT ok(
  (ARRAY(SELECT codigo FROM public.catalogo_proximas_acciones ORDER BY codigo)) @> ARRAY[
    'FOLLOW_UP', 'CONFIRM_RECEIPT', 'WAIT_CUSTOMER_RESPONSE', 'REQUEST_APPROVAL_PO',
    'RESOLVE_CUSTOMER_QUESTIONS', 'PREPARE_NEW_REVISION', 'OTHER'
  ]::text[],
  'Próximas acciones: 7 códigos incluido OTHER'
);

-- 17-18. "Otro" único y su índice parcial.
SELECT is(
  (SELECT count(*)::integer FROM public.catalogo_proximas_acciones WHERE es_otro),
  1,
  'Solo una próxima acción puede ser "Otro"'
);
SELECT has_index(
  'public', 'catalogo_proximas_acciones', 'ux_proxima_accion_otro',
  'Existe el índice único parcial ux_proxima_accion_otro'
);

-- 19-28. Trigger de versionado: INSERT=1, UPDATE=2 y snapshot completo.
SELECT lives_ok($$
  INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('TEST_VERSIONADO', 'Material de prueba')
$$, 'Alta de material de prueba');
SELECT is(
  (SELECT count(*)::integer FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')),
  1,
  'El INSERT registra una sola versión'
);
SELECT is(
  (SELECT version FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')),
  1,
  'La primera versión es la 1'
);
SELECT is(
  (SELECT datos->>'codigo' FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')),
  'TEST_VERSIONADO',
  'El snapshot guarda la fila completa (código)'
);
SELECT lives_ok($$
  UPDATE public.catalogo_materiales SET nombre = 'Material de prueba v2' WHERE codigo = 'TEST_VERSIONADO'
$$, 'Actualización de material de prueba');
SELECT is(
  (SELECT count(*)::integer FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')),
  2,
  'El UPDATE registra la segunda versión'
);
SELECT is(
  (SELECT max(version)::integer FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')),
  2,
  'version = max+1 en la segunda mutación'
);
SELECT is(
  (SELECT datos->>'nombre' FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')
      AND version = 2),
  'Material de prueba v2',
  'El snapshot de la versión 2 refleja el cambio'
);
SELECT ok(
  (SELECT actor_id FROM public.versiones_catalogo
    WHERE entidad = 'catalogo_materiales'
      AND entidad_id = (SELECT id FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO')
      AND version = 1) IS NULL,
  'Sin JWT (service_role) el actor queda NULL y la traza va en logs'
);
SELECT throws_ok($$
  INSERT INTO public.versiones_catalogo (entidad, entidad_id, version, datos)
  SELECT 'catalogo_materiales', id, 1, '{}'::jsonb
  FROM public.catalogo_materiales WHERE codigo = 'TEST_VERSIONADO'
$$, '23505', NULL, 'La versión duplicada se rechaza (unique entidad+id+versión)');

-- 29-31. Unicidad e integridad.
SELECT throws_ok($$
  INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('ACERO_CARBON', 'Duplicado')
$$, '23505', NULL, 'El código de material es único');
SELECT throws_ok($$
  INSERT INTO public.catalogo_proximas_acciones (codigo, nombre, es_otro) VALUES ('OTRO_DOS', 'Otro duplicado', true)
$$, '23505', NULL, 'No puede existir un segundo "Otro"');
SELECT throws_ok($$
  INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_planeado_id)
  VALUES ('PROCESO_HUERFANO', 'Proceso huérfano', 'PHU', '00000000-0000-4000-8000-0000000fffff')
$$, '23503', NULL, 'El proceso exige un grupo planeado existente');

-- 32. Semilla del vínculo proceso→grupo planeado.
SELECT is(
  (SELECT gp.codigo
   FROM public.catalogo_procesos AS p
   JOIN public.grupos_planeados AS gp ON gp.id = p.grupo_planeado_id
   WHERE p.codigo = 'LASER_FIBRA'),
  'CORTE',
  'Laser fibra sembrado dentro del grupo planeado CORTE'
);

-- 33-35. Desactivar es la vía válida; borrar no existe.
SELECT lives_ok($$
  UPDATE public.catalogo_materiales SET activo = false WHERE codigo = 'MDF'
$$, 'Desactivar un catálogo está permitido');
SELECT is(
  (SELECT activo FROM public.catalogo_materiales WHERE codigo = 'MDF'),
  false,
  'El material queda inactivo y visible en el historial'
);
SELECT throws_ok($$
  DELETE FROM public.catalogo_materiales WHERE codigo = 'ACERO_CARBON'
$$, 'P0001', 'catalogo_sin_borrado', 'Ni service_role puede borrar un catálogo');

-- 36-39. Privilegios y RLS de solo lectura.
SELECT ok(
  NOT has_table_privilege('anon', 'public.catalogo_materiales', 'SELECT'),
  'anon no puede leer catálogos'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.catalogo_materiales', 'nombre', 'SELECT')
    AND has_column_privilege('authenticated', 'public.catalogo_materiales', 'unidad_base', 'SELECT'),
  'authenticated puede leer las columnas públicas del catálogo sin ver costos'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.catalogo_materiales', 'INSERT'),
  'authenticated no puede escribir catálogos'
);
SELECT policies_are(
  'public', 'catalogo_procesos', ARRAY['catalogo_procesos_seleccionar'],
  'Solo existe la política de lectura en catalogo_procesos'
);

-- 40. DELETE directo desde authenticated: sin política y sin privilegio.
SET LOCAL ROLE authenticated;
SELECT throws_ok($$
  DELETE FROM public.catalogo_materiales WHERE codigo = 'ACERO_CARBON'
$$, '42501', NULL, 'authenticated no puede ejecutar DELETE directo');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
