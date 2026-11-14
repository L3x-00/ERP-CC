-- =============================================================================
-- B8 — Promesas de pago y compras validan sus fechas contra el "hoy" del negocio
--
-- Mismo defecto que C2.2 en el RFQ: `crear_promesa_pago` y `crear_compra`
-- comparaban contra `current_date` (huso de la sesión, UTC en Supabase) mientras
-- la UI captura fechas en `America/Tijuana` (AUD-12). De 16:00/17:00 locales en
-- adelante, una promesa o un vencimiento fechado "hoy" se rechazaba como pasado.
--
-- Corrección: el piso es `(now() AT TIME ZONE 'America/Tijuana')::date`.
-- Sin cambios de firma, tabla, permisos ni de la lógica de negocio.
-- Aditiva: solo redefine las dos funciones. Aplicar solo en local.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F3: promesas de pago con recordatorios (2 días antes y al vencer).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_promesa_pago(
  p_cuenta_id uuid,
  p_fecha_prometida date,
  p_monto numeric,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cuenta_id uuid,
  fecha_prometida date,
  monto numeric,
  estado text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_promesa public.promesas_pago%ROWTYPE;
BEGIN
  -- AUD-12: el ERP opera en America/Tijuana; `current_date` (UTC) adelanta un
  -- día por la tarde y rechazaba la promesa capturada "hoy".
  IF p_cuenta_id IS NULL OR p_actor_id IS NULL OR p_fecha_prometida IS NULL
     OR p_monto IS NULL OR p_monto <= 0
     OR p_monto IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_fecha_prometida < (now() AT TIME ZONE 'America/Tijuana')::date
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos') THEN
    RAISE EXCEPTION 'datos_promesa_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' OR v_cuenta.saldo_pendiente <= 0 THEN
    RAISE EXCEPTION 'cuenta_no_disponible_para_promesa' USING ERRCODE = 'check_violation';
  END IF;
  IF round(p_monto, 4) > v_cuenta.saldo_pendiente THEN
    RAISE EXCEPTION 'monto_excede_saldo' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.promesas_pago AS promesa
    WHERE promesa.cuenta_id = p_cuenta_id AND promesa.estado IN ('VIGENTE', 'VENCIDA')
  ) THEN
    RAISE EXCEPTION 'promesa_ya_existe' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.promesas_pago (cuenta_id, fecha_prometida, monto, estado, creado_por)
  VALUES (p_cuenta_id, p_fecha_prometida, round(p_monto, 4), 'VIGENTE', p_actor_id)
  RETURNING * INTO v_promesa;

  RETURN QUERY SELECT v_promesa.id, v_promesa.cuenta_id, v_promesa.fecha_prometida,
    v_promesa.monto, v_promesa.estado, v_promesa.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid) IS
  'SII-B8 F3: registra la promesa de pago de una AR (una activa por cuenta); solo service_role. La fecha se compara con el hoy de America/Tijuana (AUD-12).';

REVOKE ALL ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_promesa_pago(uuid, date, numeric, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- F4 + C10.1: alta de compra en BORRADOR con folio CG-MMYY_####.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_compra(
  p_proveedor_id uuid,
  p_orden_id uuid,
  p_monto_subtotal numeric,
  p_monto_iva numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha_vencimiento date,
  p_notas text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_rubro_costo text DEFAULT NULL,
  p_concepto text DEFAULT NULL,
  p_material_id uuid DEFAULT NULL,
  p_cantidad numeric DEFAULT NULL,
  p_unidad text DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  folio_sii text,
  estado text,
  monto_total numeric,
  saldo_pendiente numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_total numeric(14, 4);
  v_folio text;
  v_compra public.compras%ROWTYPE;
  v_rubro text := NULLIF(lower(btrim(coalesce(p_rubro_costo, ''))), '');
BEGIN
  IF p_proveedor_id IS NULL OR p_actor_id IS NULL
     OR p_monto_subtotal IS NULL OR p_monto_subtotal < 0
     OR p_monto_iva IS NULL OR p_monto_iva < 0
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR (upper(trim(p_moneda)) = 'MXN' AND round(p_tipo_cambio, 4) <> 1)
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  -- F06: una compra con Orden no puede nacer sin rubro. Las históricas ya
  -- existentes no pasan por aquí y se clasifican con asignar_rubro_costo_compra.
  IF p_orden_id IS NOT NULL AND v_rubro IS NULL THEN
    RAISE EXCEPTION 'rubro_costo_requerido' USING ERRCODE = 'check_violation';
  END IF;
  IF v_rubro IS NOT NULL
     AND v_rubro NOT IN ('material', 'subcontratacion', 'gastos_directos') THEN
    RAISE EXCEPTION 'rubro_costo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  IF p_cantidad IS NOT NULL AND p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad_compra_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_costo_unitario IS NOT NULL AND p_costo_unitario < 0 THEN
    RAISE EXCEPTION 'costo_unitario_compra_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cantidad IS NOT NULL AND p_costo_unitario IS NOT NULL
     AND abs(p_monto_subtotal - p_cantidad * p_costo_unitario) > 0.01 THEN
    RAISE EXCEPTION 'subtotal_material_incoherente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.proveedores AS proveedor
  WHERE proveedor.id = p_proveedor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proveedor_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_orden_id IS NOT NULL THEN
    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = p_orden_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF p_material_id IS NOT NULL THEN
    PERFORM 1 FROM public.catalogo_materiales AS material
    WHERE material.id = p_material_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- AUD-12: mismo "hoy" del negocio que usa la UI para capturar el vencimiento.
  IF p_fecha_vencimiento IS NOT NULL
     AND p_fecha_vencimiento < (now() AT TIME ZONE 'America/Tijuana')::date THEN
    RAISE EXCEPTION 'vencimiento_compra_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_total := round(p_monto_subtotal + p_monto_iva, 4);
  v_folio := privado.siguiente_folio_cg();

  INSERT INTO public.compras (
    folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
    moneda, tipo_cambio, saldo_pendiente, fecha_vencimiento, notas, creado_por,
    rubro_costo, concepto, material_id, cantidad, unidad, costo_unitario
  ) VALUES (
    v_folio, p_proveedor_id, p_orden_id, 'BORRADOR', round(p_monto_subtotal, 4),
    round(p_monto_iva, 4), v_total, upper(trim(p_moneda)), round(p_tipo_cambio, 4),
    v_total, p_fecha_vencimiento, NULLIF(btrim(p_notas), ''), p_actor_id,
    v_rubro, NULLIF(btrim(p_concepto), ''), p_material_id, p_cantidad,
    NULLIF(btrim(p_unidad), ''), p_costo_unitario
  )
  RETURNING * INTO v_compra;

  RETURN QUERY SELECT v_compra.id, v_compra.folio_sii, v_compra.estado,
    v_compra.monto_total, v_compra.saldo_pendiente, v_compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid,
  text, text, uuid, numeric, text, numeric) IS
  'SII-B8 F4 + C10.1: crea la compra en BORRADOR con folio CG-MMYY_####; con Orden exige rubro_costo. El vencimiento se compara con el hoy de America/Tijuana (AUD-12). Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid,
  text, text, uuid, numeric, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid,
  text, text, uuid, numeric, text, numeric)
  TO service_role;
