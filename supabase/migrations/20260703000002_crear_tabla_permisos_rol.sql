-- =============================================================================
-- Migración: crear tabla permisos_rol
-- Fase 1 — Autenticación + Permisos + Auditoría (ORCA MFG ERP)
-- Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
-- Requiere: 20260703000001_crear_tabla_usuarios.sql (función public.es_admin).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla permisos_rol
-- Matriz de permisos granulares por rol. Los roles son fijos (CHECK constraint);
-- lo configurable es qué permisos tiene cada rol.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permisos_rol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol text NOT NULL CHECK (rol IN ('admin', 'vendedor', 'gerente', 'operador', 'contador')),
  permiso text NOT NULL CHECK (permiso IN (
    'ver_clientes',
    'aprobar_ordenes',
    'registrar_pagos',
    'registrar_gastos',
    'aplicar_saldos',
    'eliminar',
    'ver_finanzas',
    'ver_pipeline_equipo',
    'configuracion',
    'cancelar_ordenes_en_proceso'
  )),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permisos_rol_rol_permiso_unico UNIQUE (rol, permiso)
);

COMMENT ON TABLE public.permisos_rol IS 'Permisos granulares asignados a cada rol del sistema.';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- - SELECT: cualquier usuario autenticado (necesario para resolver permisos
--   propios); nunca anónimos.
-- - INSERT/UPDATE/DELETE: sin políticas — mutaciones solo vía service role
--   (Server Actions con cliente admin, que bypasa RLS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.permisos_rol ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permisos_rol_seleccionar ON public.permisos_rol;
CREATE POLICY permisos_rol_seleccionar
  ON public.permisos_rol
  FOR SELECT
  TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- Seed de permisos por rol
-- admin: 10 | gerente: 4 | vendedor: 2 | contador: 4 | operador: 0
-- -----------------------------------------------------------------------------
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  -- admin: todos los permisos (10)
  ('admin', 'ver_clientes'),
  ('admin', 'aprobar_ordenes'),
  ('admin', 'registrar_pagos'),
  ('admin', 'registrar_gastos'),
  ('admin', 'aplicar_saldos'),
  ('admin', 'eliminar'),
  ('admin', 'ver_finanzas'),
  ('admin', 'ver_pipeline_equipo'),
  ('admin', 'configuracion'),
  ('admin', 'cancelar_ordenes_en_proceso'),
  -- gerente: gestión de equipo y órdenes (4)
  ('gerente', 'ver_clientes'),
  ('gerente', 'aprobar_ordenes'),
  ('gerente', 'ver_pipeline_equipo'),
  ('gerente', 'cancelar_ordenes_en_proceso'),
  -- vendedor: ventas (2)
  ('vendedor', 'ver_clientes'),
  ('vendedor', 'aprobar_ordenes'),
  -- contador: finanzas (4)
  ('contador', 'registrar_pagos'),
  ('contador', 'registrar_gastos'),
  ('contador', 'aplicar_saldos'),
  ('contador', 'ver_finanzas')
  -- operador: sin permisos granulares (0)
ON CONFLICT (rol, permiso) DO NOTHING;
