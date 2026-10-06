-- =============================================================================
-- SII-B3 (ola 2) — Retiro del puente de transición `estado_rfq` ↔ `etapa`
-- Plan: docs/plan-erp-sii/03-rfq.md §3.8 (consumidores migrados) y §3.9-1
--
-- Todos los consumidores de la ola 2 leen `estado_rfq`: métricas SQL
-- (20261007100004), cola/ficha /rfq, dashboard, historial de cliente y
-- alertas. `etapa` queda como columna histórica (grandfathering ADR-09):
-- ningún código nuevo la lee; las escrituras legacy que aún la conservan
-- (aprobar_oportunidad_y_crear_orden, marcar-ganada/perdida retirados de la UI)
-- se sustituirán en B4/B5.
--
-- Aditiva e idempotente (DROP IF EXISTS). Aplicar SOLO local; remoto = PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias: el puente solo existe si B3 ola 1 ya aplicó.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.rfq_eventos') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20261007100002_sii_b3_rfq_base.sql antes (falta public.rfq_eventos)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipeline' AND column_name = 'estado_rfq'
  ) THEN
    RAISE EXCEPTION 'aplicar 20261007100002_sii_b3_rfq_base.sql antes (falta pipeline.estado_rfq)';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Retiro del trigger y la función del puente
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_pipeline_sincronizar_etapa_rfq ON public.pipeline;
DROP FUNCTION IF EXISTS privado.sincronizar_etapa_rfq();

COMMENT ON COLUMN public.pipeline.etapa IS
  'SII-B3: columna histórica (grandfathering ADR-09). Desde la ola 2 ningún consumidor la lee; estado_rfq es la única fuente de estado. Se conservará hasta la limpieza autorizada posterior a B5.';
