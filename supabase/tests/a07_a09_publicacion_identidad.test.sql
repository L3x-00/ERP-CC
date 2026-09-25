-- A07–A09: contrato estructural de publicación y políticas. Las pruebas de
-- dos identidades/JWT viejo están en tests/integracion y tests/e2e.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'),
  'La publicación Realtime existe'
);
SELECT is(
  (SELECT count(*)::int FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('clientes','pipeline','cotizacion_lineas','operadores_areas')),
  4, 'Las cuatro tablas faltantes ya están publicadas'
);
SELECT is(
  (SELECT count(*)::int FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN (
       'contactos_cliente','ordenes_produccion','partidas_orden_produccion',
       'cuentas_por_cobrar','pagos_ar','gastos','sesiones_trabajo',
       'registros_consumo_material','metas_vendedor',
       'configuracion_sistema','cuentas_bancarias','areas_trabajo_config')),
  12, 'Las fuentes previas del dashboard y configuración permanecen publicadas'
);
SELECT is(
  (SELECT count(*)::int FROM pg_class WHERE oid IN (
     'public.clientes'::regclass,'public.pipeline'::regclass,
     'public.cotizacion_lineas'::regclass,'public.operadores_areas'::regclass)
     AND relreplident = 'd'),
  4, 'Ninguna tabla comercial nueva requiere REPLICA IDENTITY FULL'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pipeline'::regclass),
  'RLS del pipeline sigue activo'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cotizacion_lineas'::regclass),
  'RLS de líneas sigue activo'
);
SELECT ok(
  (SELECT qual LIKE '%usuario_activo%' FROM pg_policies
   WHERE schemaname='public' AND tablename='pipeline' AND policyname='pipeline_seleccionar'),
  'Lectura de pipeline exige usuario activo'
);
SELECT ok(
  (SELECT qual LIKE '%usuario_activo%' FROM pg_policies
   WHERE schemaname='public' AND tablename='cotizacion_lineas' AND policyname='cotizacion_lineas_seleccionar'),
  'Lectura de líneas exige usuario activo'
);
SELECT ok(
  (SELECT qual LIKE '%usuario_activo%' FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='adjuntos_seleccionar'),
  'Lectura de adjuntos de cotización exige usuario activo'
);
SELECT ok(
  NOT has_function_privilege('anon','privado.usuario_activo()','EXECUTE')
  AND has_function_privilege('authenticated','privado.usuario_activo()','EXECUTE'),
  'El helper solo puede ser ejecutado por autenticados en las políticas'
);

SELECT * FROM finish();
ROLLBACK;
