-- =============================================================================
-- Auditoría 2026-09-11 — Corrección de grants de `registrar_gasto` (Fase 9).
--
-- Motivo: `20260909224643_fase_9_rpc_gastos.sql` declaraba la función con
-- `timestamptz` pero revocaba/otorgaba la firma con `date`. PostgreSQL resuelve
-- por coincidencia exacta de tipos, así que en instalación limpia la migración
-- aborta y, si el archivo se aplicó sentencia por sentencia, la RPC conserva el
-- EXECUTE por defecto de PUBLIC/anon/authenticated: un cliente podría invocarla
-- por PostgREST saltándose la Server Action (suplantación de `p_creado_por`).
--
-- Este archivo es idempotente y seguro incluso si la función no existe aún.
-- =============================================================================

DO $auditoria$
BEGIN
  IF to_regprocedure(
    'public.registrar_gasto(uuid, uuid, text, text, numeric, numeric, numeric, text, numeric, timestamp with time zone, timestamp with time zone, text, text, text, jsonb, text, uuid)'
  ) IS NOT NULL THEN
    EXECUTE $sql$
      REVOKE EXECUTE ON FUNCTION public.registrar_gasto(
        uuid, uuid, text, text, numeric, numeric, numeric, text, numeric,
        timestamptz, timestamptz, text, text, text, jsonb, text, uuid
      ) FROM PUBLIC, anon, authenticated
    $sql$;

    EXECUTE $sql$
      GRANT EXECUTE ON FUNCTION public.registrar_gasto(
        uuid, uuid, text, text, numeric, numeric, numeric, text, numeric,
        timestamptz, timestamptz, text, text, text, jsonb, text, uuid
      ) TO service_role
    $sql$;
  END IF;
END;
$auditoria$;
