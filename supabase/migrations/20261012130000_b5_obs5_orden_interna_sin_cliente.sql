-- =============================================================================
-- Obs. cliente 2026-10-12 (5) — Orden interna sin cliente y con catálogos
--
--   * `ordenes_produccion.cliente_id` pasa a NULL-able: la orden interna (TI)
--     es trabajo interno, no refiere a un cliente (no hay AR ni venta).
--   * `crear_orden_interna` v2: cliente opcional (compatibilidad con el payload
--     anterior), partidas con `material_id`/`espesor_id`/`proceso_ids` del
--     catálogo, `unidad`, y persistencia de `catalogo_material_id`,
--     `area_trabajo_codigo` (derivada del primer proceso con área) y `procesos`
--     (nombres) en `partidas_orden_produccion`. El espesor queda en el snapshot.
--
-- Aditiva: misma firma, se conservan permisos y el resto del comportamiento.
-- Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.ordenes_produccion
  ALTER COLUMN cliente_id DROP NOT NULL;

COMMENT ON COLUMN public.ordenes_produccion.cliente_id IS
  'Cliente de la orden comercial; NULL en órdenes internas (TI), que no refieren a cliente.';

CREATE OR REPLACE FUNCTION public.crear_orden_interna(
  p_datos jsonb,
  p_autorizacion jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, folio text, folio_sii text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente public.clientes%ROWTYPE;
  v_cliente_id uuid;
  v_orden_id uuid := gen_random_uuid();
  v_folio text;
  v_fecha_compromiso timestamptz;
  v_prioridad text;
  v_descripcion text;
  v_notas text;
  v_motivo text;
  v_autorizado_por uuid;
  v_items jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_partidas integer := 0;
  v_snapshot jsonb;
  v_fila record;
  v_item record;
  v_codigo text;
  v_unidad text;
  v_material_nombre text;
  v_espesor_etiqueta text;
  v_procesos_nombres text[];
  v_area_codigo text;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_crear_interna') THEN
    RAISE EXCEPTION 'sin_permiso_orden_interna' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'orden_interna_datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_autorizacion IS NULL OR jsonb_typeof(p_autorizacion) <> 'object' THEN
    RAISE EXCEPTION 'autorizacion_requerida' USING ERRCODE = '22023';
  END IF;

  v_motivo := nullif(btrim(coalesce(privado.json_texto(p_autorizacion, 'motivo'), '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'motivo_autorizacion_requerido' USING ERRCODE = '22023';
  END IF;

  v_autorizado_por := p_actor_id;
  IF p_autorizacion ? 'autorizado_por' AND jsonb_typeof(p_autorizacion -> 'autorizado_por') = 'string' THEN
    v_autorizado_por := nullif(btrim(privado.json_texto(p_autorizacion, 'autorizado_por')), '')::uuid;
  END IF;
  IF v_autorizado_por IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    WHERE u.id = v_autorizado_por AND u.activo AND u.rol IN ('admin', 'gerente')
  ) THEN
    RAISE EXCEPTION 'autorizador_invalido' USING ERRCODE = '22023';
  END IF;

  v_fecha_compromiso := NULLIF(btrim(coalesce(privado.json_texto(p_datos, 'fecha_compromiso'), '')), '')::timestamptz;
  IF v_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = '23514';
  END IF;

  v_prioridad := coalesce(nullif(btrim(coalesce(privado.json_texto(p_datos, 'prioridad'), '')), ''), 'normal');
  IF v_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = '23514';
  END IF;

  v_descripcion := nullif(btrim(coalesce(privado.json_texto(p_datos, 'descripcion'), '')), '');
  v_notas := nullif(btrim(coalesce(privado.json_texto(p_datos, 'notas'), '')), '');

  -- Obs. cliente 2026-10-12 (5): el cliente es opcional en la TI. Si viene
  -- (payload anterior), debe estar activo; si no, la orden nace sin cliente.
  v_cliente_id := NULL;
  IF p_datos ? 'cliente_id'
     AND jsonb_typeof(p_datos -> 'cliente_id') = 'string'
     AND nullif(btrim(privado.json_texto(p_datos, 'cliente_id')), '') IS NOT NULL THEN
    SELECT * INTO v_cliente FROM public.clientes AS c
    WHERE c.id = (privado.json_texto(p_datos, 'cliente_id'))::uuid
    FOR UPDATE;
    IF NOT FOUND OR v_cliente.estado IS DISTINCT FROM 'activo' THEN
      RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = '23514';
    END IF;
    v_cliente_id := v_cliente.id;
  END IF;

  v_items := p_datos -> 'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'items_requeridos' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS elemento(item)
    WHERE jsonb_typeof(elemento.item) <> 'object'
  ) THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_items) AS item(
      codigo_item text, descripcion text, cantidad numeric, unidad text,
      material text, espesor text, procesos text[], tiempo_estimado_minutos numeric
    )
    WHERE nullif(btrim(coalesce(item.descripcion, '')), '') IS NULL
       OR char_length(btrim(item.descripcion)) > 300
       OR item.cantidad IS NULL OR item.cantidad <= 0
       OR char_length(btrim(coalesce(item.codigo_item, ''))) > 20
       OR char_length(btrim(coalesce(item.unidad, ''))) > 40
       OR char_length(btrim(coalesce(item.material, ''))) > 120
       OR char_length(btrim(coalesce(item.espesor, ''))) > 120
       OR coalesce(item.tiempo_estimado_minutos, 0) < 0
       OR coalesce(array_length(item.procesos, 1), 0) > 20
  ) THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '23514';
  END IF;

  v_folio := public.generar_folio_periodico('OI');

  -- La orden nace primero (las partidas la referencian); el snapshot se
  -- completa al final del bucle con los catálogos resueltos.
  INSERT INTO public.ordenes_produccion (
    id, folio, folio_sii, cliente_id, cotizacion_id, estado, estado_sii,
    prioridad, fecha_compromiso, es_interna, snapshot_json
  ) VALUES (
    v_orden_id, v_folio, v_folio, v_cliente_id, NULL, 'borrador', 'CONFIRMADA',
    v_prioridad, v_fecha_compromiso, true, '{}'::jsonb
  );

  FOR v_fila IN
    SELECT * FROM jsonb_array_elements(v_items) WITH ORDINALITY AS fila(valor, orden)
  LOOP
    SELECT * INTO v_item
    FROM jsonb_to_record(v_fila.valor) AS item(
      codigo_item text, descripcion text, cantidad numeric, unidad text,
      material text, espesor text, procesos text[], tiempo_estimado_minutos numeric,
      material_id uuid, espesor_id uuid, proceso_ids uuid[]
    );

    v_codigo := coalesce(
      nullif(btrim(coalesce(v_item.codigo_item, '')), ''),
      'IT' || lpad((v_fila.orden)::text, 2, '0')
    );
    v_unidad := coalesce(nullif(btrim(coalesce(v_item.unidad, '')), ''), 'unidad');

    -- Material del catálogo (si viene), con fallback al texto legado.
    v_material_nombre := nullif(btrim(coalesce(v_item.material, '')), '');
    IF v_item.material_id IS NOT NULL THEN
      SELECT m.nombre INTO v_material_nombre
      FROM public.catalogo_materiales AS m
      WHERE m.id = v_item.material_id AND m.activo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'material_invalido' USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Espesor del catálogo (si viene), validando su material cuando aplica.
    v_espesor_etiqueta := nullif(btrim(coalesce(v_item.espesor, '')), '');
    IF v_item.espesor_id IS NOT NULL THEN
      SELECT e.etiqueta INTO v_espesor_etiqueta
      FROM public.catalogo_espesores AS e
      WHERE e.id = v_item.espesor_id AND e.activo
        AND (v_item.material_id IS NULL OR e.material_id = v_item.material_id);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Procesos del catálogo (si vienen ids) → nombres + área del primero con área.
    v_procesos_nombres := coalesce(v_item.procesos, '{}'::text[]);
    v_area_codigo := NULL;
    IF coalesce(array_length(v_item.proceso_ids, 1), 0) > 0 THEN
      SELECT array_agg(p.nombre ORDER BY sel.orden)
      INTO v_procesos_nombres
      FROM unnest(v_item.proceso_ids) WITH ORDINALITY AS sel(proceso_id, orden)
      JOIN public.catalogo_procesos AS p ON p.id = sel.proceso_id AND p.activo;
      IF coalesce(array_length(v_procesos_nombres, 1), 0)
         <> coalesce(array_length(v_item.proceso_ids, 1), 0) THEN
        RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '23514';
      END IF;

      SELECT p.area_trabajo_codigo INTO v_area_codigo
      FROM unnest(v_item.proceso_ids) WITH ORDINALITY AS sel(proceso_id, orden)
      JOIN public.catalogo_procesos AS p ON p.id = sel.proceso_id AND p.activo
      WHERE p.area_trabajo_codigo IS NOT NULL
      ORDER BY sel.orden
      LIMIT 1;
    END IF;

    INSERT INTO public.partidas_orden_produccion (
      orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada,
      unidad_medida, material_id, catalogo_material_id, tiempo_estimado_minutos,
      area_trabajo_codigo, procesos, es_externo
    ) VALUES (
      -- `codigo_item` queda NULL: el CHECK lo reserva para el linaje ITxx de
      -- propuestas; el código libre de la partida vive en `codigo_pieza`.
      v_orden_id, v_codigo, NULL, btrim(v_item.descripcion), v_item.cantidad,
      v_unidad, NULL, v_item.material_id, coalesce(v_item.tiempo_estimado_minutos, 0),
      v_area_codigo, coalesce(v_procesos_nombres, '{}'::text[]), false
    );
    v_partidas := v_partidas + 1;

    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'codigo_item', v_codigo,
      'descripcion', btrim(v_item.descripcion),
      'cantidad', v_item.cantidad,
      'unidad', v_unidad,
      'material_id', v_item.material_id,
      'material', v_material_nombre,
      'espesor_id', v_item.espesor_id,
      'espesor', v_espesor_etiqueta,
      'proceso_ids', coalesce(v_item.proceso_ids, '{}'::uuid[]),
      'procesos', coalesce(v_procesos_nombres, '{}'::text[]),
      'area_trabajo_codigo', v_area_codigo,
      'tiempo_estimado_minutos', coalesce(v_item.tiempo_estimado_minutos, 0)
    ));
  END LOOP;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'orden_id', v_orden_id,
    'creado_en', now(),
    'origen', jsonb_build_object('tipo', 'ORDEN_INTERNA', 'rfq_id', NULL, 'propuesta_id', NULL),
    'cabecera', jsonb_build_object(
      'cliente_id', v_cliente_id,
      'cliente', CASE WHEN v_cliente_id IS NULL THEN NULL ELSE jsonb_build_object(
        'razon_social', v_cliente.razon_social,
        'nombre_comercial', v_cliente.nombre_comercial
      ) END,
      'descripcion', v_descripcion
    ),
    'fecha_compromiso', v_fecha_compromiso,
    'prioridad', v_prioridad,
    'es_interna', true,
    'items', v_items_snapshot,
    'archivos', '[]'::jsonb,
    'autorizacion', jsonb_build_object(
      'autorizado_por', v_autorizado_por,
      'motivo', v_motivo,
      'correlation_id', p_correlation_id
    ),
    'observaciones', v_notas
  );

  UPDATE public.ordenes_produccion
  SET snapshot_json = v_snapshot
  WHERE ordenes_produccion.id = v_orden_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_orden_id,
    'orden_interna_creada',
    jsonb_build_object(
      'folio_sii', v_folio,
      'partidas', v_partidas,
      'autorizado_por', v_autorizado_por
    ),
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_orden_id, v_folio, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_interna(jsonb, jsonb, uuid, uuid) IS
  'SII-B5.5 + obs. cliente 2026-10-12 (5): orden interna (OI-MMYY_XX) sin cliente obligatorio, con partidas de catálogo (material/espesor/procesos), área derivada y autorización registrada; sin AR. Acepta el payload anterior con cliente. Solo service_role.';
