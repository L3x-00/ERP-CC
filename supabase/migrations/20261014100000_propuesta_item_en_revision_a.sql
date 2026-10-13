-- =============================================================================
-- Obs. cliente 2026-10-13 (DC-08) — Ítems nuevos también en la revisión A
--
-- DC-08 permite ítems nuevos "en una revisión de Propuesta"; C3.1 los limitó a
-- B..Z por prudencia y la revisión A solo heredaba los del RFQ. El PO pidió
-- poder agregar ítems directamente en la ficha de la propuesta desde Rev A.
--
-- Único cambio: se retira la guarda `item_nuevo_solo_revision` de
-- `agregar_item_propuesta`. Todo lo demás se conserva igual a C3.1: borrador,
-- permisos, ITxx consecutivo bajo lock de propuesta que nunca se reutiliza,
-- `revision_origen_id` = la revisión donde nace (la A), sin tocar el RFQ.
--
-- Aditiva e idempotente (CREATE OR REPLACE). Aplicar antes o junto con el
-- despliegue del código que muestra «Agregar ítem» en la revisión A.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agregar_item_propuesta(
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
  v_item public.propuesta_items%ROWTYPE;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_material_id uuid;
  v_espesor_id uuid;
  v_acabado text;
  v_notas text;
  v_es_descuento boolean;
  v_numero integer;
  v_codigo text;
  v_material public.catalogo_materiales%ROWTYPE;
BEGIN
  IF p_actor IS NULL
     OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_articulo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_datos ? 'precio_unitario'
     AND NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_precio') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501', DETAIL = 'precio';
  END IF;

  -- Descubrir la propuesta y serializar el contador ITxx con un lock lógico.
  -- No se bloquea la fila `propuestas`: las RPC históricas bloquean primero la
  -- revisión y después actualizan propuesta, por lo que invertir ese orden aquí
  -- abriría una ventana de deadlock con Validar/Aceptar.
  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_revision.propuesta_id::text, 0));

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514',
      DETAIL = v_revision.estado;
  END IF;

  v_descripcion := btrim(COALESCE(privado.json_texto(p_datos, 'descripcion'), ''));
  IF char_length(v_descripcion) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'item_descripcion_invalida' USING ERRCODE = '22023';
  END IF;

  v_cantidad := privado.json_numero(p_datos, 'cantidad');
  IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 1000000000
     OR v_cantidad <> round(v_cantidad, 2) THEN
    RAISE EXCEPTION 'item_cantidad_invalida' USING ERRCODE = '22023';
  END IF;

  v_precio := COALESCE(privado.json_numero(p_datos, 'precio_unitario'), 0);
  IF v_precio < 0 OR v_precio > 1000000000 THEN
    RAISE EXCEPTION 'item_precio_invalido' USING ERRCODE = '22023';
  END IF;

  v_material_id := privado.json_uuid(p_datos, 'material_id');
  v_espesor_id := privado.json_uuid(p_datos, 'espesor_id');
  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_material
    FROM public.catalogo_materiales AS m
    WHERE m.id = v_material_id;
    IF NOT FOUND OR NOT v_material.activo THEN
      RAISE EXCEPTION 'material_invalido' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.material_id = v_material_id AND e.activo
    ) AND v_espesor_id IS NULL THEN
      RAISE EXCEPTION 'espesor_requerido' USING ERRCODE = '22023';
    END IF;
    IF v_espesor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.id = v_espesor_id
        AND e.material_id = v_material_id
        AND e.activo
    ) THEN
      RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_espesor_id IS NOT NULL THEN
    RAISE EXCEPTION 'espesor_sin_material' USING ERRCODE = '22023';
  END IF;

  v_acabado := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'acabado'), '')), '');
  IF v_acabado IS NOT NULL AND char_length(v_acabado) > 120 THEN
    RAISE EXCEPTION 'item_acabado_invalido' USING ERRCODE = '22023';
  END IF;
  v_notas := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'notas'), '')), '');
  IF v_notas IS NOT NULL AND char_length(v_notas) > 2000 THEN
    RAISE EXCEPTION 'item_notas_invalidas' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'es_descuento'
     AND jsonb_typeof(p_datos->'es_descuento') <> 'boolean' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023',
      DETAIL = 'es_descuento';
  END IF;
  v_es_descuento := COALESCE((p_datos->>'es_descuento')::boolean, false);

  -- La propuesta está bloqueada: dos altas concurrentes observan códigos
  -- distintos y ningún ITxx inactivo se reutiliza.
  SELECT COALESCE(max((substring(i.codigo FROM 3))::integer), 0) + 1
  INTO v_numero
  FROM public.propuesta_items AS i
  JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
  WHERE r.propuesta_id = v_revision.propuesta_id;
  v_codigo := 'IT' || lpad(v_numero::text, 2, '0');

  PERFORM set_config('sii.b4_rpc', 'on', true);

  INSERT INTO public.propuesta_items (
    revision_id, revision_origen_id, rfq_item_id, codigo, descripcion,
    cantidad, material_id, espesor_id, acabado, notas, precio_unitario,
    es_descuento, activo
  ) VALUES (
    v_revision.id, v_revision.id, NULL, v_codigo, v_descripcion,
    v_cantidad, v_material_id, v_espesor_id, v_acabado, v_notas, v_precio,
    v_es_descuento, true
  )
  RETURNING * INTO v_item;

  UPDATE public.propuesta_revisiones AS revision
  SET requiere_revision_costeo = revision.requiere_revision_costeo OR EXISTS (
        SELECT 1
        FROM public.propuesta_revision_costos AS costo
        WHERE costo.revision_id = revision.id
      ),
      actualizado_en = now()
  WHERE revision.id = v_revision.id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo,
    actor_id, correlation_id
  ) VALUES (
    v_revision.id, 'DRAFT', 'DRAFT', 'agregar_item_propuesta',
    v_codigo || ': ' || v_descripcion, p_actor, p_correlation_id
  );

  RETURN to_jsonb(v_item);
END;
$$;

COMMENT ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid) IS
  'C3.1/DC-08 (+obs. cliente 2026-10-13): agrega un ítem a una revisión DRAFT (A..Z); asigna ITxx estable bajo lock de propuesta y registra su revisión de origen sin modificar RFQ. Solo service_role.';

REVOKE ALL ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid)
  TO service_role;
