-- =============================================================================
-- SII-B3.5 — Folio periódico genérico (ADR-SII-02, B0.6) + clave RFQ
-- Plan: docs/plan-erp-sii/03-rfq.md §3.5
-- Documento del cliente: §6.1 (RFQ-MMYY_XX), §7
--
-- Entrega:
--   * tabla `contadores_folio_periodico` (tipo, periodo) con UPSERT atómico
--   * `generar_folio_periodico(p_tipo)` → `TIPO-MMYY_XX`, tope 99 por periodo
--     con error explícito `folio_periodo_agotado`
-- No toca `contador_folios` (continuidad CNC existente) ni la pestaña Folios.
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contador por tipo + periodo (MMYY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contadores_folio_periodico (
  tipo text NOT NULL,
  periodo text NOT NULL,
  ultimo integer NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, periodo),
  CONSTRAINT contadores_folio_periodico_tipo_valido CHECK (tipo ~ '^[A-Z]{2,6}$'),
  CONSTRAINT contadores_folio_periodico_periodo_valido CHECK (periodo ~ '^[0-9]{4}$'),
  CONSTRAINT contadores_folio_periodico_ultimo_valido CHECK (ultimo >= 0)
);

COMMENT ON TABLE public.contadores_folio_periodico IS
  'SII-B3.5: último consecutivo por tipo de folio y periodo MMYY. Solo lo tocan las funciones SECURITY DEFINER de folios.';

-- Sin políticas RLS: la tabla solo se toca vía funciones SECURITY DEFINER.
ALTER TABLE public.contadores_folio_periodico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contadores_folio_periodico FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contadores_folio_periodico TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Generador genérico de folio periódico
--    El UPSERT + RETURNING es un único statement atómico (row-lock); no hay
--    carrera entre llamadas concurrentes del mismo tipo/periodo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_folio_periodico(p_tipo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_periodo text;
  v_num integer;
BEGIN
  IF p_tipo IS NULL OR btrim(p_tipo) = '' OR p_tipo <> upper(btrim(p_tipo)) THEN
    RAISE EXCEPTION 'tipo_folio_invalido' USING ERRCODE = '22023';
  END IF;

  v_periodo := to_char(now(), 'MMYY');

  INSERT INTO public.contadores_folio_periodico AS c (tipo, periodo, ultimo)
  VALUES (p_tipo, v_periodo, 1)
  ON CONFLICT (tipo, periodo)
    DO UPDATE SET ultimo = c.ultimo + 1, actualizado_en = now()
  RETURNING c.ultimo INTO v_num;

  IF v_num > 99 THEN
    -- El contador queda avanzado; el ajuste administrativo (otra ola) puede
    -- corregirlo, pero el folio 100 jamás se emite fuera de formato.
    RAISE EXCEPTION 'folio_periodo_agotado' USING ERRCODE = '23514';
  END IF;

  RETURN p_tipo || '-' || v_periodo || '_' || lpad(v_num::text, 2, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_periodico(text) IS
  'SII-B3.5: genera TIPO-MMYY_XX de forma atómica con tope 99 por periodo. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. Privilegios de ejecución (solo servidor)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.generar_folio_periodico(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_periodico(text) TO service_role;
