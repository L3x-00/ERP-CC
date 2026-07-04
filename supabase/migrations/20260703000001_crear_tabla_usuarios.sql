-- =============================================================================
-- Migración: crear tabla usuarios
-- Fase 1 — Autenticación + Permisos + Auditoría (ORCA MFG ERP)
-- Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla usuarios
-- Perfil de aplicación vinculado 1:1 con auth.users (Supabase Auth).
-- El id NO tiene DEFAULT: siempre se inserta con el id del usuario de Auth.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nombre_completo text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('admin', 'vendedor', 'gerente', 'operador', 'contador')),
  -- Hash bcrypt del PIN de acceso a piso (solo aplica si rol = 'operador').
  pin_operador text,
  activo boolean NOT NULL DEFAULT true,
  ultimo_login_at timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios IS 'Perfiles de usuario de la aplicación (1:1 con auth.users).';
COMMENT ON COLUMN public.usuarios.pin_operador IS 'Hash bcrypt del PIN de operador de piso. Nunca se envía al cliente.';

-- Índice por rol (consultas de permisos y listados por rol).
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios (rol);

-- -----------------------------------------------------------------------------
-- Función actualizar_timestamp: mantiene actualizado_en en cada UPDATE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_usuarios_actualizado_en ON public.usuarios;
CREATE TRIGGER trigger_usuarios_actualizado_en
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- Función es_admin: helper para políticas RLS.
-- SECURITY DEFINER evita la recursión de RLS al consultar public.usuarios
-- desde las propias políticas de la tabla.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND rol = 'admin' AND activo = true);
$$;

COMMENT ON FUNCTION public.es_admin() IS 'Retorna true si el usuario autenticado actual es admin activo. Uso exclusivo en políticas RLS.';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- - SELECT: admin ve todo; cada usuario ve su propio registro.
-- - UPDATE: solo admin (el perfil propio se editará vía Server Action con
--   service role en fases futuras, para no exponer rol/activo/pin).
-- - INSERT/DELETE: sin políticas — solo service role (bypasa RLS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_seleccionar ON public.usuarios;
CREATE POLICY usuarios_seleccionar
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (public.es_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS usuarios_actualizar ON public.usuarios;
CREATE POLICY usuarios_actualizar
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());
