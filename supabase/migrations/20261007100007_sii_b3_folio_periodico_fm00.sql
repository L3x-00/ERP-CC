-- =============================================================================
-- SII-B3.5 (ajuste 2) — Corrección del relleno del folio periódico
--
-- `lpad(x, 2, '0')` TRUNCA a 2 caracteres, por lo que a partir de 100 generaba
-- folios duplicados (100..109 -> "10", etc.). Se usa `to_char(v_num, 'FM00')`,
-- que garantiza mínimo 2 dígitos y crece sin truncar (100 -> "100").
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

  -- 'FM00': mínimo 2 dígitos sin truncar (100 -> "100").
  RETURN p_tipo || '-' || v_periodo || '_' || to_char(v_num, 'FM00');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_periodico(text) IS
  'SII-B3.5: genera TIPO-MMYY_XX atómico (FM00: mínimo 2 dígitos, crece tras 99; tope 999). Solo service_role.';
