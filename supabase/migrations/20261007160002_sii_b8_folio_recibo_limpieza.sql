-- =============================================================================
-- SII-B8 F1 (limpieza) — índice redundante
--
-- `pagos_ar.folio_recibo` ya contaba con el UNIQUE `pagos_ar_folio_recibo_key`
-- desde la fase 8; el índice `ux_pagos_folio_recibo` creado en
-- 20261007160001 duplicaba su función. Se retira para no encarecer las
-- escrituras del motor de pagos.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007160001).
-- =============================================================================

DROP INDEX IF EXISTS public.ux_pagos_folio_recibo;
