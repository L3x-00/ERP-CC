-- =============================================================================
-- C13.3 - Material puesto por el cliente.
--
-- La propuesta declara, por ítem, qué material aporta el cliente y cuánto.
-- Producción descuenta ese saldo al cerrar la sesión, sin tocar inventario
-- propio ni el costo de la orden. Si el consumo excede el saldo, el cierre se
-- bloquea y el operador pausa por falta de material.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.material_cliente_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_revision_id uuid NOT NULL
    REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  codigo_item text NOT NULL,
  material_id uuid NOT NULL
    REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  cantidad numeric(14, 4) NOT NULL CHECK (cantidad > 0),
  creado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (propuesta_revision_id, codigo_item, material_id)
);

COMMENT ON TABLE public.material_cliente_item IS
  'C13.3: material que aporta el cliente por ítem de la propuesta; no se costea ni toca inventario propio.';

CREATE INDEX IF NOT EXISTS idx_material_cliente_item_revision
  ON public.material_cliente_item (propuesta_revision_id);

CREATE TABLE IF NOT EXISTS public.consumos_material_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  cantidad_usada numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_usada >= 0),
  cantidad_scrap numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_scrap >= 0),
  sesion_id uuid REFERENCES public.sesiones_trabajo (id) ON DELETE SET NULL,
  registrado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumos_material_cliente_cantidad_positiva
    CHECK ((cantidad_usada + cantidad_scrap) > 0)
);

COMMENT ON TABLE public.consumos_material_cliente IS
  'C13.3: consumo real del material del cliente por partida; descuenta el saldo declarado, sin inventario ni costo.';

CREATE INDEX IF NOT EXISTS idx_consumos_material_cliente_partida
  ON public.consumos_material_cliente (partida_id, material_id);

ALTER TABLE public.material_cliente_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumos_material_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_cliente_item_seleccionar ON public.material_cliente_item;
CREATE POLICY material_cliente_item_seleccionar
  ON public.material_cliente_item FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_tiene_permiso('propuesta_editar_ruteo'))
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

DROP POLICY IF EXISTS consumos_material_cliente_seleccionar ON public.consumos_material_cliente;
CREATE POLICY consumos_material_cliente_seleccionar
  ON public.consumos_material_cliente FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

REVOKE ALL PRIVILEGES ON TABLE public.material_cliente_item FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.consumos_material_cliente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.material_cliente_item TO authenticated;
GRANT SELECT ON TABLE public.consumos_material_cliente TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.material_cliente_item TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.consumos_material_cliente TO service_role;

-- -----------------------------------------------------------------------------
-- Propuesta: reemplaza el material del cliente declarado para un ítem DRAFT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reemplazar_material_cliente_item(
  p_revision_id uuid,
  p_codigo_item text,
  p_materiales jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_item record;
  v_total integer := 0;
BEGIN
  IF p_revision_id IS NULL OR p_actor_id IS NULL
     OR nullif(btrim(coalesce(p_codigo_item, '')), '') IS NULL THEN
    RAISE EXCEPTION 'material_cliente_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'propuesta_editar_ruteo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS revision
  WHERE revision.id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.material_cliente_item AS material
  WHERE material.propuesta_revision_id = p_revision_id
    AND material.codigo_item = btrim(p_codigo_item);

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(coalesce(p_materiales, '[]'::jsonb))
      AS fila(material_id uuid, cantidad numeric)
  LOOP
    IF v_item.material_id IS NULL OR v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'material_cliente_invalido' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.material_cliente_item (
      propuesta_revision_id, codigo_item, material_id, cantidad, creado_por
    ) VALUES (
      p_revision_id, btrim(p_codigo_item), v_item.material_id, v_item.cantidad, p_actor_id
    );
    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object('codigo_item', btrim(p_codigo_item), 'materiales', v_total);
END;
$$;

COMMENT ON FUNCTION public.reemplazar_material_cliente_item(uuid, text, jsonb, uuid) IS
  'C13.3: reemplaza el material del cliente por ítem en una revisión DRAFT. Solo service_role.';

-- -----------------------------------------------------------------------------
-- Propuesta: lectura del material del cliente declarado en una revisión.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_material_cliente_revision(
  p_revision_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  codigo_item text,
  material_id uuid,
  material_codigo text,
  material_nombre text,
  unidad_base text,
  cantidad numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_revision_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'material_cliente_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'propuesta_editar_ruteo')
    OR privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT material.id, material.codigo_item, material.material_id,
    catalogo.codigo, catalogo.nombre, catalogo.unidad_base, material.cantidad
  FROM public.material_cliente_item AS material
  JOIN public.catalogo_materiales AS catalogo ON catalogo.id = material.material_id
  WHERE material.propuesta_revision_id = p_revision_id
  ORDER BY material.codigo_item, catalogo.codigo;
END;
$$;

COMMENT ON FUNCTION public.obtener_material_cliente_revision(uuid, uuid) IS
  'C13.3: material del cliente declarado por ítem en una revisión. Solo service_role.';

-- -----------------------------------------------------------------------------
-- Producción: registra el consumo real del material del cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_consumo_material_cliente(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_declarado numeric;
  v_consumido numeric;
  v_consumo_id uuid;
BEGIN
  IF p_sesion_id IS NULL OR p_material_id IS NULL OR p_actor_id IS NULL
     OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'consumo_material_cliente_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;
  IF v_sesion.estado_sesion <> 'activa'
     AND (v_sesion.estado_sesion <> 'finalizada'
          OR v_sesion.fecha_fin IS NULL
          OR v_sesion.fecha_fin < now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id;
  SELECT * INTO v_partida FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_sesion.partida_id;

  IF v_orden.propuesta_revision_id IS NULL THEN
    RAISE EXCEPTION 'material_cliente_no_declarado' USING ERRCODE = '23514';
  END IF;

  SELECT material.cantidad INTO v_declarado
  FROM public.material_cliente_item AS material
  WHERE material.propuesta_revision_id = v_orden.propuesta_revision_id
    AND material.codigo_item = v_partida.codigo_pieza
    AND material.material_id = p_material_id;
  IF v_declarado IS NULL THEN
    RAISE EXCEPTION 'material_cliente_no_declarado' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(consumo.cantidad_usada + consumo.cantidad_scrap), 0)
  INTO v_consumido
  FROM public.consumos_material_cliente AS consumo
  WHERE consumo.partida_id = v_sesion.partida_id
    AND consumo.material_id = p_material_id;

  IF v_consumido + v_total > v_declarado THEN
    RAISE EXCEPTION 'material_cliente_insuficiente' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.consumos_material_cliente (
    orden_id, partida_id, material_id, cantidad_usada, cantidad_scrap,
    sesion_id, registrado_por
  ) VALUES (
    v_sesion.orden_id, v_sesion.partida_id, p_material_id,
    p_cantidad_usada, p_cantidad_scrap, v_sesion.id, p_actor_id
  )
  RETURNING consumos_material_cliente.id INTO v_consumo_id;

  RETURN QUERY
  SELECT consumo.id, consumo.orden_id, consumo.partida_id, consumo.material_id,
    consumo.cantidad_usada, consumo.cantidad_scrap,
    v_declarado, v_consumido + v_total, v_declarado - (v_consumido + v_total)
  FROM public.consumos_material_cliente AS consumo
  WHERE consumo.id = v_consumo_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid) IS
  'C13.3: descuenta el material del cliente sin tocar inventario ni costo; bloquea el exceso de saldo.';

-- -----------------------------------------------------------------------------
-- Producción/administración: saldo de material del cliente por partida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_material_cliente_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  codigo_pieza text,
  material_id uuid,
  material_codigo text,
  material_nombre text,
  unidad_base text,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'material_cliente_invalido' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS usuario
    WHERE usuario.id = p_actor_id AND usuario.activo = true
  ) AND NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_material_cliente' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
  IF NOT FOUND OR v_orden.propuesta_revision_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT partida.id, partida.codigo_pieza, material.material_id,
    catalogo.codigo, catalogo.nombre, catalogo.unidad_base,
    material.cantidad,
    coalesce((
      SELECT sum(consumo.cantidad_usada + consumo.cantidad_scrap)
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.partida_id = partida.id AND consumo.material_id = material.material_id
    ), 0),
    material.cantidad - coalesce((
      SELECT sum(consumo.cantidad_usada + consumo.cantidad_scrap)
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.partida_id = partida.id AND consumo.material_id = material.material_id
    ), 0)
  FROM public.partidas_orden_produccion AS partida
  JOIN public.material_cliente_item AS material
    ON material.propuesta_revision_id = v_orden.propuesta_revision_id
   AND material.codigo_item = partida.codigo_pieza
  JOIN public.catalogo_materiales AS catalogo ON catalogo.id = material.material_id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.codigo_pieza, catalogo.codigo;
END;
$$;

COMMENT ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid) IS
  'C13.3: material del cliente declarado, consumido y saldo por partida de la orden. Solo service_role.';

REVOKE ALL ON FUNCTION public.reemplazar_material_cliente_item(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_material_cliente_revision(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_material_cliente_item(uuid, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_material_cliente_revision(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid) TO service_role;
