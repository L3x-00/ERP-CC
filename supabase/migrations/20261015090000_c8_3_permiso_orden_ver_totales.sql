-- =============================================================================
-- C8.3 (respuesta O-04 del cliente, 2026-10-15) — Permiso `orden_ver_totales`
--
-- Customer Service, Administrative, Management y Admin ven precios, totales y el
-- documento comercial de la Orden; Operator no. Hasta ahora esa puerta era
-- `ver_finanzas`, que además abre Cobranza, Gastos, Compras y Tesorería: dárselo a
-- vendedor y gerente sería excesivo. Se crea un permiso propio de la Orden.
--
-- Idempotente y aditiva (no borra ni reemplaza permisos):
--   * catálogo: `orden_ver_totales` (módulo ordenes)
--   * matriz: admin, gerente (Management), contador (Administrative) y vendedor
--     (Customer Service) lo reciben; también todo rol que ya tenga `ver_finanzas`
--     (sin regresión si el PO personalizó la matriz). El operador no.
--   * vendedor recibe `orden_vista`: Customer Service consulta la ficha y la hoja.
--     El operador sigue sin `orden_vista` (su hoja de trabajo vive en Producción).
-- Aplicación: SOLO local hasta autorización del Product Owner.
-- =============================================================================

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('orden_ver_totales', 'ordenes', 'Ver precios, totales y documento comercial de la orden')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('gerente',  'orden_ver_totales'),
  ('contador', 'orden_ver_totales'),
  ('vendedor', 'orden_ver_totales'),
  ('vendedor', 'orden_vista')
ON CONFLICT (rol, permiso) DO NOTHING;

-- Todo rol que ya veía finanzas conserva los totales de la Orden.
INSERT INTO public.permisos_rol (rol, permiso)
SELECT DISTINCT rol, 'orden_ver_totales'
FROM public.permisos_rol
WHERE permiso = 'ver_finanzas'
ON CONFLICT (rol, permiso) DO NOTHING;

-- Admin recibe todo el catálogo (misma convención que la migración del catálogo de permisos).
INSERT INTO public.permisos_rol (rol, permiso)
SELECT 'admin', codigo FROM public.permisos
ON CONFLICT (rol, permiso) DO NOTHING;
