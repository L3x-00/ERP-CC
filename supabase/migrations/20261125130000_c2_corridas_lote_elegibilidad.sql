-- C2: la corrida agrupada valida en servidor que todos sus ítems comparten
-- material, calibre y proceso inicial, y puede ser creada también por el
-- operador con `produccion_operar`. La firma y los GRANT no cambian.
CREATE OR REPLACE FUNCTION public.crear_corrida(
  p_orden_id uuid,
  p_proceso_id uuid,
  p_items jsonb,
  p_actor_id uuid,
  p_corrida_origen_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proceso public.catalogo_procesos%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_item jsonb;
  v_partida_id uuid;
  v_cantidad numeric;
  v_cantidad_acumulada numeric;
  v_ids uuid[] := '{}';
  v_grupo_equipo_id uuid;
  v_grupo_partida_id uuid;
  v_partida record;
  v_codigo text;
  v_cantidad_total numeric := 0;
  v_corrida_id uuid;
  v_codigo_item text;
  v_material_referencia uuid;
  v_material_actual uuid;
  v_espesor_referencia numeric;
  v_espesor_actual numeric;
  v_proceso_inicial text;
  v_tiene_metas boolean;
BEGIN
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'produccion_operar')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;
  IF p_orden_id IS NULL OR p_proceso_id IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR (v_item ->> 'partida_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
    END IF;
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    IF v_partida_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'corrida_item_duplicado' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_partida_id);
    IF v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') <> 'null' THEN
      IF jsonb_typeof(v_item -> 'cantidad') <> 'number'
         OR (v_item ->> 'cantidad')::numeric <= 0
         OR (v_item ->> 'cantidad')::numeric <> round((v_item ->> 'cantidad')::numeric, 2) THEN
        RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = ANY (v_ids)
  ORDER BY partida.id
  FOR UPDATE;
  SELECT count(*) INTO v_cantidad_acumulada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = ANY (v_ids);
  IF v_cantidad_acumulada <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'corrida_partida_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_creable_corrida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_proceso
  FROM public.catalogo_procesos AS proceso
  WHERE proceso.id = p_proceso_id;
  IF NOT FOUND OR NOT v_proceso.activo THEN
    RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
  END IF;

  FOR v_partida IN
    SELECT partida.id, partida.orden_id, partida.cantidad_solicitada,
           partida.cantidad_producida, partida.procesos, partida.maquina_asignada,
           coalesce(partida.catalogo_material_id, partida.material_id) AS material_id
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = ANY (v_ids)
    ORDER BY partida.id
  LOOP
    IF v_partida.orden_id <> p_orden_id THEN
      RAISE EXCEPTION 'corrida_items_otra_orden' USING ERRCODE = '23514';
    END IF;

    IF v_partida.procesos IS NOT NULL AND cardinality(v_partida.procesos) > 0
       AND NOT EXISTS (
         SELECT 1 FROM unnest(v_partida.procesos) AS proceso_texto(valor)
         WHERE lower(btrim(proceso_texto.valor)) IN (lower(btrim(v_proceso.nombre)), lower(btrim(v_proceso.codigo)))
       ) THEN
      RAISE EXCEPTION 'corrida_items_incompatibles' USING ERRCODE = '23514';
    END IF;

    IF v_partida.maquina_asignada IS NOT NULL THEN
      SELECT recurso.grupo_equipo_id INTO v_grupo_partida_id
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.codigo = v_partida.maquina_asignada;
      IF v_grupo_partida_id IS NOT NULL THEN
        IF v_grupo_equipo_id IS NULL THEN
          v_grupo_equipo_id := v_grupo_partida_id;
        ELSIF v_grupo_equipo_id <> v_grupo_partida_id THEN
          RAISE EXCEPTION 'corrida_items_incompatibles' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    -- La compatibilidad reforzada aplica solo a lotes de dos o más ítems. Una
    -- corrida de un solo ítem conserva el comportamiento histórico.
    IF cardinality(v_ids) >= 2 THEN
      -- Calibre: solo es comparable si el material tiene un único espesor activo.
      v_material_actual := v_partida.material_id;
      IF v_material_actual IS NULL THEN
        RAISE EXCEPTION 'corrida_calibre_no_confirmable' USING ERRCODE = '23514';
      END IF;
      SELECT count(*) INTO v_cantidad_acumulada
      FROM public.catalogo_espesores AS espesor
      WHERE espesor.material_id = v_material_actual AND espesor.activo = true;
      IF v_cantidad_acumulada <> 1 THEN
        RAISE EXCEPTION 'corrida_calibre_no_confirmable' USING ERRCODE = '23514';
      END IF;
      SELECT espesor.espesor_mm INTO v_espesor_actual
      FROM public.catalogo_espesores AS espesor
      WHERE espesor.material_id = v_material_actual AND espesor.activo = true;
      IF v_material_referencia IS NULL THEN
        v_material_referencia := v_material_actual;
        v_espesor_referencia := v_espesor_actual;
      ELSIF v_material_referencia <> v_material_actual
         OR v_espesor_referencia IS DISTINCT FROM v_espesor_actual THEN
        RAISE EXCEPTION 'corrida_material_incompatible' USING ERRCODE = '23514';
      END IF;

      -- Proceso inicial: con ruteo se exige la meta de secuencia 1; sin ruteo se
      -- conserva el primer proceso declarado por la partida (compatibilidad).
      SELECT EXISTS (
        SELECT 1 FROM public.metas_proceso_partida AS meta
        WHERE meta.partida_id = v_partida.id
      ) INTO v_tiene_metas;
      IF v_tiene_metas THEN
        SELECT meta.nombre INTO v_proceso_inicial
        FROM public.metas_proceso_partida AS meta
        WHERE meta.partida_id = v_partida.id AND meta.secuencia = 1;
        -- Solo se exige correspondencia cuando la etiqueta del meta existe en
        -- el catálogo. Ordenes con etiquetas genericas no se rechazan por un
        -- dato que el operador no puede corregir desde la ficha.
        IF v_proceso_inicial IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.catalogo_procesos AS cp
             WHERE cp.activo = true
               AND lower(btrim(cp.nombre)) = lower(btrim(v_proceso_inicial))
           )
           AND lower(btrim(v_proceso_inicial)) NOT IN (
             lower(btrim(v_proceso.nombre)), lower(btrim(v_proceso.codigo))
           ) THEN
          RAISE EXCEPTION 'corrida_proceso_inicial_incompatible' USING ERRCODE = '23514';
        END IF;
      ELSIF v_partida.procesos IS NOT NULL AND cardinality(v_partida.procesos) > 0 THEN
        IF lower(btrim(v_partida.procesos[1])) NOT IN (lower(btrim(v_proceso.nombre)), lower(btrim(v_proceso.codigo))) THEN
          RAISE EXCEPTION 'corrida_proceso_inicial_incompatible' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    SELECT partida.cantidad_solicitada - partida.cantidad_producida INTO v_cantidad_acumulada
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    v_cantidad := CASE
      WHEN v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') = 'number'
        THEN (v_item ->> 'cantidad')::numeric
      ELSE v_cantidad_acumulada
    END;
    IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > v_cantidad_acumulada THEN
      RAISE EXCEPTION 'corrida_cantidad_invalida' USING ERRCODE = '23514';
    END IF;
    v_cantidad_total := v_cantidad_total + v_cantidad;
  END LOOP;

  IF v_cantidad_total <= 0 THEN
    RAISE EXCEPTION 'corrida_cantidad_invalida' USING ERRCODE = '23514';
  END IF;

  v_codigo := privado.corrida_siguiente_codigo(p_orden_id, v_proceso.prefijo_corrida);

  INSERT INTO public.corridas (
    orden_id, codigo, proceso_id, cantidad_planificada, corrida_origen_id, creado_por
  ) VALUES (
    p_orden_id, v_codigo, p_proceso_id, v_cantidad_total, p_corrida_origen_id, p_actor_id
  )
  RETURNING id INTO v_corrida_id;

  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    SELECT partida.cantidad_solicitada - partida.cantidad_producida INTO v_cantidad_acumulada
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    v_cantidad := CASE
      WHEN v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') = 'number'
        THEN (v_item ->> 'cantidad')::numeric
      ELSE v_cantidad_acumulada
    END;

    SELECT partida.codigo_pieza INTO v_codigo_item
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partidas_orden_produccion'
        AND column_name = 'codigo_item'
    ) THEN
      EXECUTE 'SELECT coalesce(codigo_item, codigo_pieza) FROM public.partidas_orden_produccion WHERE id = $1'
      INTO v_codigo_item USING v_partida_id;
    END IF;

    INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
    VALUES (v_corrida_id, v_partida_id, v_codigo_item, v_cantidad);
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_corrida_id,
    'orden_id', p_orden_id,
    'codigo', v_codigo,
    'proceso_id', p_proceso_id,
    'estado', 'PLANIFICADA',
    'cantidad_planificada', v_cantidad_total,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'partida_id', item.partida_id, 'codigo_item', item.codigo_item, 'cantidad', item.cantidad
      ) ORDER BY item.codigo_item)
      FROM public.corrida_items AS item WHERE item.corrida_id = v_corrida_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) IS
  'C2: crea una corrida con ítems de una misma orden, material+calibre y proceso inicial iguales. Admite gestionar_produccion o produccion_operar.';

REVOKE ALL ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) TO service_role;
