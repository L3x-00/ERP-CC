-- =============================================================================
-- Migración: crear tabla cotizacion_lineas
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP)
-- Idempotente. Requiere: pipeline, es_admin, usuario_tiene_permiso.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cotizacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipeline (id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric(12, 2) NOT NULL CHECK (cantidad > 0),
  material text,
  espesor text,
  area numeric(12, 4) CHECK (area IS NULL OR area >= 0),
  procesos text[] NOT NULL DEFAULT '{}',
  precio_unitario numeric(14, 4) NOT NULL CHECK (precio_unitario >= 0),
  -- Orden de despliegue de la línea dentro de la cotización.
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cotizacion_lineas IS 'Líneas de cotización de una oportunidad del pipeline. Importe de línea = cantidad * precio_unitario.';

CREATE INDEX IF NOT EXISTS idx_cotizacion_lineas_pipeline ON public.cotizacion_lineas (pipeline_id);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- La visibilidad se hereda de la oportunidad padre: quien puede ver/editar la
-- fila de pipeline puede ver/editar sus líneas.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cotizacion_lineas ENABLE ROW LEVEL SECURITY;

-- Condición reutilizada: acceso a la oportunidad padre.
-- (Se repite en cada política porque Postgres no permite factorizarla aquí.)

DROP POLICY IF EXISTS cotizacion_lineas_seleccionar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_seleccionar
  ON public.cotizacion_lineas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id = cotizacion_lineas.pipeline_id
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_insertar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_insertar
  ON public.cotizacion_lineas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id = cotizacion_lineas.pipeline_id
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_actualizar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_actualizar
  ON public.cotizacion_lineas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id = cotizacion_lineas.pipeline_id
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_eliminar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_eliminar
  ON public.cotizacion_lineas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id = cotizacion_lineas.pipeline_id
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );
