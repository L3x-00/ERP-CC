-- =============================================================================
-- Verifica al operador de piso dentro de la misma transacción de consumo.
-- Conserva el orden de locks: partida → orden → operador → material.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_operador_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_operador_id uuid
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
  v_operador_asignado_id uuid;
BEGIN
  SELECT partida.orden_id, partida.operador_asignado_id
  INTO v_orden_id, v_operador_asignado_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
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
  SELECT *
  FROM public.registrar_consumo_material_op(
    p_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, uuid
) TO service_role;
