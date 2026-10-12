-- =============================================================================
-- Obs. cliente 2026-10-12 (4b) — Grupo de equipo por proceso
--
-- El ruteo estimado de propuestas autocompleta el grupo de equipo al elegir el
-- proceso (antes se capturaba a mano aunque ya estuviera configurado). La
-- columna es nullable: los procesos existentes no cambian y el ruteo todavía
-- permite ajustar el grupo manualmente renglón por renglón.
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.catalogo_procesos
  ADD COLUMN IF NOT EXISTS grupo_equipo_id uuid REFERENCES public.grupos_equipo (id);

COMMENT ON COLUMN public.catalogo_procesos.grupo_equipo_id IS
  'Obs. cliente 2026-10-12 (4b): grupo de equipo por defecto del proceso; el ruteo de propuestas lo autocompleta (editable por renglón).';
