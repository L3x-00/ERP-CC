-- =============================================================================
-- B7 — La nota de entrega nace con el día del negocio
--
-- Al cerrar AUD-12 quedó a la vista que `fecha_entrega` se inicializaba con
-- `now()` (timestamptz). Por la tarde en Tijuana ese instante ya cae en el día
-- siguiente en UTC: la UI mostraba y editaba una fecha futura, y la validación
-- en Tijuana la rechazaba.
--
-- Ahora el default y el trigger guardan el mediodía local del día de negocio
-- (mismo día en Tijuana y en la fecha UTC del instante), de modo que la fecha
-- visible y la validada coinciden. El tipo y las firmas no cambian.
-- Aditiva. Aplicar solo en local.
-- =============================================================================

ALTER TABLE public.notas_entrega
  ALTER COLUMN fecha_entrega
  SET DEFAULT (
    ((now() AT TIME ZONE 'America/Tijuana')::date + time '12:00')
      AT TIME ZONE 'America/Tijuana'
  );

CREATE OR REPLACE FUNCTION privado.completar_nota_entrega_sii()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entregado_por_id IS NULL THEN
    NEW.entregado_por_id := NEW.creado_por;
  END IF;
  IF NEW.fecha_entrega IS NULL THEN
    -- AUD-12: mediodía local del día de negocio, no el instante UTC.
    NEW.fecha_entrega := ((now() AT TIME ZONE 'America/Tijuana')::date + time '12:00')
      AT TIME ZONE 'America/Tijuana';
  END IF;
  IF NEW.folio_sii IS NULL THEN
    NEW.folio_sii := privado.siguiente_folio_entrega(NEW.orden_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.completar_nota_entrega_sii() IS
  'SII-B7.1: asigna folio_sii y entregado_por por defecto; la fecha de entrega sin captura usa el mediodía local del día de negocio (AUD-12).';
