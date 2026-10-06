-- =============================================================================
-- SII-B3.5 (ajuste) — Desborde del folio periódico más allá de 99
-- Plan: docs/plan-erp-sii/03-rfq.md §3.5 (mejora autorizada por el PO)
--
-- Motivo: `RFQ-MMYY_XX` con tope duro de 99 bloquea el alta de RFQ al superar
-- 99 documentos en un periodo (frecuente en uso intenso). El formato conserva
-- el relleno mínimo de 2 dígitos y crece a 3 cuando el consecutivo lo requiere
-- (RFQ-1026_100). Se mantiene: atómico, sin reutilización y error explícito.
--
-- Idempotente: CREATE OR REPLACE de la función existente.
-- =============================================================================

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

  IF v_num > 999 THEN
    RAISE EXCEPTION 'folio_periodo_agotado' USING ERRCODE = '23514';
  END IF;

  -- Relleno mínimo de 2 dígitos; crece naturalmente a 3 (100+) sin reutilizar.
  RETURN p_tipo || '-' || v_periodo || '_' || lpad(v_num::text, 2, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_periodico(text) IS
  'SII-B3.5: genera TIPO-MMYY_XX atómico (2 dígitos mínimos, crece a 3 tras 99; tope 999). Solo service_role.';
