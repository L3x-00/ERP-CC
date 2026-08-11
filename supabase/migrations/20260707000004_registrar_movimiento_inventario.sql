-- =============================================================================
-- Migración: función atómica de movimientos de inventario — Sub-fase 4.2.
-- ORCA MFG ERP. Idempotente.
--
-- Un movimiento toca varias filas (genera folio, inserta en el kardex y ajusta
-- stock/costo del material). supabase-js NO envuelve múltiples statements en una
-- transacción, así que la atomicidad vive aquí: una función que bloquea la fila
-- del material (FOR UPDATE) para serializar movimientos concurrentes del mismo
-- material y garantizar que:
--   - nunca queda stock negativo (regla de negocio),
--   - el CPP se recalcula sobre el stock/costo REALES bajo lock (sin carrera),
--   - folio + kardex + stock cambian juntos o no cambian.
-- SECURITY DEFINER + EXECUTE revocado de PUBLIC/anon/authenticated: solo la
-- Server Action (cliente service_role) la invoca por RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
  p_material_id uuid,
  p_tipo text,
  p_prefijo_folio text,
  p_cantidad_compra numeric,
  p_cantidad_control numeric,
  p_costo_unitario_momento numeric,
  p_orden_id uuid,
  p_operador_id uuid,
  p_referencia_externa text,
  p_notas text
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

  -- Signo del movimiento sobre el stock (en unidad de control).
  IF p_tipo IN ('entrada_compra', 'devolucion') THEN
    v_delta := p_cantidad_control;
  ELSIF p_tipo = 'salida_produccion' THEN
    v_delta := -p_cantidad_control;
  ELSIF p_tipo = 'ajuste_inventario' THEN
    v_delta := p_cantidad_control; -- el llamador pasa el delta con su signo
  ELSE
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  v_nuevo_stock := v_stock + v_delta;
  IF v_nuevo_stock < 0 THEN
    -- Regla de negocio: prohibido stock negativo.
    RAISE EXCEPTION 'stock_insuficiente';
  END IF;

  -- Costo Promedio Ponderado: solo al ENTRAR mercancía comprada.
  IF p_tipo = 'entrada_compra' AND (v_stock + p_cantidad_control) > 0 THEN
    v_nuevo_costo := ((v_stock * v_costo) + (p_cantidad_control * p_costo_unitario_momento))
                     / (v_stock + p_cantidad_control);
  ELSE
    v_nuevo_costo := v_costo;
  END IF;

  -- Folio atómico dentro de la misma transacción.
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
  'Registra un movimiento de inventario de forma atómica (lock del material, no permite stock negativo, recalcula CPP en entradas, genera folio e inserta kardex). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) TO service_role;
