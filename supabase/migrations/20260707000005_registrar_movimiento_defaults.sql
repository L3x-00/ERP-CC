-- =============================================================================
-- Migración: reordenar `registrar_movimiento_inventario` con parámetros opcionales.
-- Sub-fase 4.2 (ORCA MFG ERP). Idempotente.
--
-- La firma de 000004 declaraba los 10 parámetros como requeridos; los tipos
-- generados de Supabase los marcan no-nulos, impidiendo pasar NULL para los
-- campos opcionales (una salida no tiene cantidad_compra; hay movimientos sin
-- orden/operador). Se recrea la función con los parámetros nulos al final y
-- DEFAULT NULL, de modo que en TS quedan opcionales (se omiten en lugar de NULL).
-- La lógica del cuerpo es idéntica a 000004.
-- =============================================================================

-- La firma cambia (orden/defaults), así que CREATE OR REPLACE no basta: se
-- elimina la versión previa y se crea la nueva. DROP idempotente.
DROP FUNCTION IF EXISTS public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
  p_material_id uuid,
  p_tipo text,
  p_prefijo_folio text,
  p_cantidad_control numeric,
  p_costo_unitario_momento numeric,
  p_cantidad_compra numeric DEFAULT NULL,
  p_orden_id uuid DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL,
  p_referencia_externa text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_costo numeric;
  v_delta numeric;
  v_nuevo_stock numeric;
  v_nuevo_costo numeric;
  v_folio text;
  v_id uuid;
BEGIN
  IF p_cantidad_control IS NULL OR p_cantidad_control <= 0 THEN
    RAISE EXCEPTION 'cantidad_invalida';
  END IF;
  IF p_costo_unitario_momento IS NULL OR p_costo_unitario_momento < 0 THEN
    RAISE EXCEPTION 'costo_invalido';
  END IF;

  -- Lock de la fila del material: serializa concurrencia del mismo material.
  SELECT stock_actual_control, costo_unitario_control
    INTO v_stock, v_costo
    FROM public.materiales
    WHERE id = p_material_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente';
  END IF;

  IF p_tipo IN ('entrada_compra', 'devolucion') THEN
    v_delta := p_cantidad_control;
  ELSIF p_tipo = 'salida_produccion' THEN
    v_delta := -p_cantidad_control;
  ELSIF p_tipo = 'ajuste_inventario' THEN
    v_delta := p_cantidad_control;
  ELSE
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  v_nuevo_stock := v_stock + v_delta;
  IF v_nuevo_stock < 0 THEN
    RAISE EXCEPTION 'stock_insuficiente';
  END IF;

  IF p_tipo = 'entrada_compra' AND (v_stock + p_cantidad_control) > 0 THEN
    v_nuevo_costo := ((v_stock * v_costo) + (p_cantidad_control * p_costo_unitario_momento))
                     / (v_stock + p_cantidad_control);
  ELSE
    v_nuevo_costo := v_costo;
  END IF;

  v_folio := public.generar_folio_inventario(p_prefijo_folio);

  INSERT INTO public.movimientos_inventario (
    folio, material_id, tipo_movimiento, cantidad_compra, cantidad_control,
    costo_unitario_momento, orden_id, operador_id, referencia_externa, notas
  ) VALUES (
    v_folio, p_material_id, p_tipo, p_cantidad_compra, p_cantidad_control,
    p_costo_unitario_momento, p_orden_id, p_operador_id, p_referencia_externa, p_notas
  )
  RETURNING id INTO v_id;

  UPDATE public.materiales
     SET stock_actual_control = v_nuevo_stock,
         costo_unitario_control = v_nuevo_costo
     WHERE id = p_material_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_movimiento_inventario IS
  'Registra un movimiento de inventario de forma atómica (lock del material, prohíbe stock negativo, recalcula CPP en entradas, genera folio e inserta kardex). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) TO service_role;
