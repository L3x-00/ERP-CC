-- =============================================================================
-- SII-B3.5 (cierre) — Continuidad administrativa de folios periódicos
-- Plan: docs/plan-erp-sii/03-rfq.md §3.5 (extiende la pestaña Folios a todos
-- los tipos nuevos sin tocar el contador CNC)
-- Documento del cliente: §6.1, §15
--
-- Entrega:
--   * `consultar_continuidad_folio_periodico(tipo, actor)`: contador vigente,
--     último emitido real (solo RFQ tiene tabla hoy) y siguiente.
--   * `ajustar_continuidad_folio_periodico(tipo, periodo, ultimo, actor)`:
--     upsert atómico que nunca retrocede por debajo del máximo emitido ni del
--     contador vigente.
--   * Tipos: RFQ, O, OI, NE, RP, CG. CNC queda fuera (su RPC existente no se toca).
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- Orden: requiere 20261007100001_sii_b3_folio_periodico (contadores periódicos).
-- =============================================================================

DO $$ BEGIN
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Consulta del periodo vigente de un tipo de folio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consultar_continuidad_folio_periodico(
  p_tipo text,
  p_actor_id uuid
)
RETURNS TABLE (
  periodo text,
  ultimo_contador integer,
  ultimo_emitido integer,
  siguiente integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_periodo text := to_char(now(), 'MMYY');
  v_contador integer;
  v_emitido integer;
  v_minimo integer;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('RFQ', 'O', 'OI', 'NE', 'RP', 'CG') THEN
    RAISE EXCEPTION 'tipo_folio_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'configuracion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_configuracion' USING ERRCODE = '42501';
  END IF;

  SELECT contador.ultimo
  INTO v_contador
  FROM public.contadores_folio_periodico contador
  WHERE contador.tipo = p_tipo AND contador.periodo = v_periodo;

  -- Solo RFQ tiene emisor real hoy; el resto se amplía en su bloque (NULL).
  IF p_tipo = 'RFQ' THEN
    SELECT coalesce(max(split_part(folio_rfq, '_', 2)::integer), 0)
    INTO v_emitido
    FROM public.pipeline
    WHERE folio_rfq ~ ('^RFQ-' || v_periodo || '_[0-9]{2}$');
  ELSE
    v_emitido := NULL;
  END IF;

  v_minimo := greatest(coalesce(v_contador, 0), coalesce(v_emitido, 0));

  RETURN QUERY SELECT
    v_periodo,
    v_contador,
    v_emitido,
    CASE WHEN v_minimo < 99 THEN v_minimo + 1 ELSE NULL::integer END;
END;
$$;

COMMENT ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid) IS
  'SII-B3.5: diagnóstico del periodo vigente (MMYY) por tipo; RFQ compara el contador con los folios realmente emitidos. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. Ajuste administrativo (nunca retrocede)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_continuidad_folio_periodico(
  p_tipo text,
  p_periodo text,
  p_ultimo integer,
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emitido integer := 0;
  v_guardado integer;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('RFQ', 'O', 'OI', 'NE', 'RP', 'CG') THEN
    RAISE EXCEPTION 'tipo_folio_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_periodo IS NULL OR p_periodo !~ '^(0[1-9]|1[0-2])[0-9]{2}$'
     OR p_ultimo IS NULL OR p_ultimo < 0 OR p_ultimo > 99 THEN
    RAISE EXCEPTION 'continuidad_folio_invalida' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'configuracion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_configuracion' USING ERRCODE = '42501';
  END IF;

  IF p_tipo = 'RFQ' THEN
    SELECT coalesce(max(split_part(folio_rfq, '_', 2)::integer), 0)
    INTO v_emitido
    FROM public.pipeline
    WHERE folio_rfq ~ ('^RFQ-' || p_periodo || '_[0-9]{2}$');
  END IF;

  IF p_ultimo < v_emitido THEN
    RAISE EXCEPTION 'folio_no_puede_retroceder' USING ERRCODE = '23514';
  END IF;

  -- El WHERE del upsert serializa contra el contador vigente: si otra sesión
  -- lo adelantó por encima del valor pedido, no se pisa y se rechaza.
  INSERT INTO public.contadores_folio_periodico AS c (tipo, periodo, ultimo)
  VALUES (p_tipo, p_periodo, p_ultimo)
  ON CONFLICT (tipo, periodo) DO UPDATE
    SET ultimo = EXCLUDED.ultimo, actualizado_en = now()
    WHERE c.ultimo <= EXCLUDED.ultimo
  RETURNING c.ultimo INTO v_guardado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'folio_no_puede_retroceder' USING ERRCODE = '23514';
  END IF;

  RETURN v_guardado;
END;
$$;

COMMENT ON FUNCTION public.ajustar_continuidad_folio_periodico(text, text, integer, uuid) IS
  'SII-B3.5: ajusta el contador de un tipo/periodo sin retroceder bajo el máximo emitido (RFQ) ni el contador vigente. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. Privilegios de ejecución (solo servidor)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ajustar_continuidad_folio_periodico(text, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_continuidad_folio_periodico(text, text, integer, uuid)
  TO service_role;
