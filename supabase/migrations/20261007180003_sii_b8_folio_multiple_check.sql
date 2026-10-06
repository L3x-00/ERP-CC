-- =============================================================================
-- SII-B8 F3 (ajuste) — CHECK del folio de recibo admite el sufijo reservado 0000
--
-- El formato decidido para cobros repartidos es RP-MMYY_0000-YY; el CHECK de
-- 20261007160001 admitía XX de 2-3 dígitos. Se amplía únicamente el caso
-- reservado `0000`, conservando los folios de orden (2-3 dígitos).
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007180002).
-- =============================================================================

ALTER TABLE public.pagos_ar DROP CONSTRAINT IF EXISTS pagos_ar_folio_recibo_check;
ALTER TABLE public.pagos_ar ADD CONSTRAINT pagos_ar_folio_recibo_check
  CHECK (folio_recibo ~ '^(REC-[0-9]{6}|RP-[0-9]{4}_([0-9]{2,3}|0{4})-[0-9]{2,})$');

COMMENT ON COLUMN public.pagos_ar.folio_recibo IS
'SII-B8 F1/F3: RP-MMYY_XX-YY (XX = folio de la orden o 0000 en cobros repartidos; YY = consecutivo); REC-###### en históricos sin folio.';
