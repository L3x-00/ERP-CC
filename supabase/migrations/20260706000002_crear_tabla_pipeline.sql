-- =============================================================================
-- Migración: crear tabla pipeline + helper RLS usuario_tiene_permiso
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP)
-- Idempotente. Requiere: clientes, usuarios, es_admin (Fase 1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper RLS: ¿el usuario autenticado tiene un permiso granular?
-- SECURITY DEFINER para poder leer usuarios/permisos_rol desde políticas RLS
-- sin recursión. Reutilizable por cualquier tabla vendor-scoped futura.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.permisos_rol pr ON pr.rol = u.rol
    WHERE u.id = auth.uid()
      AND u.activo = true
      AND pr.permiso = p_permiso
  );
$$;

COMMENT ON FUNCTION public.usuario_tiene_permiso IS 'Retorna true si el usuario autenticado activo tiene el permiso dado. Uso en políticas RLS.';

-- -----------------------------------------------------------------------------
-- Tabla pipeline: oportunidades del CRM.
-- Doble folio: folio_op (OP-XXXX) desde el inicio; folio_cnc (CNC-MMYY-XXXX)
-- se llena al llegar a 'cotizado' y se conserva en adelante.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_op text UNIQUE NOT NULL,
  folio_cnc text UNIQUE,
  etapa text NOT NULL DEFAULT 'prospecto'
    CHECK (etapa IN ('prospecto', 'contactado', 'cotizado', 'negociacion', 'ganada', 'perdida')),
  nombre_contacto text NOT NULL,
  empresa text NOT NULL,
  correo text,
  telefono text,
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  vendedor_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN', 'USD')),
  condiciones_pago text
    CHECK (condiciones_pago IS NULL OR condiciones_pago IN ('contado', '15_dias', '30_dias', 'credito')),
  prioridad text NOT NULL DEFAULT 'normal'
    CHECK (prioridad IN ('baja', 'normal', 'alta', 'urgente')),
  -- IVA aplicable a la cotización: 16 nacional, 8 frontera.
  iva_porcentaje numeric(4, 2) NOT NULL DEFAULT 16,
  etiquetas text[] NOT NULL DEFAULT '{}',
  motivo_perdida text,
  notas_perdida text,
  fecha_ultimo_contacto timestamptz,
  fecha_envio_cotizacion timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pipeline IS 'Oportunidades del CRM (6 etapas: prospecto→contactado→cotizado→negociacion→ganada/perdida).';

CREATE INDEX IF NOT EXISTS idx_pipeline_vendedor ON public.pipeline (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_etapa ON public.pipeline (etapa);
CREATE INDEX IF NOT EXISTS idx_pipeline_cliente ON public.pipeline (cliente_id);

DROP TRIGGER IF EXISTS trigger_pipeline_actualizado_en ON public.pipeline;
CREATE TRIGGER trigger_pipeline_actualizado_en
  BEFORE UPDATE ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- - Un vendedor ve/edita solo lo suyo; admin y quien tenga 'ver_pipeline_equipo'
--   ven/editan todo el equipo (gerentes).
-- - DELETE: solo admin.
-- - Transiciones privilegiadas (ganada→promoción, reversión de etapa) se
--   verifican adicionalmente con can() en la Server Action (defensa en profundidad).
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_seleccionar ON public.pipeline;
CREATE POLICY pipeline_seleccionar
  ON public.pipeline
  FOR SELECT
  TO authenticated
  USING (
    vendedor_id = auth.uid()
    OR public.es_admin()
    OR public.usuario_tiene_permiso('ver_pipeline_equipo')
  );

DROP POLICY IF EXISTS pipeline_insertar ON public.pipeline;
CREATE POLICY pipeline_insertar
  ON public.pipeline
  FOR INSERT
  TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS pipeline_actualizar ON public.pipeline;
CREATE POLICY pipeline_actualizar
  ON public.pipeline
  FOR UPDATE
  TO authenticated
  USING (
    vendedor_id = auth.uid()
    OR public.es_admin()
    OR public.usuario_tiene_permiso('ver_pipeline_equipo')
  )
  WITH CHECK (
    vendedor_id = auth.uid()
    OR public.es_admin()
    OR public.usuario_tiene_permiso('ver_pipeline_equipo')
  );

DROP POLICY IF EXISTS pipeline_eliminar ON public.pipeline;
CREATE POLICY pipeline_eliminar
  ON public.pipeline
  FOR DELETE
  TO authenticated
  USING (public.es_admin());
