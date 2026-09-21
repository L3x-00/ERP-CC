-- =============================================================================
-- Migración: OBS-21 — archivo de trabajos entregados con bandeja separada.
-- ORCA MFG ERP — Órdenes.
--
-- Decisión del cliente: los trabajos se archivan **al entregar**, con una
-- bandeja separada de pendientes de entrega. La marca es automática: cuando la
-- suma de renglones entregados cubre todas las partidas de la orden, se fija
-- `archivada_en` una sola vez (coalesce) y no se toca más.
--
-- Aditiva; la aplica el PO. La bandeja es de lectura: la edición (ORD-05) sigue
-- restringida a `borrador`.
-- =============================================================================

ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS archivada_en timestamptz;

COMMENT ON COLUMN public.ordenes_produccion.archivada_en IS
  'OBS-21: fecha de archivo automático al completar la entrega total; null mientras esté activa.';

CREATE OR REPLACE FUNCTION public.archivar_orden_al_entregar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_pendientes integer;
BEGIN
  SELECT nota.orden_id INTO v_orden_id
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF v_orden_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_orden_id
    AND coalesce(
      (
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        WHERE renglon.partida_id = partida.id
      ),
      0
    ) < partida.cantidad_solicitada;

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = coalesce(archivada_en, now())
    WHERE id = v_orden_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archivar_orden_al_entregar() IS
  'OBS-21: archiva la orden cuando la entrega cubre todas las partidas (idempotente).';

DROP TRIGGER IF EXISTS trigger_archivar_orden_al_entregar
  ON public.partidas_nota_entrega;
CREATE TRIGGER trigger_archivar_orden_al_entregar
  AFTER INSERT ON public.partidas_nota_entrega
  FOR EACH ROW
  EXECUTE FUNCTION public.archivar_orden_al_entregar();
