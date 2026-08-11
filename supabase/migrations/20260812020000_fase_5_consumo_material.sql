-- =============================================================================
-- Migración: consumo de materiales de Órdenes de Producción — Sub-fase 5.2.
--
-- El consumo de piso es una única transacción: bloquea el material, rechaza
-- stock insuficiente, genera kardex, descuenta inventario y deja el costo CPP
-- histórico asociado a la partida. Solo service_role puede invocarla.
-- =============================================================================

-- Cada registro representa cantidades en la unidad de control del material.
CREATE TABLE IF NOT EXISTS public.registros_consumo_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id uuid NOT NULL
    REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  material_id uuid NOT NULL
    REFERENCES public.materiales (id) ON DELETE RESTRICT,
  cantidad_usada numeric(14, 4) NOT NULL DEFAULT 0
    CHECK (cantidad_usada >= 0),
  cantidad_scrap numeric(14, 4) NOT NULL DEFAULT 0
    CHECK (cantidad_scrap >= 0),
  costo_unitario_momento numeric(14, 4) NOT NULL
    CHECK (costo_unitario_momento >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registros_consumo_material_cantidad_positiva
    CHECK ((cantidad_usada + cantidad_scrap) > 0)
);

-- Una salida de producción no representa una compra. La función de inventario
-- de la Fase 4 ya acepta este valor nulo, pero la columna conservaba la
-- restricción NOT NULL original, impidiendo registrar salidas legítimas.
ALTER TABLE public.movimientos_inventario
  ALTER COLUMN cantidad_compra DROP NOT NULL;

COMMENT ON TABLE public.registros_consumo_material IS
  'Consumo real y merma de material por partida de una OP; cantidades en unidad de control.';
COMMENT ON COLUMN public.registros_consumo_material.costo_unitario_momento IS
  'CPP por unidad de control capturado antes de descontar el material.';

CREATE INDEX IF NOT EXISTS idx_registros_consumo_material_partida
  ON public.registros_consumo_material (partida_id);
CREATE INDEX IF NOT EXISTS idx_registros_consumo_material_material
  ON public.registros_consumo_material (material_id);
CREATE INDEX IF NOT EXISTS idx_registros_consumo_material_creado
  ON public.registros_consumo_material (creado_en DESC);

-- -----------------------------------------------------------------------------
-- Registra consumo + scrap y su movimiento de inventario en la misma
-- transacción. El lock explícito conserva el costo leído y serializa todo
-- consumo concurrente del mismo material antes de delegar el kardex existente.
-- Las salidas no recalculan CPP: el costo promedio solo cambia con entradas.
-- -----------------------------------------------------------------------------
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

  SELECT partida.orden_id, partida.material_id
  INTO v_orden_id, v_material_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
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

  -- La función de inventario reutilizada conserva su propio lock, folio y
  -- kardex. Ya sostenemos el mismo lock, por lo que costo y stock no cambian
  -- entre este registro de consumo y la salida del kardex.
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

COMMENT ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric) IS
  'Registra consumo y merma con salida atómica de inventario y costo CPP histórico. Solo service_role.';

REVOKE ALL PRIVILEGES ON TABLE public.registros_consumo_material
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.registros_consumo_material TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.registros_consumo_material TO service_role;

ALTER TABLE public.registros_consumo_material ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registros_consumo_material_seleccionar
  ON public.registros_consumo_material;
CREATE POLICY registros_consumo_material_seleccionar
  ON public.registros_consumo_material FOR SELECT TO authenticated USING (true);

REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric)
  TO service_role;
