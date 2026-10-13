-- =============================================================================
-- Obs. cliente 2026-10-13 (8) — Materiales: grupos/subgrupos del catálogo
-- Refinamiento de DC-12/ADR-0015 (registrado en DECISIONES-ACEPTADAS.md).
--
-- `catalogo_materiales.padre_id` permite agrupar materiales («Acero al carbón»
-- → subítems) con un máximo de dos niveles. Aditiva e idempotente; convive con
-- el versionado existente (cada INSERT/UPDATE sigue registrando versión).
-- Aplicar SOLO local hasta autorización.
-- =============================================================================

ALTER TABLE public.catalogo_materiales
  ADD COLUMN IF NOT EXISTS padre_id uuid REFERENCES public.catalogo_materiales (id);

CREATE INDEX IF NOT EXISTS ix_catalogo_materiales_padre
  ON public.catalogo_materiales (padre_id)
  WHERE padre_id IS NOT NULL;

COMMENT ON COLUMN public.catalogo_materiales.padre_id IS
  'Obs. 8: material padre (grupo) al que pertenece el material; NULL = raíz. Jerarquía de dos niveles.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_materiales_padre_no_si_mismo'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_padre_no_si_mismo
      CHECK (padre_id IS DISTINCT FROM id);
  END IF;
END;
$$;

-- Guardas de jerarquía: padre existente, sin abuelo (dos niveles) y sin hijos
-- propios (un grupo con subítems no se convierte en subítem de otro).
CREATE OR REPLACE FUNCTION privado.validar_padre_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_padre record;
BEGIN
  IF NEW.padre_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.padre_id = NEW.id THEN
    RAISE EXCEPTION 'material_padre_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.padre_id INTO v_padre
  FROM public.catalogo_materiales AS m
  WHERE m.id = NEW.padre_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_padre_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_padre.padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'material_jerarquia_maxima' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalogo_materiales AS hijo WHERE hijo.padre_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'material_con_hijos_no_agrupa' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.validar_padre_material() IS
  'Obs. 8: guarda de jerarquía del catálogo de materiales (dos niveles, sin ciclos ni auto-padre).';

REVOKE ALL ON FUNCTION privado.validar_padre_material() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_catalogo_materiales_padre ON public.catalogo_materiales;
CREATE TRIGGER trigger_catalogo_materiales_padre
  BEFORE INSERT OR UPDATE OF padre_id ON public.catalogo_materiales
  FOR EACH ROW EXECUTE FUNCTION privado.validar_padre_material();
