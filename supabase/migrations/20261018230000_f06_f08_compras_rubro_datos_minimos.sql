-- =============================================================================
-- C10.1/F06/F07/F08 — Compras como fuente del costo de la Orden.
--   * rubro de costo obligatorio cuando la compra tiene Orden (en las RPC de
--     alta/edición; las filas históricas quedan nullable y se clasifican aparte);
--   * RPC mínima para clasificar históricas sin default silencioso a 'material';
--   * datos mínimos de material (concepto, cantidad, unidad, costo unitario);
--   * COMMENT de la tabla corregido: la compra sí alimenta el costo de la Orden.
--
-- Respuestas que mandan: F-02 (comprometido/real), F-05 (subcontratación
-- estimable), F-09 (históricas a mano), F-10 (capturar datos de material).
-- Aplicar SOLO local y ANTES del despliegue: las Server Actions envían los seis
-- parámetros nuevos. El PO aplica en remoto.
-- =============================================================================

-- 1. Columnas nuevas (nullable: las compras históricas no se tocan a ciegas).
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS rubro_costo text,
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.catalogo_materiales (id),
  ADD COLUMN IF NOT EXISTS cantidad numeric(14, 4),
  ADD COLUMN IF NOT EXISTS unidad text,
  ADD COLUMN IF NOT EXISTS costo_unitario numeric(14, 4);

COMMENT ON COLUMN public.compras.rubro_costo IS
  'C10.1/F06: material | subcontratacion | gastos_directos. Obligatorio cuando orden_id no es NULL.';
COMMENT ON COLUMN public.compras.concepto IS
  'C10.1/F08: descripción corta del bien/servicio comprado; no reemplaza notas.';
COMMENT ON COLUMN public.compras.material_id IS
  'C10.1/F08: material del catálogo (solo referencia; no mueve inventario ni el maestro de costos).';
COMMENT ON COLUMN public.compras.cantidad IS
  'C10.1/F08: cantidad comprada (> 0) cuando se captura el detalle de material.';
COMMENT ON COLUMN public.compras.unidad IS
  'C10.1/F08: unidad capturada por el usuario; no se convierte a unidad_base.';
COMMENT ON COLUMN public.compras.costo_unitario IS
  'C10.1/F08: costo unitario sin IVA; con cantidad debe cuadrar con monto_subtotal.';

-- 2. CHECKs (idempotentes). La coherencia usa tolerancia de 0.01 para no
--    castigar redondeos o descuentos legítimos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_rubro_costo_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_rubro_costo_check
      CHECK (rubro_costo IS NULL
        OR rubro_costo IN ('material', 'subcontratacion', 'gastos_directos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_cantidad_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_cantidad_check
      CHECK (cantidad IS NULL OR cantidad > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_costo_unitario_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_costo_unitario_check
      CHECK (costo_unitario IS NULL OR costo_unitario >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_subtotal_coherente_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_subtotal_coherente_check
      CHECK (cantidad IS NULL OR costo_unitario IS NULL
        OR abs(monto_subtotal - cantidad * costo_unitario) <= 0.01);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_concepto_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_concepto_check
      CHECK (concepto IS NULL OR char_length(btrim(concepto)) BETWEEN 2 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_unidad_check') THEN
    ALTER TABLE public.compras ADD CONSTRAINT compras_unidad_check
      CHECK (unidad IS NULL OR char_length(btrim(unidad)) BETWEEN 1 AND 40);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_compras_orden_estado
  ON public.compras (orden_id, estado)
  WHERE orden_id IS NOT NULL;

COMMENT ON TABLE public.compras IS
  'SII-B8 F4 + C10.1: compra/orden de compra con folio CG-MMYY_####, CxP por saldo y pagos parciales a proveedores. Con orden_id alimenta el costo de la Orden según rubro_costo; sin Orden es gasto indirecto.';

-- 3. crear_compra: se elimina la firma de 10 args y se recrea con los seis
--    parámetros de costo al final (DEFAULT NULL) para no romper llamadas
--    posicionales de 9 args.
DROP FUNCTION IF EXISTS public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid);

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

  IF p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento < current_date THEN
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
  'SII-B8 F4 + C10.1: crea la compra en BORRADOR con folio CG-MMYY_####; con Orden exige rubro_costo. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid,
  text, text, uuid, numeric, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_compra(
  uuid, uuid, numeric, numeric, text, numeric, date, text, uuid, uuid,
  text, text, uuid, numeric, text, numeric)
  TO service_role;

-- 4. actualizar_compra_borrador: misma ampliación al final.
DROP FUNCTION IF EXISTS public.actualizar_compra_borrador(
  uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid);

CREATE OR REPLACE FUNCTION public.actualizar_compra_borrador(
  p_compra_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_proveedor_id uuid,
  p_orden_id uuid,
  p_monto_subtotal numeric,
  p_monto_iva numeric,
  p_moneda text,
  p_tipo_cambio numeric,
  p_fecha_vencimiento date,
  p_notas text,
  p_actor_id uuid,
  p_rubro_costo text DEFAULT NULL,
  p_concepto text DEFAULT NULL,
  p_material_id uuid DEFAULT NULL,
  p_cantidad numeric DEFAULT NULL,
  p_unidad text DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  proveedor_id uuid,
  orden_id uuid,
  monto_subtotal numeric,
  monto_iva numeric,
  monto_total numeric,
  moneda text,
  tipo_cambio numeric,
  saldo_pendiente numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_total numeric(14, 4);
  v_rubro text := NULLIF(lower(btrim(coalesce(p_rubro_costo, ''))), '');
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR p_proveedor_id IS NULL
     OR p_monto_subtotal IS NULL OR p_monto_subtotal < 0
     OR p_monto_iva IS NULL OR p_monto_iva < 0
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('MXN', 'USD')
     OR p_tipo_cambio IS NULL OR p_tipo_cambio <= 0
     OR (upper(trim(p_moneda)) = 'MXN' AND round(p_tipo_cambio, 4) <> 1)
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

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

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'compra_no_editable' USING ERRCODE = 'check_violation', DETAIL = v_compra.estado;
  END IF;
  IF v_compra.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'compra_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.proveedores AS proveedor WHERE proveedor.id = p_proveedor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proveedor_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_orden_id IS NOT NULL THEN
    PERFORM 1 FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  IF p_material_id IS NOT NULL THEN
    PERFORM 1 FROM public.catalogo_materiales AS material WHERE material.id = p_material_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_total := round(p_monto_subtotal + p_monto_iva, 4);

  RETURN QUERY
  UPDATE public.compras AS compra
  SET
    proveedor_id = p_proveedor_id,
    orden_id = p_orden_id,
    monto_subtotal = round(p_monto_subtotal, 4),
    monto_iva = round(p_monto_iva, 4),
    monto_total = v_total,
    saldo_pendiente = v_total,
    moneda = upper(trim(p_moneda)),
    tipo_cambio = round(p_tipo_cambio, 4),
    fecha_vencimiento = p_fecha_vencimiento,
    notas = NULLIF(btrim(p_notas), ''),
    rubro_costo = v_rubro,
    concepto = NULLIF(btrim(p_concepto), ''),
    material_id = p_material_id,
    cantidad = p_cantidad,
    unidad = NULLIF(btrim(p_unidad), ''),
    costo_unitario = p_costo_unitario
  WHERE compra.id = p_compra_id
  RETURNING compra.id, compra.proveedor_id, compra.orden_id, compra.monto_subtotal,
    compra.monto_iva, compra.monto_total, compra.moneda, compra.tipo_cambio,
    compra.saldo_pendiente, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.actualizar_compra_borrador(
  uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid,
  text, text, uuid, numeric, text, numeric) IS
  'SII-B8 F4 + C10.1: edita una compra BORRADOR con compare-and-set; con Orden exige rubro_costo. Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_compra_borrador(
  uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid,
  text, text, uuid, numeric, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_compra_borrador(
  uuid, timestamptz, uuid, uuid, numeric, numeric, text, numeric, date, text, uuid,
  text, text, uuid, numeric, text, numeric)
  TO service_role;

-- 5. Clasificación manual de compras históricas (D11/F09): solo si aún no
--    tienen rubro, tienen Orden y no están canceladas. Sin default silencioso.
CREATE OR REPLACE FUNCTION public.asignar_rubro_costo_compra(
  p_compra_id uuid,
  p_rubro_costo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  rubro_costo text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_rubro text := NULLIF(lower(btrim(coalesce(p_rubro_costo, ''))), '');
BEGIN
  IF p_compra_id IS NULL OR p_actor_id IS NULL
     OR v_rubro NOT IN ('material', 'subcontratacion', 'gastos_directos')
     OR NOT privado.actor_con_permiso(p_actor_id, 'registrar_gastos') THEN
    RAISE EXCEPTION 'datos_compra_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_compra FROM public.compras AS compra
  WHERE compra.id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_compra.orden_id IS NULL THEN
    RAISE EXCEPTION 'compra_sin_orden' USING ERRCODE = 'check_violation';
  END IF;
  IF v_compra.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'compra_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_compra.rubro_costo IS NOT NULL THEN
    RAISE EXCEPTION 'rubro_ya_asignado' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.compras AS compra
  SET rubro_costo = v_rubro
  WHERE compra.id = p_compra_id
  RETURNING compra.id, compra.rubro_costo, compra.actualizado_en;
END;
$function$;

COMMENT ON FUNCTION public.asignar_rubro_costo_compra(uuid, text, uuid, uuid) IS
  'C10.1/F09: clasifica una compra histórica con Orden y sin rubro (material, subcontratacion o gastos_directos). No sobrescribe rubros ni cancela. Solo service_role.';

REVOKE ALL ON FUNCTION public.asignar_rubro_costo_compra(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_rubro_costo_compra(uuid, text, uuid, uuid)
  TO service_role;
