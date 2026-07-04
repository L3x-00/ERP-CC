-- =============================================================================
-- Migración: crear tabla logs
-- Fase 1 — Autenticación + Permisos + Auditoría (ORCA MFG ERP)
-- Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
-- Requiere: 20260703000001_crear_tabla_usuarios.sql (tabla usuarios y
-- función public.es_admin).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla logs
-- Registro de auditoría inmutable. usuario_id es NULLABLE con ON DELETE SET
-- NULL: el log debe sobrevivir al borrado del usuario; nombre_usuario y rol
-- quedan denormalizados para conservar la trazabilidad histórica.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  nombre_usuario text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('admin', 'vendedor', 'gerente', 'operador', 'contador')),
  accion text NOT NULL,
  modulo text NOT NULL,
  recurso_id text NOT NULL,
  detalles jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.logs IS 'Auditoría de acciones del sistema. Inmutable: solo inserta el service role.';
COMMENT ON COLUMN public.logs.usuario_id IS 'Nullable: al borrar el usuario se conserva el log (nombre_usuario/rol denormalizados).';

-- -----------------------------------------------------------------------------
-- Índices para las consultas de auditoría más frecuentes.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_logs_usuario_id ON public.logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_creado_en ON public.logs (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_logs_modulo_recurso ON public.logs (modulo, recurso_id);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- - SELECT: una sola política — admin ve todo; cada usuario ve sus propios logs.
-- - INSERT: sin política — solo service role (registrarLog usa cliente admin).
-- - UPDATE/DELETE: sin políticas — los logs son inmutables para clientes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_seleccionar ON public.logs;
CREATE POLICY logs_seleccionar
  ON public.logs
  FOR SELECT
  TO authenticated
  USING (public.es_admin() OR usuario_id = auth.uid());
