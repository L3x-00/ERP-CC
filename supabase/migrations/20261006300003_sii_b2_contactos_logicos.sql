-- =============================================================================
-- SII-B2.3 — Contactos: baja lógica y un solo principal activo
-- Plan: docs/plan-erp-sii/02-clientes.md §2.3
-- Documento del cliente: §8.3 (solo un principal activo, no eliminar históricos)
--
-- Entrega:
--   * columnas `activo`, `desactivado_en`, `desactivado_por` + backfill
--   * índice único parcial `(cliente_id) where es_principal and activo`
--   * RPCs `marcar_contacto_principal`, `desactivar_contacto_cliente`,
--     `reactivar_contacto_cliente` (sin borrado duro desde la UI)
-- ORDEN DE LOCKS (documentado): `public.clientes` (FOR UPDATE) y luego
-- `public.contactos_cliente` (FOR UPDATE). Todas las RPC respetan ese orden.
-- Aditiva e idempotente; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas de baja lógica y backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.contactos_cliente
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desactivado_en timestamptz,
  ADD COLUMN IF NOT EXISTS desactivado_por uuid REFERENCES public.usuarios (id);

COMMENT ON COLUMN public.contactos_cliente.activo IS
  'Baja lógica del contacto: inactivo no participa en flujos nuevos y conserva historial.';
COMMENT ON COLUMN public.contactos_cliente.desactivado_en IS
  'Marca temporal de la baja lógica (null mientras el contacto está activo).';
COMMENT ON COLUMN public.contactos_cliente.desactivado_por IS
  'Actor que ejecutó la baja lógica.';

-- -----------------------------------------------------------------------------
-- 2. Un solo principal ACTIVO por cliente (índice único parcial)
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_contactos_cliente_principal;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contactos_cliente_principal_activo
  ON public.contactos_cliente (cliente_id)
  WHERE es_principal AND activo;

-- -----------------------------------------------------------------------------
-- 3. Marcar principal: quita el anterior y marca el nuevo en una transacción
--    Método: lock del cliente; el índice parcial garantiza a lo sumo uno.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_contacto_principal(
  p_contacto_id uuid,
  p_cliente_id uuid,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_contacto public.contactos_cliente%ROWTYPE;
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

  IF p_contacto_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contacto
  FROM public.contactos_cliente
  WHERE id = p_contacto_id AND cliente_id = p_cliente_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contacto_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_contacto.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'contacto_inactivo' USING ERRCODE = '22023';
  END IF;

  -- Se limpia el principal anterior (activo o no) para no bloquear una
  -- reactivación futura con el índice parcial.
  UPDATE public.contactos_cliente
  SET es_principal = false
  WHERE cliente_id = p_cliente_id
    AND es_principal
    AND id <> p_contacto_id;

  UPDATE public.contactos_cliente
  SET es_principal = true
  WHERE id = p_contacto_id
    AND NOT es_principal;

  RETURN jsonb_build_object(
    'clienteId', p_cliente_id,
    'contactoId', p_contacto_id
  );
END;
$$;

COMMENT ON FUNCTION public.marcar_contacto_principal(uuid, uuid, uuid) IS
  'Marca un contacto activo como principal y desmarca el anterior en una transacción (lock del cliente). Solo service_role.';

REVOKE ALL ON FUNCTION public.marcar_contacto_principal(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_contacto_principal(uuid, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Baja lógica del contacto (motivo + CAS + auditoría en la acción)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desactivar_contacto_cliente(
  p_contacto_id uuid,
  p_cliente_id uuid,
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
  v_contacto public.contactos_cliente%ROWTYPE;
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

  IF p_contacto_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contacto
  FROM public.contactos_cliente
  WHERE id = p_contacto_id AND cliente_id = p_cliente_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contacto_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_contacto.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'contacto_ya_inactivo' USING ERRCODE = '22023';
  END IF;

  IF p_actualizado_en IS NULL
     OR v_contacto.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'contacto_desactualizado' USING ERRCODE = '23514';
  END IF;

  UPDATE public.contactos_cliente
  SET activo = false,
      desactivado_en = now(),
      desactivado_por = p_actor
  WHERE id = p_contacto_id;

  RETURN jsonb_build_object(
    'clienteId', p_cliente_id,
    'contactoId', p_contacto_id
  );
END;
$$;

COMMENT ON FUNCTION public.desactivar_contacto_cliente(uuid, uuid, text, uuid, timestamptz) IS
  'Baja lógica de un contacto con motivo obligatorio y CAS. Conserva historial. Solo service_role.';

REVOKE ALL ON FUNCTION public.desactivar_contacto_cliente(uuid, uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desactivar_contacto_cliente(uuid, uuid, text, uuid, timestamptz) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Reactivación del contacto (guarda de principal activo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivar_contacto_cliente(
  p_contacto_id uuid,
  p_cliente_id uuid,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_contacto public.contactos_cliente%ROWTYPE;
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

  IF p_contacto_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contacto
  FROM public.contactos_cliente
  WHERE id = p_contacto_id AND cliente_id = p_cliente_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contacto_no_encontrado' USING ERRCODE = '22023';
  END IF;

  IF v_contacto.activo IS TRUE THEN
    RETURN jsonb_build_object(
      'clienteId', p_cliente_id,
      'contactoId', p_contacto_id,
      'reactivado', false
    );
  END IF;

  IF v_contacto.es_principal IS TRUE AND EXISTS (
    SELECT 1 FROM public.contactos_cliente
    WHERE cliente_id = p_cliente_id
      AND es_principal
      AND activo
      AND id <> p_contacto_id
  ) THEN
    RAISE EXCEPTION 'principal_activo_existe' USING ERRCODE = '23505';
  END IF;

  UPDATE public.contactos_cliente
  SET activo = true,
      desactivado_en = null,
      desactivado_por = null
  WHERE id = p_contacto_id;

  RETURN jsonb_build_object(
    'clienteId', p_cliente_id,
    'contactoId', p_contacto_id,
    'reactivado', true
  );
END;
$$;

COMMENT ON FUNCTION public.reactivar_contacto_cliente(uuid, uuid, uuid) IS
  'Reactiva un contacto con baja lógica; si era principal y ya hay otro principal activo, exige resolverlo. Solo service_role.';

REVOKE ALL ON FUNCTION public.reactivar_contacto_cliente(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reactivar_contacto_cliente(uuid, uuid, uuid) TO service_role;
