-- =============================================================================
-- Migración: generación atómica de folios (OP-XXXX y CNC-MMYY-XXXX)
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP)
-- Idempotente.
--
-- v1 generaba folios contando filas en el cliente → condición de carrera y
-- duplicados bajo concurrencia. Aquí la atomicidad vive en la BD:
--  - OP: SEQUENCE de Postgres (nextval nunca duplica, ni bajo concurrencia).
--  - CNC: tabla contador con UPSERT+RETURNING en un solo statement atómico,
--    porque el CNC reinicia por mes (MMYY) y una SEQUENCE global no da eso.
-- Se exponen como funciones SECURITY DEFINER llamadas por RPC desde los
-- servicios. Los huecos por rollback son aceptables (los folios deben ser
-- únicos, no consecutivos sin huecos).
-- =============================================================================

-- Folio OP: secuencia global.
CREATE SEQUENCE IF NOT EXISTS public.seq_folio_op START 1;

-- Contador por periodo para el folio CNC (periodo = MMYY).
CREATE TABLE IF NOT EXISTS public.contador_folios (
  periodo text PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.contador_folios IS 'Último consecutivo de folio CNC por periodo MMYY. Solo lo tocan las funciones de folio.';

-- Sin políticas RLS: la tabla solo se toca vía las funciones SECURITY DEFINER.
ALTER TABLE public.contador_folios ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- generar_folio_op(): 'OP-0001', 'OP-0002', ... (atómico vía nextval).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_folio_op()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'OP-' || lpad(nextval('public.seq_folio_op')::text, 4, '0');
$$;

COMMENT ON FUNCTION public.generar_folio_op IS 'Genera el siguiente folio OP-XXXX de forma atómica.';

-- -----------------------------------------------------------------------------
-- generar_folio_cnc(): 'CNC-0726-0001', ... reinicia por mes.
-- El UPSERT+RETURNING es un único statement atómico (row-lock), sin carrera.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_folio_cnc()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo text := to_char(now(), 'MMYY');
  v_ultimo integer;
BEGIN
  INSERT INTO public.contador_folios (periodo, ultimo)
  VALUES (v_periodo, 1)
  ON CONFLICT (periodo) DO UPDATE
    SET ultimo = public.contador_folios.ultimo + 1
  RETURNING ultimo INTO v_ultimo;

  RETURN 'CNC-' || v_periodo || '-' || lpad(v_ultimo::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_cnc IS 'Genera el siguiente folio CNC-MMYY-XXXX de forma atómica (reinicia por mes).';
