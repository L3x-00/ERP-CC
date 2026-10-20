-- =============================================================================
-- Materiales — ancho y largo opcionales (mm) del material de catálogo.
--
-- Aditiva e idempotente: dos columnas NULL en `catalogo_materiales`. Los
-- materiales existentes quedan con NULL («sin dimensiones»), sin backfill ni
-- reescritura de filas. No cambia permisos, RLS ni grants: las lecturas y
-- escrituras siguen pasando por service_role desde las Server Actions, y el
-- versionado (`registrar_version_catalogo`, snapshot `to_jsonb(NEW)`) y el
-- token CAS `actualizado_en` cubren las columnas nuevas sin tocar sus triggers.
--
-- Rango alineado con `catalogo_espesores.espesor_mm` (máximo 99,999.999) y con
-- las validaciones Zod del módulo: positivo, finito y con tres decimales.
-- Aplicar SOLO local hasta autorización.
-- =============================================================================

ALTER TABLE public.catalogo_materiales
  ADD COLUMN IF NOT EXISTS ancho_mm numeric(10, 3),
  ADD COLUMN IF NOT EXISTS largo_mm numeric(10, 3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.catalogo_materiales'::regclass
      AND conname = 'catalogo_materiales_ancho_mm_valido'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_ancho_mm_valido
      CHECK (
        ancho_mm IS NULL
        OR (
          ancho_mm > 0
          AND ancho_mm <= 99999.999
          AND ancho_mm NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.catalogo_materiales'::regclass
      AND conname = 'catalogo_materiales_largo_mm_valido'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_largo_mm_valido
      CHECK (
        largo_mm IS NULL
        OR (
          largo_mm > 0
          AND largo_mm <= 99999.999
          AND largo_mm NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.catalogo_materiales.ancho_mm IS
  'Ancho nominal opcional del material en milímetros; NULL = sin dimensión registrada. Positivo y finito.';
COMMENT ON COLUMN public.catalogo_materiales.largo_mm IS
  'Largo nominal opcional del material en milímetros; NULL = sin dimensión registrada. Positivo y finito.';
