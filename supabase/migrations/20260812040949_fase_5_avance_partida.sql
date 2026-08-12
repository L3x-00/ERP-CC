-- =============================================================================
-- Migración: avance de partidas de Órdenes de Producción — Sub-fase 5.4.
--
-- El registro de piezas buenas y scrap de fabricación se concentra en una RPC
-- transaccional. Bloquea partida y OP para que una cancelación/completado no
-- pueda intercalarse con el avance registrado desde el piso.
-- =============================================================================

-- El consumo de material es una operación de piso: no puede ocurrir sobre una
-- OP fuera de proceso. La versión inicial validaba la partida y el stock, pero
-- no fijaba el estado de la OP bajo el mismo lock.
CREATE OR REPLACE FUNCTION public.registrar_consumo_material_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_material_partida_id uuid;
  v_stock numeric;
  v_costo numeric;
  v_total numeric := p_cantidad_usada + p_cantidad_scrap;
  v_movimiento_id uuid;
  v_consumo_id uuid;
BEGIN
  IF p_cantidad_usada IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0
     OR p_cantidad_scrap < 0
     OR v_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_consumo_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Mantiene el mismo orden de locks que tiempo y avance: partida → OP → material.
  SELECT partida.orden_id, partida.material_id
  INTO v_orden_id, v_material_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  IF v_material_partida_id IS NOT NULL AND v_material_partida_id <> p_material_id THEN
    RAISE EXCEPTION 'material_no_corresponde_partida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT material.stock_actual_control, material.costo_unitario_control
  INTO v_stock, v_costo
  FROM public.materiales AS material
  WHERE material.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_stock < v_total THEN
    RAISE EXCEPTION 'stock_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_movimiento_id := public.registrar_movimiento_inventario(
    p_material_id,
    'salida_produccion',
    'SAL',
    v_total,
    v_costo,
    NULL,
    v_orden_id,
    NULL,
    'CONSUMO-OP',
    'Consumo de partida ' || p_partida_id::text
  );

  INSERT INTO public.registros_consumo_material (
    partida_id,
    material_id,
    cantidad_usada,
    cantidad_scrap,
    costo_unitario_momento
  )
  VALUES (
    p_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap,
    v_costo
  )
  RETURNING registros_consumo_material.id INTO v_consumo_id;

  RETURN QUERY SELECT v_consumo_id, v_costo, v_total, v_movimiento_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_avance_partida_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_cantidad_producida numeric,
  p_cantidad_scrap numeric
)
RETURNS TABLE (
  partida_id uuid,
  cantidad_producida numeric,
  cantidad_scrap numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  IF p_cantidad_producida IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_producida < 0
     OR p_cantidad_scrap < 0
     OR (p_cantidad_producida + p_cantidad_scrap) <= 0 THEN
    RAISE EXCEPTION 'cantidad_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id
  INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET
    cantidad_producida = partida.cantidad_producida + p_cantidad_producida,
    cantidad_scrap = partida.cantidad_scrap + p_cantidad_scrap
  WHERE partida.id = p_partida_id
  RETURNING
    partida.id,
    partida.cantidad_producida,
    partida.cantidad_scrap,
    partida.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric) IS
  'Acumula producción y scrap con locks de partida y OP; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  TO service_role;
