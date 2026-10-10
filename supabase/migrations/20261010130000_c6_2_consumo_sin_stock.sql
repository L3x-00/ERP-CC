-- C6.2 / DC-12 y DC-14 — consumo económico sin operación de inventario.
--
-- El consumo nuevo referencia el catálogo canónico, congela su costo en moneda
-- original y MXN, y no crea movimientos, reservas ni cambios de existencia.
-- Los registros anteriores conservan sus FK y semántica bajo origen LEGADO.

ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS catalogo_material_id uuid
    REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT;

UPDATE public.partidas_orden_produccion AS partida
SET catalogo_material_id = item.material_id
FROM public.propuesta_items AS item
WHERE partida.catalogo_material_id IS NULL
  AND partida.propuesta_item_id = item.id
  AND item.material_id IS NOT NULL;

UPDATE public.partidas_orden_produccion AS partida
SET catalogo_material_id = catalogo.id
FROM public.catalogo_materiales AS catalogo
WHERE partida.catalogo_material_id IS NULL
  AND partida.material_id IS NOT NULL
  AND catalogo.material_legacy_id = partida.material_id;

CREATE INDEX IF NOT EXISTS idx_partidas_orden_catalogo_material
  ON public.partidas_orden_produccion (catalogo_material_id);

CREATE OR REPLACE FUNCTION privado.asignar_catalogo_material_partida_c6()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.propuesta_item_id IS NOT NULL THEN
    SELECT item.material_id INTO NEW.catalogo_material_id
    FROM public.propuesta_items AS item
    WHERE item.id = NEW.propuesta_item_id;
  ELSIF NEW.catalogo_material_id IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT catalogo.id INTO NEW.catalogo_material_id
    FROM public.catalogo_materiales AS catalogo
    WHERE catalogo.material_legacy_id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.asignar_catalogo_material_partida_c6() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_partida_asignar_catalogo_material_c6 ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_partida_asignar_catalogo_material_c6
  BEFORE INSERT OR UPDATE OF propuesta_item_id, material_id ON public.partidas_orden_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.asignar_catalogo_material_partida_c6();

-- C4.2: el material canónico forma parte del alcance comercial congelado.
CREATE OR REPLACE FUNCTION privado.proteger_partida_comercial_c4_2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid := coalesce(NEW.orden_id, OLD.orden_id);
  v_es_comercial boolean;
  v_snapshot_final boolean;
BEGIN
  SELECT orden.propuesta_revision_id IS NOT NULL,
         orden.snapshot_json <> '{}'::jsonb
  INTO v_es_comercial, v_snapshot_final
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id;

  IF NOT coalesce(v_es_comercial, false) OR NOT coalesce(v_snapshot_final, false) THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'alcance_comercial_inmutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.orden_id IS DISTINCT FROM NEW.orden_id
     OR OLD.codigo_pieza IS DISTINCT FROM NEW.codigo_pieza
     OR OLD.codigo_item IS DISTINCT FROM NEW.codigo_item
     OR OLD.propuesta_item_id IS DISTINCT FROM NEW.propuesta_item_id
     OR OLD.descripcion IS DISTINCT FROM NEW.descripcion
     OR OLD.cantidad_solicitada IS DISTINCT FROM NEW.cantidad_solicitada
     OR OLD.unidad_medida IS DISTINCT FROM NEW.unidad_medida
     OR OLD.material_id IS DISTINCT FROM NEW.material_id
     OR OLD.catalogo_material_id IS DISTINCT FROM NEW.catalogo_material_id
     OR OLD.area_trabajo_codigo IS DISTINCT FROM NEW.area_trabajo_codigo
     OR OLD.procesos IS DISTINCT FROM NEW.procesos
     OR OLD.tiempo_estimado_minutos IS DISTINCT FROM NEW.tiempo_estimado_minutos THEN
    RAISE EXCEPTION 'alcance_comercial_inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.registros_consumo_material
  ALTER COLUMN material_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS catalogo_material_id uuid
    REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS unidad_base text,
  ADD COLUMN IF NOT EXISTS costo_unitario_origen numeric(14, 4),
  ADD COLUMN IF NOT EXISTS moneda_costo text,
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(14, 4),
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'LEGADO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registros_consumo_origen_valido') THEN
    ALTER TABLE public.registros_consumo_material
      ADD CONSTRAINT registros_consumo_origen_valido CHECK (origen IN ('LEGADO', 'NUEVO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registros_consumo_snapshot_c6_completo') THEN
    ALTER TABLE public.registros_consumo_material
      ADD CONSTRAINT registros_consumo_snapshot_c6_completo CHECK (
        (origen = 'LEGADO' AND material_id IS NOT NULL)
        OR
        (origen = 'NUEVO'
          AND material_id IS NULL
          AND catalogo_material_id IS NOT NULL
          AND unidad_base IS NOT NULL AND unidad_base = btrim(unidad_base)
          AND costo_unitario_origen IS NOT NULL AND costo_unitario_origen >= 0
          AND moneda_costo IN ('MXN', 'USD')
          AND tipo_cambio IS NOT NULL AND tipo_cambio > 0
          AND (moneda_costo <> 'MXN' OR tipo_cambio = 1)
          AND actor_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_registros_consumo_catalogo_material
  ON public.registros_consumo_material (catalogo_material_id);

COMMENT ON COLUMN public.registros_consumo_material.costo_unitario_momento IS
  'Costo unitario congelado en MXN. Para origen NUEVO equivale a costo_unitario_origen × tipo_cambio.';
COMMENT ON COLUMN public.registros_consumo_material.costo_unitario_origen IS
  'Costo unitario confirmado en la moneda original al momento del consumo.';
COMMENT ON COLUMN public.registros_consumo_material.origen IS
  'LEGADO conserva consumos históricos con kardex; NUEVO nunca modifica existencias.';

CREATE OR REPLACE FUNCTION privado.registrar_consumo_material_c6(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid
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
  v_material_partida_id uuid;
  v_material public.catalogo_materiales%ROWTYPE;
  v_total numeric := p_cantidad_usada + p_cantidad_scrap;
  v_tipo_cambio numeric;
  v_costo_mxn numeric;
  v_consumo_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_consumo_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT partida.catalogo_material_id INTO v_material_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_material_partida_id IS NOT NULL AND v_material_partida_id <> p_material_id THEN
    RAISE EXCEPTION 'material_no_corresponde_partida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_material
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id AND material.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente_o_inactivo' USING ERRCODE = 'P0002';
  END IF;
  IF v_material.costo_vigente IS NULL OR v_material.fecha_vigencia_costo IS NULL THEN
    RAISE EXCEPTION 'costo_material_no_configurado' USING ERRCODE = '23514';
  END IF;

  IF v_material.moneda_costo = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSE
    SELECT configuracion.tipo_cambio_usd INTO v_tipo_cambio
    FROM public.configuracion_sistema AS configuracion
    LIMIT 1;
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'tipo_cambio_no_configurado' USING ERRCODE = '23514';
    END IF;
  END IF;
  v_costo_mxn := round(v_material.costo_vigente * v_tipo_cambio, 4);

  INSERT INTO public.registros_consumo_material (
    partida_id, material_id, catalogo_material_id, cantidad_usada, cantidad_scrap,
    unidad_base, costo_unitario_origen, moneda_costo, tipo_cambio,
    costo_unitario_momento, actor_id, origen
  ) VALUES (
    p_partida_id, NULL, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    v_material.unidad_base, v_material.costo_vigente, v_material.moneda_costo,
    v_tipo_cambio, v_costo_mxn, p_actor_id, 'NUEVO'
  ) RETURNING registros_consumo_material.id INTO v_consumo_id;

  RETURN QUERY SELECT v_consumo_id, v_costo_mxn, v_total, NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION privado.registrar_consumo_material_c6(uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid
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
BEGIN
  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM privado.registrar_consumo_material_c6(
    p_partida_id, p_material_id, p_cantidad_usada, p_cantidad_scrap, p_actor_id
  );
END;
$$;

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
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id AND orden.estado = 'en_proceso' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.rol = 'operador' AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = '23514';
  END IF;
  RETURN QUERY SELECT * FROM privado.registrar_consumo_material_c6(
    p_partida_id, p_material_id, p_cantidad_usada, p_cantidad_scrap, p_operador_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.registrar_consumo_material_op(uuid, uuid, numeric, numeric);

REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_op(uuid, uuid, numeric, numeric, uuid)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(uuid, uuid, numeric, numeric, uuid)
  TO service_role;

-- Las cantidades siguen visibles según RLS; el snapshot financiero solo sale
-- por servicios de servidor autorizados.
REVOKE SELECT ON TABLE public.registros_consumo_material FROM authenticated;
GRANT SELECT (
  id, partida_id, material_id, catalogo_material_id, cantidad_usada,
  cantidad_scrap, unidad_base, actor_id, origen, creado_en
) ON public.registros_consumo_material TO authenticated;
