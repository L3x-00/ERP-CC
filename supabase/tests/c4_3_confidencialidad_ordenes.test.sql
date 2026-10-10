BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(17);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ordenes_produccion', 'SELECT'),
  'authenticated no conserva SELECT de tabla completa sobre ordenes'
);
SELECT ok(has_column_privilege('authenticated', 'public.ordenes_produccion', 'id', 'SELECT'),
  'authenticated conserva columnas operativas de orden');
SELECT ok(NOT has_column_privilege('authenticated', 'public.ordenes_produccion', 'snapshot_json', 'SELECT'),
  'snapshot comercial no es legible directamente');
SELECT ok(NOT has_column_privilege('authenticated', 'public.ordenes_produccion', 'condicion_pago', 'SELECT'),
  'condicion de pago no es legible directamente');
SELECT ok(NOT has_column_privilege('authenticated', 'public.ordenes_produccion', 'monto_sin_iva', 'SELECT'),
  'monto sin IVA no es legible directamente');
SELECT ok(NOT has_column_privilege('authenticated', 'public.ordenes_produccion', 'monto_iva', 'SELECT'),
  'monto de IVA no es legible directamente');
SELECT ok(has_column_privilege('service_role', 'public.ordenes_produccion', 'snapshot_json', 'SELECT'),
  'service_role conserva el snapshot para servicios autorizados');

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.recursos_planeacion', 'SELECT'),
  'authenticated no conserva SELECT de tabla completa sobre recursos');
SELECT ok(has_column_privilege('authenticated', 'public.recursos_planeacion', 'id', 'SELECT'),
  'authenticated conserva columnas operativas del recurso');
SELECT ok(NOT has_column_privilege('authenticated', 'public.recursos_planeacion', 'costo_hora_interno', 'SELECT'),
  'costo interno no es legible por Planeacion/Produccion');
SELECT ok(NOT has_column_privilege('authenticated', 'public.recursos_planeacion', 'tarifa_override_hora', 'SELECT'),
  'tarifa propia no es legible por Planeacion/Produccion');
SELECT ok(NOT has_column_privilege('authenticated', 'public.recursos_planeacion', 'tarifa_override_moneda', 'SELECT'),
  'moneda de tarifa no es legible por Planeacion/Produccion');
SELECT ok(has_column_privilege('service_role', 'public.recursos_planeacion', 'costo_hora_interno', 'SELECT'),
  'service_role conserva costos para costeo autorizado');

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.sesiones_trabajo', 'SELECT'),
  'authenticated no conserva SELECT de tabla completa sobre sesiones'
);
SELECT ok(has_column_privilege('authenticated', 'public.sesiones_trabajo', 'id', 'SELECT'),
  'authenticated conserva columnas operativas de sesion');
SELECT ok(NOT has_column_privilege('authenticated', 'public.sesiones_trabajo', 'costo_hora_interno', 'SELECT'),
  'el costo historico de la sesion no es legible por Produccion');
SELECT ok(has_column_privilege('service_role', 'public.sesiones_trabajo', 'costo_hora_interno', 'SELECT'),
  'service_role conserva el costo historico para Rentabilidad');

SELECT * FROM finish();
ROLLBACK;
