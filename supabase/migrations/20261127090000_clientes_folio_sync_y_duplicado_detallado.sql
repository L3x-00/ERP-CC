-- =============================================================================
-- Clientes — folio consecutivo auto-reparable y duplicados con causa concreta
--
-- Contexto (2026-11-27): al crear un cliente, la RPC `crear_cliente_con_contacto`
-- reportaba "Ya existe un cliente con el mismo RFC, correo o razón social"
-- aunque no existiera ningún cliente con esos datos.
--
-- Causa: `secuencia_folio_cliente` quedó detrás del folio más alto ya usado
-- (7 clientes CLI-0041..CLI-0047 con la secuencia en 46). El INSERT violaba el
-- índice `ux_clientes_folio`, y el bloque `EXCEPTION WHEN unique_violation`
-- traducía CUALQUIER colisión única como `cliente_duplicado`, sin folio ni
-- motivo. El mensaje era falso y sin salida.
--
-- Entrega:
--   1. Resincroniza la secuencia con el folio más alto realmente usado
--      (idempotente; no retrocede si ya va adelante).
--   2. El trigger de folio reintenta si el folio generado ya está ocupado,
--      de modo que una secuencia atrasada no vuelve a romper el alta.
--   3. La RPC identifica el campo exacto que choca (rfc, correo o razón
--      social) y devuelve en DETAIL el cliente existente para ofrecer
--      "seleccionar este cliente" en la UI. El folio ya no se confunde con
--      un duplicado de datos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Resincronizar la secuencia de folios con el máximo folio usado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_max integer;
  v_actual integer;
BEGIN
  SELECT COALESCE(MAX((substring(folio FROM 5))::integer), 0)
    INTO v_max
    FROM public.clientes
   WHERE folio ~ '^CLI-[0-9]+$';

  SELECT last_value INTO v_actual FROM public.secuencia_folio_cliente;

  IF v_max > v_actual THEN
    PERFORM setval('public.secuencia_folio_cliente', v_max, true);
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger de folio tolerante a una secuencia atrasada.
--    La unicidad definitiva la sigue garantizando `ux_clientes_folio`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.asignar_folio_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folio text;
  v_intento integer := 0;
BEGIN
  IF new.folio IS NULL THEN
    LOOP
      v_intento := v_intento + 1;
      v_folio := public.generar_folio_cliente();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.clientes c WHERE c.folio = v_folio
      );
      IF v_intento >= 10000 THEN
        RAISE EXCEPTION 'folio_no_disponible' USING ERRCODE = '23505';
      END IF;
    END LOOP;
    new.folio := v_folio;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION privado.asignar_folio_cliente() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. RPC de alta: causa explícita y detalle del cliente existente.
--    DETAIL (texto JSON) =
--      {"campo":"rfc|correo|razon_social","cliente":{...datos mínimos...}}
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_cliente_con_contacto(
  p_datos jsonb,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_nombre_comercial text;
  v_razon_social text;
  v_rfc text;
  v_correo text;
  v_telefono text;
  v_contacto_cabecera text;
  v_contacto jsonb;
  v_contacto_nombre text;
  v_moneda text;
  v_condiciones text;
  v_credito boolean;
  v_dias integer;
  v_limite numeric;
  v_estado text;
  v_direccion_fiscal jsonb;
  v_direccion_envio jsonb;
  v_cliente_id uuid;
  v_folio text;
  v_contacto_id uuid;
  v_duplicado record;
  v_campo text;
  v_intento integer;
  v_constraint text;
  v_detalle jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.usuarios WHERE id = p_actor;
  IF NOT FOUND OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF v_actor.rol <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.permisos_rol pr
    WHERE pr.rol = v_actor.rol AND pr.permiso = 'cliente_editar'
  ) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_nombre_comercial := nullif(btrim(coalesce(p_datos->>'nombre_comercial', '')), '');
  v_razon_social := nullif(btrim(coalesce(p_datos->>'razon_social', '')), '');
  IF v_nombre_comercial IS NULL OR v_razon_social IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_rfc := nullif(upper(btrim(coalesce(p_datos->>'rfc', ''))), '');
  v_correo := nullif(lower(btrim(coalesce(p_datos->>'correo', ''))), '');
  v_telefono := nullif(btrim(coalesce(p_datos->>'telefono', '')), '');
  v_contacto_cabecera := nullif(btrim(coalesce(p_datos->>'contacto_cabecera', '')), '');
  v_contacto := CASE
    WHEN jsonb_typeof(p_datos->'contacto') = 'object' THEN p_datos->'contacto'
    ELSE NULL
  END;
  v_contacto_nombre := nullif(btrim(coalesce(v_contacto->>'nombre', '')), '');

  v_moneda := upper(btrim(coalesce(p_datos->>'moneda', 'MXN')));
  IF v_moneda NOT IN ('MXN', 'USD') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_condiciones := nullif(btrim(coalesce(p_datos->>'condiciones_pago', '')), '');
  IF v_condiciones IS NOT NULL
     AND v_condiciones NOT IN ('contado', '15_dias', '30_dias', 'credito') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_estado := lower(btrim(coalesce(p_datos->>'estado', 'activo')));
  IF v_estado NOT IN ('prospecto', 'activo', 'inactivo') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;

  v_limite := coalesce(nullif(p_datos->>'limite_credito', '')::numeric, 0);
  IF v_limite < 0 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  -- D4-B: `credito` no tiene días implícitos. Lo explícito manda; si no,
  -- contado/15/30 se derivan de `condiciones_pago` y `credito` exige días.
  IF jsonb_typeof(p_datos->'credito_habilitado') = 'boolean' THEN
    v_credito := (p_datos->>'credito_habilitado')::boolean;
    v_dias := NULL;
    IF jsonb_typeof(p_datos->'dias_credito') = 'number' THEN
      v_dias := (p_datos->>'dias_credito')::integer;
    ELSIF p_datos->'dias_credito' IS NOT NULL
          AND jsonb_typeof(p_datos->'dias_credito') <> 'null' THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
    END IF;

    IF v_credito THEN
      IF v_dias IS NULL THEN
        RAISE EXCEPTION 'dias_credito_requeridos' USING ERRCODE = '22023';
      END IF;
      IF v_dias NOT BETWEEN 1 AND 365 THEN
        RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
      END IF;
      v_condiciones := CASE v_dias
        WHEN 15 THEN '15_dias'
        WHEN 30 THEN '30_dias'
        ELSE 'credito'
      END;
    ELSE
      v_dias := 0;
      v_condiciones := 'contado';
    END IF;
  ELSIF v_condiciones IS NOT NULL THEN
    IF v_condiciones = 'credito' THEN
      RAISE EXCEPTION 'dias_credito_requeridos' USING ERRCODE = '22023';
    END IF;
    v_credito := v_condiciones IN ('15_dias', '30_dias', 'credito');
    v_dias := CASE v_condiciones
      WHEN '15_dias' THEN 15
      WHEN '30_dias' THEN 30
      ELSE 0
    END;
  ELSE
    v_credito := false;
    v_dias := NULL;
  END IF;

  v_direccion_fiscal := CASE
    WHEN jsonb_typeof(p_datos->'direccion_fiscal') = 'object' THEN p_datos->'direccion_fiscal'
    ELSE NULL
  END;
  v_direccion_envio := CASE
    WHEN jsonb_typeof(p_datos->'direccion_envio') = 'object' THEN p_datos->'direccion_envio'
    ELSE NULL
  END;

  -- Deduplicación por prioridad: RFC, correo y razón social. Así el error dice
  -- exactamente qué dato chocó y con qué cliente.
  IF v_rfc IS NOT NULL THEN
    SELECT c.id, c.folio, c.razon_social, c.nombre_comercial,
           c.rfc, c.contacto, c.correo, c.telefono, c.condiciones_pago, c.estado
      INTO v_duplicado
      FROM public.clientes c
     WHERE upper(c.rfc) = v_rfc
     ORDER BY c.creado_en, c.id
     LIMIT 1;
    IF FOUND THEN
      v_campo := 'rfc';
    END IF;
  END IF;

  IF v_campo IS NULL AND v_correo IS NOT NULL THEN
    SELECT c.id, c.folio, c.razon_social, c.nombre_comercial,
           c.rfc, c.contacto, c.correo, c.telefono, c.condiciones_pago, c.estado
      INTO v_duplicado
      FROM public.clientes c
     WHERE lower(c.correo) = v_correo
     ORDER BY c.creado_en, c.id
     LIMIT 1;
    IF FOUND THEN
      v_campo := 'correo';
    END IF;
  END IF;

  IF v_campo IS NULL THEN
    SELECT c.id, c.folio, c.razon_social, c.nombre_comercial,
           c.rfc, c.contacto, c.correo, c.telefono, c.condiciones_pago, c.estado
      INTO v_duplicado
      FROM public.clientes c
     WHERE lower(c.razon_social) = lower(v_razon_social)
     ORDER BY c.creado_en, c.id
     LIMIT 1;
    IF FOUND THEN
      v_campo := 'razon_social';
    END IF;
  END IF;

  IF v_campo IS NOT NULL THEN
    v_detalle := jsonb_build_object(
      'campo', v_campo,
      'cliente', jsonb_build_object(
        'id', v_duplicado.id,
        'folio', v_duplicado.folio,
        'razonSocial', v_duplicado.razon_social,
        'nombreComercial', v_duplicado.nombre_comercial,
        'rfc', v_duplicado.rfc,
        'contacto', v_duplicado.contacto,
        'correo', v_duplicado.correo,
        'telefono', v_duplicado.telefono,
        'condicionesPago', v_duplicado.condiciones_pago,
        'estado', v_duplicado.estado
      )
    );
    RAISE EXCEPTION 'cliente_duplicado'
      USING ERRCODE = '23505', DETAIL = v_detalle::text;
  END IF;

  -- El folio lo asigna el trigger. Si una carrera o una secuencia atrasada
  -- provoca colisión SOLO del folio, se reintenta; nunca se reporta como
  -- cliente duplicado.
  FOR v_intento IN 1..3 LOOP
    BEGIN
      INSERT INTO public.clientes (
        nombre_comercial, razon_social, rfc, contacto, correo, telefono,
        condiciones_pago, limite_credito, estado, direccion_fiscal, direccion_envio,
        moneda, credito_habilitado, dias_credito
      ) VALUES (
        v_nombre_comercial, v_razon_social, v_rfc,
        coalesce(v_contacto_nombre, v_contacto_cabecera), v_correo, v_telefono,
        v_condiciones, v_limite, v_estado, v_direccion_fiscal, v_direccion_envio,
        v_moneda, v_credito, v_dias
      )
      RETURNING id, folio INTO v_cliente_id, v_folio;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'ux_clientes_folio' THEN
        IF v_intento < 3 THEN
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'folio_no_disponible' USING ERRCODE = '23505';
      END IF;

      v_campo := CASE v_constraint
        WHEN 'clientes_rfc_key' THEN 'rfc'
        WHEN 'ux_clientes_correo' THEN 'correo'
        WHEN 'ux_clientes_razon_social' THEN 'razon_social'
        ELSE NULL
      END;

      IF v_campo IS NULL THEN
        RAISE EXCEPTION 'cliente_conflicto_desconocido' USING ERRCODE = '23505';
      END IF;

      -- Carrera: otra alta insertó el mismo dato entre la verificación y el
      -- INSERT. Se localiza el cliente ganador para devolver el mismo detalle.
      SELECT c.id, c.folio, c.razon_social, c.nombre_comercial,
             c.rfc, c.contacto, c.correo, c.telefono, c.condiciones_pago, c.estado
        INTO v_duplicado
        FROM public.clientes c
       WHERE (v_campo = 'rfc' AND upper(c.rfc) = v_rfc)
          OR (v_campo = 'correo' AND lower(c.correo) = v_correo)
          OR (v_campo = 'razon_social' AND lower(c.razon_social) = lower(v_razon_social))
       ORDER BY c.creado_en, c.id
       LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'cliente_conflicto_desconocido' USING ERRCODE = '23505';
      END IF;

      v_detalle := jsonb_build_object(
        'campo', v_campo,
        'cliente', jsonb_build_object(
          'id', v_duplicado.id,
          'folio', v_duplicado.folio,
          'razonSocial', v_duplicado.razon_social,
          'nombreComercial', v_duplicado.nombre_comercial,
          'rfc', v_duplicado.rfc,
          'contacto', v_duplicado.contacto,
          'correo', v_duplicado.correo,
          'telefono', v_duplicado.telefono,
          'condicionesPago', v_duplicado.condiciones_pago,
          'estado', v_duplicado.estado
        )
      );
      RAISE EXCEPTION 'cliente_duplicado'
        USING ERRCODE = '23505', DETAIL = v_detalle::text;
    END;
  END LOOP;

  IF v_contacto_nombre IS NOT NULL THEN
    INSERT INTO public.contactos_cliente (
      cliente_id, nombre, puesto, correo, telefono, notas, es_principal, creado_por
    ) VALUES (
      v_cliente_id,
      v_contacto_nombre,
      nullif(btrim(coalesce(v_contacto->>'puesto', '')), ''),
      nullif(lower(btrim(coalesce(v_contacto->>'correo', ''))), ''),
      nullif(btrim(coalesce(v_contacto->>'telefono', '')), ''),
      nullif(btrim(coalesce(v_contacto->>'notas', '')), ''),
      true,
      p_actor
    )
    RETURNING id INTO v_contacto_id;
  END IF;

  RETURN jsonb_build_object(
    'clienteId', v_cliente_id,
    'folio', v_folio,
    'contactoId', v_contacto_id
  );
END;
$$;

COMMENT ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) IS
  'Alta atómica de cliente + contacto principal. Valida actor con cliente_editar, deduplica por RFC/correo/razón social devolviendo el campo y el cliente existente en DETAIL, y tolera colisiones de folio reintentando. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) TO service_role;
