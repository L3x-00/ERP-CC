-- =============================================================================
-- Obs. cliente 2026-10-13 (6) — Archivos de propuesta: retiro trazable
-- Corrección post-C7: multi-subida y «Quitar» con historial conservado.
--
-- Entrega:
--   * `archivos.retirado_en` / `archivos.retirado_por`: marcador de retiro
--     (soft-delete) que conserva la fila y el binario para historial/auditoría;
--     la vista principal filtra `retirado_en IS NULL`.
--   * Índice parcial de la vista principal (`retirado_en IS NULL`).
--
-- Aditiva e idempotente; sin borrado de datos ni cambios de RLS. El versionado
-- (`vigente`/`reemplaza_a`) se mantiene intacto: retirar no altera la cadena de
-- versiones. Aplicar SOLO local hasta autorización.
-- =============================================================================

ALTER TABLE public.archivos
  ADD COLUMN IF NOT EXISTS retirado_en timestamptz,
  ADD COLUMN IF NOT EXISTS retirado_por uuid REFERENCES public.usuarios (id);

COMMENT ON COLUMN public.archivos.retirado_en IS
  'Momento del retiro (soft-delete) del documento; NULL = activo en la propuesta. La fila y el binario se conservan para historial y auditoría.';
COMMENT ON COLUMN public.archivos.retirado_por IS
  'Usuario que retiró el documento; NULL mientras sigue activo.';

-- Vista principal de archivos (ficha de propuesta): solo vínculos activos.
CREATE INDEX IF NOT EXISTS ix_archivos_activos
  ON public.archivos (entidad, entidad_id)
  WHERE retirado_en IS NULL;
