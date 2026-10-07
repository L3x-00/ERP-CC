-- =============================================================================
-- Decisión final del cliente D4-B — plazo de crédito por cliente
-- Plan: docs/plan-erp-sii/02-clientes.md §2.4, 08-finanzas.md §8.3; doc §14.
--
-- La condición `credito` usa los días configurados en `clientes.dias_credito`
-- en lugar del valor fijo de 45. `contado` (0), `15_dias` (15) y `30_dias` (30)
-- conservan su regla explícita; una condición desconocida conserva el fallback
-- histórico de 30. Si un cliente con `credito` no tiene días configurados
-- (crédito apagado/0/NULL), la operación falla con `cliente_credito_sin_dias`:
-- primero se completa la condición del cliente.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007220001).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Entrega total: activa la AR con el plazo configurado del cliente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archivar_orden_al_entregar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_pendientes integer;
BEGIN
  SELECT nota.orden_id INTO v_orden_id
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF v_orden_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_orden_id
    AND coalesce(
      (
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        WHERE renglon.partida_id = partida.id
      ),
      0
    ) < partida.cantidad_solicitada;

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = coalesce(archivada_en, now())
    WHERE id = v_orden_id;

    -- D4-B: crédito exige días configurados en el cliente; nunca un 45 fijo.
    IF EXISTS (
      SELECT 1
      FROM public.cuentas_por_cobrar AS cuenta
      JOIN public.clientes AS cliente ON cliente.id = cuenta.cliente_id
      WHERE cuenta.orden_id = v_orden_id
        AND cuenta.cobrable_desde IS NULL
        AND lower(trim(coalesce(cliente.condiciones_pago, ''))) = 'credito'
        AND (
          cliente.credito_habilitado IS NOT TRUE
          OR cliente.dias_credito IS NULL
          OR cliente.dias_credito NOT BETWEEN 1 AND 365
        )
    ) THEN
      RAISE EXCEPTION 'cliente_credito_sin_dias' USING ERRCODE = 'check_violation';
    END IF;

    -- D-04: la entrega total vuelve cobrable la AR aún no cobrable. Plazo del
    -- cliente: contado 0; 15_dias 15; 30_dias 30; credito días configurados;
    -- sin captura o condición desconocida conserva el fallback histórico 30.
    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      cobrable_desde = now(),
      fecha_vencimiento = now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN 'credito' THEN cliente.dias_credito
        ELSE 30
      END)
    FROM public.clientes AS cliente
    WHERE cuenta.orden_id = v_orden_id
      AND cuenta.cliente_id = cliente.id
      AND cuenta.cobrable_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archivar_orden_al_entregar() IS
  'OBS-21/D-04/AR-04/D4-B: archiva al entregar totalmente y activa AR pendiente; credito usa los días del cliente (falla si no están configurados), otras condiciones mantienen su plazo; AR ya cobrables conservan historia.';

REVOKE EXECUTE ON FUNCTION public.archivar_orden_al_entregar()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_orden_al_entregar() TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Emisión de factura: recalcula el vencimiento con la misma regla D4-B
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emitir_factura(
  p_factura_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_folio_fiscal text,
  p_rfc_receptor text,
  p_uuid_fiscal text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  folio_fiscal text,
  ar_id uuid,
  ar_folio text,
  ar_vencimiento timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_factura public.facturas%ROWTYPE;
  v_folio text := nullif(btrim(coalesce(p_folio_fiscal, '')), '');
  v_rfc text := nullif(btrim(coalesce(p_rfc_receptor, '')), '');
  v_uuid text := nullif(btrim(coalesce(p_uuid_fiscal, '')), '');
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_ar_folio text;
  v_ar_vencimiento timestamptz;
BEGIN
  IF p_factura_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_folio IS NULL OR length(v_folio) > 60
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_factura_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas AS factura
  WHERE factura.id = p_factura_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_factura.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'factura_no_emitible' USING ERRCODE = 'check_violation', DETAIL = v_factura.estado;
  END IF;
  IF v_factura.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'factura_desactualizada' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.facturas AS otra
    WHERE otra.folio_fiscal = v_folio AND otra.id <> p_factura_id
  ) THEN
    RAISE EXCEPTION 'folio_fiscal_duplicado' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_cuenta
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.orden_id = v_factura.orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.factura_id IS NOT NULL AND v_cuenta.factura_id <> p_factura_id THEN
    RAISE EXCEPTION 'cuenta_ya_facturada' USING ERRCODE = 'check_violation';
  END IF;

  -- D4-B: crédito exige días configurados en el cliente; nunca un 45 fijo.
  IF EXISTS (
    SELECT 1
    FROM public.clientes AS cliente
    WHERE cliente.id = v_cuenta.cliente_id
      AND lower(trim(coalesce(cliente.condiciones_pago, ''))) = 'credito'
      AND (
        cliente.credito_habilitado IS NOT TRUE
        OR cliente.dias_credito IS NULL
        OR cliente.dias_credito NOT BETWEEN 1 AND 365
      )
  ) THEN
    RAISE EXCEPTION 'cliente_credito_sin_dias' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    factura_id = v_factura.id,
    folio_factura_remision = v_folio,
    fecha_vencimiento = CASE
      WHEN cuenta.cobrable_desde IS NOT NULL THEN now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN 'credito' THEN cliente.dias_credito
        ELSE 30
      END)
      ELSE NULL
    END
  FROM public.clientes AS cliente
  WHERE cuenta.id = v_cuenta.id
    AND cliente.id = cuenta.cliente_id
  RETURNING cuenta.id, cuenta.folio_factura_remision, cuenta.fecha_vencimiento
  INTO v_cuenta.id, v_ar_folio, v_ar_vencimiento;

  RETURN QUERY
  UPDATE public.facturas AS factura
  SET
    estado = 'EMITIDA',
    folio_fiscal = v_folio,
    rfc_receptor = v_rfc,
    uuid_fiscal = v_uuid,
    emitida_en = now()
  WHERE factura.id = p_factura_id
  RETURNING factura.id, factura.estado, factura.folio_fiscal, v_cuenta.id,
    v_ar_folio, v_ar_vencimiento, factura.actualizado_en;
END;
$function$;
COMMENT ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) IS
  'SII-B8 F2/D4-B: emite el borrador con folio fiscal capturado y vincula folio/vencimiento (contado 0, 15/30 días, credito días del cliente) a la AR de la orden. Solo service_role.';

REVOKE ALL ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_factura(uuid, timestamptz, text, text, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Alta de cliente: habilitar crédito exige días explícitos (sin default 45)
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

  SELECT c.id, c.folio INTO v_duplicado
  FROM public.clientes c
  WHERE (v_rfc IS NOT NULL AND upper(c.rfc) = v_rfc)
     OR (v_correo IS NOT NULL AND lower(c.correo) = v_correo)
     OR (lower(c.razon_social) = lower(v_razon_social))
  ORDER BY c.creado_en, c.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'cliente_duplicado'
      USING ERRCODE = '23505', DETAIL = coalesce(v_duplicado.folio, '');
  END IF;

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
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'cliente_duplicado' USING ERRCODE = '23505';
  END;

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
  'Alta atómica de cliente + contacto principal. Valida actor con cliente_editar, deduplica y devuelve {clienteId, folio, contactoId}; D4-B: habilitar credito exige dias_credito explícitos. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) TO service_role;
