-- =============================================================================
-- SII-B3.5 (rango) — Continuidad de folios periódicos hasta 999
-- Ajuste posterior a 20261007100008 (el generador ya crece a 3 dígitos y su
-- tope es 999). Recrea las dos RPC de continuidad con el nuevo rango y un
-- formato de sufijo que no trunca (mínimo 2 dígitos, 3 cuando aplica).
--
-- Idempotente (CREATE OR REPLACE). Aplicar SOLO local; el remoto lo aplica el PO.
-- Requiere 20261007150001_sii_b3_continuidad_folios.
-- =============================================================================

DO $$ BEGIN
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
END $$;

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

  IF p_tipo = 'RFQ' THEN
    SELECT coalesce(max(split_part(folio_rfq, '_', 2)::integer), 0)
    INTO v_emitido
    FROM public.pipeline
    WHERE folio_rfq ~ ('^RFQ-' || v_periodo || '_[0-9]{2,3}$');
  ELSIF p_tipo IN ('O', 'OI') THEN
    -- Los folios O-/OI- nacen en B5.5; el guard mantiene la consulta válida en
    -- instalaciones donde la columna aún no existe.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'folio_sii'
    ) THEN
      EXECUTE format(
        'SELECT coalesce(max(split_part(folio_sii, ''_'', 2)::integer), 0)
           FROM public.ordenes_produccion
          WHERE folio_sii ~ %L',
        '^' || p_tipo || '-' || v_periodo || '_[0-9]{2,3}$'
      ) INTO v_emitido;
    ELSE
      v_emitido := 0;
    END IF;
  ELSE
    v_emitido := NULL;
  END IF;

  v_minimo := greatest(coalesce(v_contador, 0), coalesce(v_emitido, 0));

  RETURN QUERY SELECT
    v_periodo,
    v_contador,
    v_emitido,
    CASE WHEN v_minimo < 999 THEN v_minimo + 1 ELSE NULL::integer END;
END;
$$;

COMMENT ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid) IS
  'SII-B3.5: diagnóstico del periodo vigente (MMYY) por tipo; RFQ/O/OI comparan el contador con los folios emitidos. Rango 0..999. Solo service_role.';

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
     OR p_ultimo IS NULL OR p_ultimo < 0 OR p_ultimo > 999 THEN
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
    WHERE folio_rfq ~ ('^RFQ-' || p_periodo || '_[0-9]{2,3}$');
  ELSIF p_tipo IN ('O', 'OI') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'folio_sii'
    ) THEN
      EXECUTE format(
        'SELECT coalesce(max(split_part(folio_sii, ''_'', 2)::integer), 0)
           FROM public.ordenes_produccion
          WHERE folio_sii ~ %L',
        '^' || p_tipo || '-' || p_periodo || '_[0-9]{2,3}$'
      ) INTO v_emitido;
    ELSE
      v_emitido := 0;
    END IF;
  END IF;

  IF p_ultimo < v_emitido THEN
    RAISE EXCEPTION 'folio_no_puede_retroceder' USING ERRCODE = '23514';
  END IF;

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
  'SII-B3.5: ajusta el contador de un tipo/periodo (rango 0..999) sin retroceder bajo el máximo emitido ni el contador vigente. Solo service_role.';

REVOKE ALL ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ajustar_continuidad_folio_periodico(text, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consultar_continuidad_folio_periodico(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_continuidad_folio_periodico(text, text, integer, uuid)
  TO service_role;
