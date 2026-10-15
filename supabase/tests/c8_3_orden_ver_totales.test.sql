-- C8.3 (O-04) — Permiso `orden_ver_totales`: precios, totales y documento comercial de la Orden
-- sin abrir `ver_finanzas` (Cobranza, Gastos, Compras, Tesorería).
-- Verifica el catálogo y la matriz sembrada: Customer Service (vendedor), Administrative
-- (contador), Management (gerente) y Admin ven totales; Operator (operador) nunca.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

-- 1. Catálogo
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.permisos
    WHERE codigo = 'orden_ver_totales' AND modulo = 'ordenes' AND activo
  ),
  'El catálogo incluye orden_ver_totales (módulo ordenes, activo)'
);

-- 2-5. Roles que ven precios, totales y documento comercial (O-04)
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'admin' AND permiso = 'orden_ver_totales'),
  'Admin tiene orden_ver_totales'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'gerente' AND permiso = 'orden_ver_totales'),
  'Management (gerente) tiene orden_ver_totales'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'contador' AND permiso = 'orden_ver_totales'),
  'Administrative (contador) tiene orden_ver_totales'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'vendedor' AND permiso = 'orden_ver_totales'),
  'Customer Service (vendedor) tiene orden_ver_totales'
);

-- 6. El operador nunca ve precios ni totales
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'operador' AND permiso = 'orden_ver_totales'),
  'Operator (operador) NO tiene orden_ver_totales'
);

-- 7-8. Customer Service consulta la ficha de la Orden; el operador la hoja en Producción, no en Órdenes
SELECT ok(
  EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'vendedor' AND permiso = 'orden_vista'),
  'Customer Service (vendedor) tiene orden_vista para consultar la ficha'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.permisos_rol WHERE rol = 'operador' AND permiso = 'orden_vista'),
  'Operator (operador) NO tiene orden_vista (consulta la hoja desde Producción)'
);

-- 9. Sin regresión: todo rol que ya veía finanzas conserva los totales de la Orden
SELECT is(
  (SELECT count(*)::integer
   FROM public.permisos_rol finanzas
   WHERE finanzas.permiso = 'ver_finanzas'
     AND NOT EXISTS (
       SELECT 1 FROM public.permisos_rol totales
       WHERE totales.rol = finanzas.rol AND totales.permiso = 'orden_ver_totales'
     )),
  0,
  'Todo rol con ver_finanzas conserva orden_ver_totales'
);

-- 10. El permiso nuevo no abre finanzas: vendedor y gerente siguen sin ver_finanzas
SELECT is(
  (SELECT count(*)::integer
   FROM public.permisos_rol
   WHERE rol IN ('vendedor', 'gerente') AND permiso = 'ver_finanzas'),
  0,
  'orden_ver_totales no concede ver_finanzas a vendedor ni gerente'
);

SELECT * FROM finish();
ROLLBACK;
