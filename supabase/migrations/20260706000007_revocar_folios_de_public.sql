-- =============================================================================
-- Migración: revocar ejecución de las funciones de folio a PUBLIC
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP). Idempotente.
--
-- La migración 000006 revocó EXECUTE a anon/authenticated, pero Postgres otorga
-- EXECUTE a PUBLIC por defecto y esos roles heredan de PUBLIC — por eso seguían
-- pudiendo llamar las RPC de folio. Se revoca de PUBLIC y se re-otorga solo a
-- service_role (las Server Actions llaman con cliente admin).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.generar_folio_op() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_folio_cnc() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generar_folio_op() TO service_role;
GRANT EXECUTE ON FUNCTION public.generar_folio_cnc() TO service_role;
