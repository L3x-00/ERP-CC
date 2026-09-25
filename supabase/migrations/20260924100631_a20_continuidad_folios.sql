-- CFG-04: continuidad administrativa del folio CNC por periodo, sin retrocesos.
-- El generador y el ajuste compiten por la misma fila de contador_folios.
-- Ajustar exige actor activo con permiso de Configuración; la RPC solo se
-- expone a service_role, nunca a un JWT de usuario.

-- Si se importaron folios válidos antes del contador, elevarlo sin retroceder.
INSERT INTO public.contador_folios (periodo, ultimo)
SELECT substring(folio_cnc FROM 5 FOR 4), max(right(folio_cnc, 4)::integer)
FROM public.pipeline
WHERE folio_cnc ~ '^CNC-(0[1-9]|1[0-2])[0-9]{2}-[0-9]{4}$'
GROUP BY substring(folio_cnc FROM 5 FOR 4)
ON CONFLICT (periodo) DO UPDATE
SET ultimo = greatest(public.contador_folios.ultimo, EXCLUDED.ultimo);

CREATE OR REPLACE FUNCTION public.generar_folio_cnc()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  IF v_ultimo < 1 OR v_ultimo > 9999 THEN
    RAISE EXCEPTION 'folio_cnc_periodo_agotado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN 'CNC-' || v_periodo || '-' || lpad(v_ultimo::text, 4, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generar_folio_cnc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_cnc() TO service_role;

CREATE OR REPLACE FUNCTION public.ajustar_continuidad_folio_cnc(
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
  v_maximo_usado integer;
  v_guardado integer;
BEGIN
  IF p_periodo IS NULL OR p_periodo !~ '^(0[1-9]|1[0-2])[0-9]{2}$'
     OR p_ultimo IS NULL OR p_ultimo < 0 OR p_ultimo > 9999 THEN
    RAISE EXCEPTION 'continuidad_folio_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'configuracion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_configuracion' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(max(right(folio_cnc, 4)::integer), 0)
  INTO v_maximo_usado
  FROM public.pipeline
  WHERE folio_cnc ~ ('^CNC-' || p_periodo || '-[0-9]{4}$');
  IF p_ultimo < v_maximo_usado THEN
    RAISE EXCEPTION 'folio_no_puede_retroceder' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.contador_folios (periodo, ultimo)
  VALUES (p_periodo, p_ultimo)
  ON CONFLICT (periodo) DO UPDATE
    SET ultimo = EXCLUDED.ultimo
    WHERE public.contador_folios.ultimo <= EXCLUDED.ultimo
  RETURNING ultimo INTO v_guardado;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'folio_no_puede_retroceder' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_guardado;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ajustar_continuidad_folio_cnc(text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_continuidad_folio_cnc(text, integer, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consultar_continuidad_folio_cnc(
  p_periodo text,
  p_actor_id uuid
)
RETURNS TABLE (
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
  v_contador integer;
  v_emitido integer;
BEGIN
  IF p_periodo IS NULL OR p_periodo !~ '^(0[1-9]|1[0-2])[0-9]{2}$' THEN
    RAISE EXCEPTION 'continuidad_folio_invalida' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1
  FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'configuracion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_configuracion' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(contador.ultimo, 0) INTO v_contador
  FROM public.contador_folios contador WHERE contador.periodo = p_periodo;
  v_contador := coalesce(v_contador, 0);
  SELECT coalesce(max(right(folio_cnc, 4)::integer), 0) INTO v_emitido
  FROM public.pipeline
  WHERE folio_cnc ~ ('^CNC-' || p_periodo || '-[0-9]{4}$');

  RETURN QUERY SELECT v_contador, v_emitido,
    CASE WHEN greatest(v_contador, v_emitido) < 9999
      THEN greatest(v_contador, v_emitido) + 1 ELSE NULL::integer END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consultar_continuidad_folio_cnc(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_continuidad_folio_cnc(text, uuid)
  TO service_role;
