-- =============================================================================
-- SII-B2.2/B2.4/B2.5 — Alta atómica cliente + contacto, comercial y estado
-- Plan: docs/plan-erp-sii/02-clientes.md §2.2, §2.4, §2.5
-- Documento del cliente: §8.2 (clave de datos), §8.3 (reglas), §6
--
-- Entrega:
--   * columnas comerciales `moneda`, `credito_habilitado`, `dias_credito`
--     con CHECK de coherencia y backfill desde `condiciones_pago`
--   * RPC `crear_cliente_con_contacto` (transacción única)
--   * RPC `cambiar_estado_cliente` (CAS con `actualizado_en`, sin borrado)
-- REGLAS: moneda obligatoria; crédito habilitado exige 1..365 días; estado
-- solo cambia por acción auditada; ningún cliente se elimina.
-- Aditiva e idempotente; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas comerciales y coherencia
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS credito_habilitado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_credito integer;

COMMENT ON COLUMN public.clientes.moneda IS
  'Moneda comercial del cliente (MXN/USD). Obligatoria, default MXN.';
COMMENT ON COLUMN public.clientes.credito_habilitado IS
  'Crédito habilitado; sincronizado con `condiciones_pago` (contado = sin crédito).';
COMMENT ON COLUMN public.clientes.dias_credito IS
  'Plazo de crédito en días (1..365 con crédito; null/0 sin crédito).';

-- Backfill idempotente desde condiciones_pago (solo filas aún sin migrar).
UPDATE public.clientes
SET credito_habilitado = true,
    dias_credito = CASE condiciones_pago
      WHEN '15_dias' THEN 15
      WHEN '30_dias' THEN 30
      WHEN 'credito' THEN 45
      ELSE dias_credito
    END
WHERE condiciones_pago IN ('15_dias', '30_dias', 'credito')
  AND credito_habilitado IS FALSE
  AND dias_credito IS NULL;

UPDATE public.clientes
SET credito_habilitado = false,
    dias_credito = 0
WHERE condiciones_pago = 'contado'
  AND dias_credito IS NULL;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_moneda_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_moneda_check
  CHECK (moneda IN ('MXN', 'USD'));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_credito_coherente;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_credito_coherente
  CHECK (
    (credito_habilitado AND dias_credito IS NOT NULL
      AND dias_credito BETWEEN 1 AND 365)
    OR (NOT credito_habilitado AND (dias_credito IS NULL OR dias_credito = 0))
  );

-- -----------------------------------------------------------------------------
-- 2. Alta atómica: cliente + contacto principal en una sola transacción
--    - valida actor activo con `cliente_editar` (o admin)
--    - deduplica por RFC / correo / razón social con folio existente
--    - el contacto es opcional para no romper llamadores legados, pero si
--      viene, se inserta como principal en la misma transacción
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

  -- Coherencia crédito/días: lo explícito manda; si no, se deriva de
  -- `condiciones_pago` con el mapeo histórico (contado→no, credito→45 días).
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
      v_dias := coalesce(v_dias, 45);
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
    v_credito := v_condiciones IN ('15_dias', '30_dias', 'credito');
    v_dias := CASE v_condiciones
      WHEN '15_dias' THEN 15
      WHEN '30_dias' THEN 30
      WHEN 'credito' THEN 45
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
  'Alta atómica de cliente + contacto principal. Valida actor con cliente_editar, deduplica y devuelve {clienteId, folio, contactoId}. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cliente_con_contacto(jsonb, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Estado por acción controlada (CAS + motivo + auditoría en la acción)
--    Transiciones: prospecto→activo|inactivo, activo→inactivo, inactivo→activo.
--    No existe RPC de borrado de clientes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_cliente(
  p_cliente_id uuid,
  p_nuevo_estado text,
  p_motivo text,
  p_actor uuid,
  p_actualizado_en timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
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

  IF p_cliente_id IS NULL OR p_nuevo_estado IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_nuevo_estado NOT IN ('prospecto', 'activo', 'inactivo') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = '22023';
  END IF;

  IF p_actualizado_en IS NULL
     OR v_cliente.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'cliente_desactualizado' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (v_cliente.estado = 'prospecto' AND p_nuevo_estado IN ('activo', 'inactivo'))
    OR (v_cliente.estado = 'activo' AND p_nuevo_estado = 'inactivo')
    OR (v_cliente.estado = 'inactivo' AND p_nuevo_estado = 'activo')
  ) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_nuevo_estado = 'inactivo' AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clientes SET estado = p_nuevo_estado WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'clienteId', p_cliente_id,
    'estado', p_nuevo_estado
  );
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_cliente(uuid, text, text, uuid, timestamptz) IS
  'Cambia el estado del cliente con CAS, transiciones válidas y motivo obligatorio para inactivar. Solo service_role.';

REVOKE ALL ON FUNCTION public.cambiar_estado_cliente(uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cliente(uuid, text, text, uuid, timestamptz) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Realtime: la lista y la ficha observan cambios de cliente (sin payloads extra)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
  END IF;
END;
$$;
