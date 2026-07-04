-- =============================================================================
-- Migración: auto-provisionar public.usuarios al crear un auth.users
-- Fase 1 — Autenticación + Permisos + Auditoría (ORCA MFG ERP)
-- Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
--
-- Sin esto, crear un usuario en Supabase Auth (dashboard, Admin API, o
-- signup) no genera fila en public.usuarios, y el login falla en el paso de
-- cargar el perfil aunque las credenciales sean correctas — exactamente el
-- bug que motivó esta migración (ales@gmail.com pudo autenticar contra
-- auth.users pero no tenía perfil de aplicación).
--
-- Rol por defecto: 'vendedor' (el de menor privilegio entre los roles con
-- login email/password) — nunca auto-otorgar 'admin'. Promover roles es una
-- acción manual (SQL/dashboard por ahora; UI de Configuración en fase
-- futura).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.manejar_nuevo_usuario_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre_completo, rol, activo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'vendedor'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manejar_nuevo_usuario_auth IS 'Crea automáticamente el perfil en public.usuarios cuando se crea un auth.users. Rol por defecto vendedor (mínimo privilegio); promover es acción manual.';

DROP TRIGGER IF EXISTS trigger_nuevo_usuario_auth ON auth.users;
CREATE TRIGGER trigger_nuevo_usuario_auth
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.manejar_nuevo_usuario_auth();
