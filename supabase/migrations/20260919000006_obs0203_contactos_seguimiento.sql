-- =============================================================================
-- Migración: OBS-02/03 — contactos adicionales por cliente y siguiente acción
-- comercial concreta.
-- ORCA MFG ERP — Clientes / Pipeline. La aplica el PO.
--
-- Decisión del cliente (2ª ronda): se requieren contactos adicionales por
-- cliente (Compras, Finanzas, …) y, en el seguimiento comercial, responsable y
-- siguiente acción concreta.
--
--   1. `contactos_cliente`: contactos múltiples por cliente, con un único
--      principal. Lectura bajo `ver_clientes`; las mutaciones van por Server
--      Actions con service_role (mismo patrón que `clientes`).
--   2. `pipeline.proximo_paso`: la siguiente acción concreta del seguimiento
--      (el responsable sigue siendo `vendedor_id`, NOT NULL desde Fase 2).
--      La obligatoriedad fecha→acción se refuerza con un CHECK añadido
--      `NOT VALID`: las filas históricas no se tocan y toda escritura nueva
--      queda sujeta. La app la exige además en el formulario.
--
-- Aditiva e idempotente; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contactos adicionales por cliente (OBS-02).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contactos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  puesto text CHECK (puesto IS NULL OR char_length(btrim(puesto)) BETWEEN 2 AND 80),
  correo text CHECK (
    correo IS NULL OR correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  telefono text CHECK (telefono IS NULL OR char_length(btrim(telefono)) BETWEEN 3 AND 40),
  notas text CHECK (notas IS NULL OR char_length(btrim(notas)) <= 300),
  es_principal boolean NOT NULL DEFAULT false,
  creado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contactos_cliente IS
  'OBS-02: contactos adicionales del cliente (compras, finanzas, …); a lo sumo uno principal.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_contactos_cliente_principal
  ON public.contactos_cliente (cliente_id)
  WHERE es_principal;
CREATE INDEX IF NOT EXISTS idx_contactos_cliente_cliente
  ON public.contactos_cliente (cliente_id, creado_en DESC);

DROP TRIGGER IF EXISTS trigger_contactos_cliente_actualizado_en ON public.contactos_cliente;
CREATE TRIGGER trigger_contactos_cliente_actualizado_en
  BEFORE UPDATE ON public.contactos_cliente
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

REVOKE ALL PRIVILEGES ON TABLE public.contactos_cliente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.contactos_cliente TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.contactos_cliente TO service_role;

ALTER TABLE public.contactos_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contactos_cliente_seleccionar ON public.contactos_cliente;
CREATE POLICY contactos_cliente_seleccionar
  ON public.contactos_cliente
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
  );

-- -----------------------------------------------------------------------------
-- 2. Siguiente acción concreta del seguimiento comercial (OBS-03).
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS proximo_paso text;

COMMENT ON COLUMN public.pipeline.proximo_paso IS
  'OBS-03: siguiente acción concreta del seguimiento (el responsable es vendedor_id).';

ALTER TABLE public.pipeline
  DROP CONSTRAINT IF EXISTS pipeline_proximo_paso_longitud;
ALTER TABLE public.pipeline
  ADD CONSTRAINT pipeline_proximo_paso_longitud CHECK (
    proximo_paso IS NULL OR char_length(btrim(proximo_paso)) BETWEEN 3 AND 300
  );

-- Obligatoriedad fecha→acción para escrituras nuevas; el histórico no se valida.
ALTER TABLE public.pipeline
  DROP CONSTRAINT IF EXISTS pipeline_seguimiento_con_accion;
ALTER TABLE public.pipeline
  ADD CONSTRAINT pipeline_seguimiento_con_accion CHECK (
    fecha_seguimiento IS NULL OR proximo_paso IS NOT NULL
  ) NOT VALID;

-- -----------------------------------------------------------------------------
-- 3. Realtime: los contactos del cliente viven en la ficha.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contactos_cliente'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contactos_cliente;
  END IF;
END;
$$;
