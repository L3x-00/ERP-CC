-- =============================================================================
-- B4 (ajuste) — El folio de propuesta admite el desborde de 99 por periodo
--
-- SII-B3.5 autorizó que `generar_folio_periodico` crezca a 3 dígitos tras 99
-- (RFQ-1026_100) y B5/B7/B8 ya lo aceptan, pero los CHECK de B4 para
-- `propuestas.folio_cnc` y `propuesta_revisiones.folio_revision` quedaron en
-- exactamente 2 dígitos: al superar 99 propuestas en el periodo, el alta falla
-- (defecto detectado con los datos locales acumulados de E2E, 2026-10-12).
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.propuestas DROP CONSTRAINT IF EXISTS propuestas_folio_formato;
ALTER TABLE public.propuestas
  ADD CONSTRAINT propuestas_folio_formato
  CHECK (folio_cnc ~ '^CNC-[0-9]{4}_[0-9]{2,3}$');

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_folio_formato;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_folio_formato
  CHECK (folio_revision ~ '^CNC-[0-9]{4}_[0-9]{2,3}-[A-Z]$');
