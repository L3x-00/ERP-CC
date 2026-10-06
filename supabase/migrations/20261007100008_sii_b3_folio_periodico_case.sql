-- =============================================================================
-- SII-B3.5 (ajuste 3) — Relleno correcto del folio periódico
--
-- Ni `lpad(x, 2, '0')` (trunca) ni `to_char(x, 'FM00')` (desborda a '##' con
-- más de 2 dígitos) sirven para "mínimo 2 dígitos": se usa CASE.
--   < 100 -> lpad(text, 2, '0')  (01..99)
--   >= 100 -> text               (100, 101, ...)
-- Idempotente: CREATE OR REPLACE.
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
  v_sufijo text;
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

  v_sufijo := CASE WHEN v_num < 100 THEN lpad(v_num::text, 2, '0') ELSE v_num::text END;
  RETURN p_tipo || '-' || v_periodo || '_' || v_sufijo;
END;
$$;

COMMENT ON FUNCTION public.generar_folio_periodico(text) IS
  'SII-B3.5: genera TIPO-MMYY_XX atómico (mínimo 2 dígitos, crece tras 99; tope 999). Solo service_role.';
