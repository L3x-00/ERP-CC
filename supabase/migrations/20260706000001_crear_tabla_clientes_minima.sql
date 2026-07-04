-- =============================================================================
-- Migración: crear tabla clientes (versión MÍNIMA para Fase 2)
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP)
-- Idempotente. Se ordena ANTES de pipeline porque pipeline.cliente_id la
-- referencia. El sistema completo (tiers, crédito) se construye en Fase 3.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial text NOT NULL,
  -- RFC único cuando existe (Postgres permite múltiples NULL en columna UNIQUE).
  rfc text UNIQUE,
  contacto text,
  correo text,
  telefono text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clientes IS 'Clientes (mínimo para Fase 2; se expande con tiers/crédito en Fase 3).';

CREATE INDEX IF NOT EXISTS idx_clientes_correo ON public.clientes (correo);

-- Trigger actualizado_en (función public.actualizar_timestamp de Fase 1).
DROP TRIGGER IF EXISTS trigger_clientes_actualizado_en ON public.clientes;
CREATE TRIGGER trigger_clientes_actualizado_en
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- - SELECT: cualquier autenticado (los clientes son datos de referencia
--   compartidos; una cuenta puede tener oportunidades de varios vendedores).
-- - INSERT/UPDATE/DELETE: sin políticas — solo service role. La promoción
--   prospecto→cliente corre en Server Action privilegiada (cliente admin).
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_seleccionar ON public.clientes;
CREATE POLICY clientes_seleccionar
  ON public.clientes
  FOR SELECT
  TO authenticated
  USING (true);
