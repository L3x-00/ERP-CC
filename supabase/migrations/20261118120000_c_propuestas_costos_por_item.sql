-- Costeo interno por ítem en propuestas (B4).
-- Aplicar solo localmente; el remoto lo controla el PO. Debe aplicarse ANTES de
-- desplegar la UI que llama a las RPC nuevas.
--
-- La tabla `propuesta_revision_costos` tenía UNIQUE (revision_id, categoria),
-- lo que impedía guardar más de un costeo. Se añade `item_id` y se cambia la
-- unicidad a (revision_id, item_id, categoria). Un "costeo" es el par de filas
-- Material + Otros de un mismo ítem. Las filas antiguas quedan con item_id NULL
-- y siguen alimentando los agregados existentes.

ALTER TABLE public.propuesta_revision_costos
  ADD COLUMN IF NOT EXISTS item_id uuid
  REFERENCES public.propuesta_items (id) ON DELETE CASCADE;

ALTER TABLE public.propuesta_revision_costos
  ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.propuesta_revision_costos
  DROP CONSTRAINT IF EXISTS propuesta_revision_costos_revision_categoria_unica;

ALTER TABLE public.propuesta_revision_costos
  DROP CONSTRAINT IF EXISTS propuesta_revision_costos_revision_item_categoria_unica;

ALTER TABLE public.propuesta_revision_costos
  ADD CONSTRAINT propuesta_revision_costos_revision_item_categoria_unica
  UNIQUE (revision_id, item_id, categoria);

CREATE INDEX IF NOT EXISTS ix_propuesta_revision_costos_revision_item
  ON public.propuesta_revision_costos (revision_id, item_id);

COMMENT ON TABLE public.propuesta_revision_costos IS
  'SII-B4: costeo interno por revisión e ítem (categoría material, máquina, mano de obra, gastos directos, subcontratación).';

-- El trigger de congelamiento deducía la revisión desde item_id en toda tabla
-- hija. Con item_id nullable en costos, las filas legacy saltarían el control:
-- para esta tabla se toma revision_id directamente.
CREATE OR REPLACE FUNCTION privado.proteger_hijo_revision_propuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision_id uuid;
  v_item_id uuid;
  v_estado text;
BEGIN
  IF privado.b4_rpc_autorizada() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
  END IF;

  IF TG_TABLE_NAME = 'propuesta_items' THEN
    v_revision_id := CASE WHEN TG_OP = 'DELETE' THEN old.revision_id ELSE new.revision_id END;
  ELSIF TG_TABLE_NAME = 'propuesta_revision_costos' THEN
    v_revision_id := CASE WHEN TG_OP = 'DELETE' THEN old.revision_id ELSE new.revision_id END;
  ELSE
    v_item_id := CASE WHEN TG_OP = 'DELETE' THEN old.item_id ELSE new.item_id END;
    SELECT i.revision_id INTO v_revision_id
    FROM public.propuesta_items AS i WHERE i.id = v_item_id;
  END IF;

  IF v_revision_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
  END IF;

  SELECT r.estado INTO v_estado
  FROM public.propuesta_revisiones AS r WHERE r.id = v_revision_id;

  IF v_estado IS NOT NULL AND v_estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_congelada' USING ERRCODE = '23514', DETAIL = v_estado;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
END;
$$;

-- La RPC antigua sigue siendo la ruta de compatibilidad (filas sin ítem).
-- Su DELETE debe limitarse a esas filas para no borrar los costeos por ítem.
CREATE OR REPLACE FUNCTION public.editar_costos_revision(
  p_revision_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_esperado timestamptz;
  v_costo jsonb;
  v_categoria text;
  v_monto numeric;
  v_nota text;
  v_total numeric := 0;
  v_creados integer := 0;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_costo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR jsonb_typeof(p_datos->'costos') <> 'array' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  FOR v_costo IN SELECT e.value FROM jsonb_array_elements(p_datos->'costos') AS e(value) LOOP
    IF jsonb_typeof(v_costo) <> 'object' THEN
      RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'costos';
    END IF;
    v_categoria := privado.json_texto(v_costo, 'categoria');
    IF v_categoria NOT IN ('material','maquina','mano_obra','gastos_directos','subcontratacion') THEN
      RAISE EXCEPTION 'costo_categoria_invalida' USING ERRCODE = '22023';
    END IF;
    v_monto := privado.json_numero(v_costo, 'monto');
    IF v_monto IS NULL OR v_monto < 0 OR v_monto > 1000000000 THEN
      RAISE EXCEPTION 'costo_monto_invalido' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.propuesta_revision_costos
  WHERE revision_id = p_revision_id AND item_id IS NULL;

  FOR v_costo IN SELECT e.value FROM jsonb_array_elements(p_datos->'costos') AS e(value) LOOP
    v_categoria := privado.json_texto(v_costo, 'categoria');
    v_monto := privado.json_numero(v_costo, 'monto');
    v_nota := NULLIF(btrim(COALESCE(privado.json_texto(v_costo, 'nota'), '')), '');
    INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto, nota)
    VALUES (p_revision_id, v_categoria, v_monto, v_nota);
    v_creados := v_creados + 1;
  END LOOP;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_costeo = false,
      actualizado_en = now()
  WHERE id = p_revision_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
  FROM public.propuesta_revision_costos WHERE revision_id = p_revision_id;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'categorias', v_creados,
    'costoTotal', round(v_total, 4)
  );
END;
$$;

-- Guarda (o actualiza) el costeo de un ítem: las filas Material y Otros van
-- juntas en una sola transacción y con un solo CAS. p_item_id NULL => costeo
-- general heredado.
CREATE OR REPLACE FUNCTION public.guardar_costo_revision(
  p_revision_id uuid,
  p_item_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_esperado timestamptz;
  v_costo jsonb;
  v_categoria text;
  v_monto numeric;
  v_nota text;
  v_total numeric;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_costo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR jsonb_typeof(p_datos->'costos') <> 'array' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  IF p_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.propuesta_items AS i
    WHERE i.id = p_item_id AND i.revision_id = p_revision_id
  ) THEN
    RAISE EXCEPTION 'costo_item_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  FOR v_costo IN SELECT e.value FROM jsonb_array_elements(p_datos->'costos') AS e(value) LOOP
    IF jsonb_typeof(v_costo) <> 'object' THEN
      RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'costos';
    END IF;
    v_categoria := privado.json_texto(v_costo, 'categoria');
    IF v_categoria NOT IN ('material','maquina','mano_obra','gastos_directos','subcontratacion') THEN
      RAISE EXCEPTION 'costo_categoria_invalida' USING ERRCODE = '22023';
    END IF;
    v_monto := privado.json_numero(v_costo, 'monto');
    IF v_monto IS NULL OR v_monto < 0 OR v_monto > 1000000000 THEN
      RAISE EXCEPTION 'costo_monto_invalido' USING ERRCODE = '22023';
    END IF;
    v_nota := NULLIF(btrim(COALESCE(privado.json_texto(v_costo, 'nota'), '')), '');

    IF p_item_id IS NULL THEN
      UPDATE public.propuesta_revision_costos
      SET monto = v_monto, nota = v_nota
      WHERE revision_id = p_revision_id AND item_id IS NULL AND categoria = v_categoria;
      IF NOT FOUND THEN
        INSERT INTO public.propuesta_revision_costos (revision_id, item_id, categoria, monto, nota)
        VALUES (p_revision_id, NULL, v_categoria, v_monto, v_nota);
      END IF;
    ELSE
      INSERT INTO public.propuesta_revision_costos (revision_id, item_id, categoria, monto, nota)
      VALUES (p_revision_id, p_item_id, v_categoria, v_monto, v_nota)
      ON CONFLICT (revision_id, item_id, categoria)
      DO UPDATE SET monto = EXCLUDED.monto, nota = EXCLUDED.nota;
    END IF;
  END LOOP;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_costeo = false,
      actualizado_en = now()
  WHERE id = p_revision_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
  FROM public.propuesta_revision_costos WHERE revision_id = p_revision_id;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'itemId', p_item_id,
    'costoTotal', round(v_total, 4)
  );
END;
$$;

-- Borra el costeo completo de un ítem (todas sus categorías).
CREATE OR REPLACE FUNCTION public.eliminar_costo_revision(
  p_revision_id uuid,
  p_item_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_esperado timestamptz;
  v_total numeric;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_costo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;
  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  IF p_item_id IS NULL THEN
    DELETE FROM public.propuesta_revision_costos
    WHERE revision_id = p_revision_id AND item_id IS NULL;
  ELSE
    DELETE FROM public.propuesta_revision_costos
    WHERE revision_id = p_revision_id AND item_id = p_item_id;
  END IF;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_costeo = false,
      actualizado_en = now()
  WHERE id = p_revision_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
  FROM public.propuesta_revision_costos WHERE revision_id = p_revision_id;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'itemId', p_item_id,
    'costoTotal', round(v_total, 4)
  );
END;
$$;

COMMENT ON FUNCTION public.guardar_costo_revision(uuid, uuid, jsonb, uuid, uuid) IS
  'SII-B4: alta o edición del costeo interno de un ítem en revisión DRAFT. Solo service_role.';
COMMENT ON FUNCTION public.eliminar_costo_revision(uuid, uuid, jsonb, uuid, uuid) IS
  'SII-B4: borrado del costeo interno de un ítem en revisión DRAFT. Solo service_role.';

REVOKE ALL ON FUNCTION public.guardar_costo_revision(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_costo_revision(uuid, uuid, jsonb, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.eliminar_costo_revision(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_costo_revision(uuid, uuid, jsonb, uuid, uuid) TO service_role;
