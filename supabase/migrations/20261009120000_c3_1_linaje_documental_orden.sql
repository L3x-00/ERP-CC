-- =============================================================================
-- C3.1 — Linaje documental estable al congelar la Orden
--
-- Problema corregido (HIGH de la re-revisión de C3.1): al copiar un ítem entre
-- revisiones cambia `propuesta_items.id`, por lo que el snapshot de la Orden
-- solo congelaba los archivos del UUID vigente y perdía los planos adjuntados
-- al mismo código ITxx en revisiones anteriores. El canal de cabecera filtraba
-- únicamente `p_revision_id` y perdía los archivos propios de A..anteriores.
--
-- Contrato aplicado:
--   * La identidad documental estable de un ítem dentro de una propuesta es
--     `(propuesta_id, codigo)`; la de la cabecera es la propuesta completa.
--   * La Orden congela los archivos vigentes de cabecera (`propuesta_revision`)
--     de A..revisión aceptada y, por ítem, los archivos vigentes de ese mismo
--     `codigo` en A..revisión aceptada.
--   * Nunca se incluye una revisión posterior a la aceptada, ni otro código, ni
--     otra propuesta.
--   * No se copian blobs ni filas de `archivos`: solo se congelan los ids.
--   * Cada entrada declara `revision_id`/`revision_letra` (y `item_id` en los
--     archivos de ítem) para que la lectura pueda agrupar por revisión sin
--     volver a consultar el origen vivo.
--
-- Permisos, idempotencia, locks, gate de crédito, folios, AR, eventos y
-- contrato de retorno quedan idénticos a `20261007120001_sii_b5_orden_base.sql`.
-- Reemplazo completo de la función (aditiva y repetible). Aplicar y verificar
-- primero en Supabase local.
-- =============================================================================

-- Guarda explícita: esta migración reemplaza una RPC de B5 y no debe crear una
-- definición incompleta si el esquema base todavía no terminó de aplicarse.
DO $$
BEGIN
  IF to_regprocedure('public.crear_orden_desde_revision(uuid,uuid,uuid)') IS NULL
     OR to_regclass('public.propuesta_revisiones') IS NULL
     OR to_regclass('public.propuesta_items') IS NULL
     OR to_regclass('public.archivos') IS NULL
     OR to_regclass('public.ordenes_produccion') IS NULL THEN
    RAISE EXCEPTION 'C3.1 documental requiere Propuestas B4 y Orden B5';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_orden_desde_revision(
  p_revision_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, folio text, folio_sii text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_propuesta public.propuestas%ROWTYPE;
  v_rfq public.pipeline%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_existente public.ordenes_produccion%ROWTYPE;
  v_es_interna boolean;
  v_actor_admin boolean;
  v_folio text;
  v_orden_id uuid := gen_random_uuid();
  v_fecha_compromiso timestamptz;
  v_prioridad text;
  v_totales jsonb;
  v_moneda text;
  v_tipo_cambio numeric(10,4) := 1;
  v_credito_nuevo numeric(18,4);
  v_credito_utilizado numeric(18,4);
  v_item record;
  v_item_snapshot jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_archivos_snapshot jsonb;
  v_archivos_item jsonb;
  v_operaciones jsonb;
  v_ruteo jsonb;
  v_procesos text[];
  v_area_codigo text;
  v_tiempo_estimado numeric;
  v_partidas integer := 0;
  v_snapshot jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_liberar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  -- Locks deterministas: pipeline → propuesta → revisión → cliente.
  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_propuesta
  FROM public.propuestas AS p
  WHERE p.id = v_revision.propuesta_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'propuesta_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rfq
  FROM public.pipeline AS r
  WHERE r.id = v_propuesta.rfq_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia bajo lock de la revisión.
  SELECT * INTO v_existente
  FROM public.ordenes_produccion AS o
  WHERE o.propuesta_revision_id = p_revision_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.folio, v_existente.folio_sii, true;
    RETURN;
  END IF;

  IF v_revision.estado NOT IN ('ACCEPTED', 'SALE_CONFIRMED') THEN
    RAISE EXCEPTION 'revision_no_aceptada' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_propuesta.accepted_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'revision_no_aceptada' USING ERRCODE = '23514', DETAIL = 'no_vigente';
  END IF;

  SELECT * INTO v_cliente
  FROM public.clientes AS c
  WHERE c.id = v_propuesta.cliente_id
  FOR UPDATE;
  IF NOT FOUND OR v_cliente.estado IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = '23514';
  END IF;

  v_es_interna := coalesce(v_rfq.es_orden_interna, false);
  SELECT (u.rol = 'admin' AND u.activo IS TRUE) INTO v_actor_admin
  FROM public.usuarios AS u WHERE u.id = p_actor_id;

  v_totales := public.calcular_totales_revision(p_revision_id);
  v_moneda := coalesce(v_totales ->> 'moneda', 'MXN');

  -- Gate de crédito vigente (A13/A14): el sobregiro solo lo autoriza un admin.
  IF NOT v_es_interna THEN
    IF v_moneda = 'USD' THEN
      SELECT config.tipo_cambio_usd INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config LIMIT 1;
      IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
        RAISE EXCEPTION 'tipo_cambio_usd_requerido' USING ERRCODE = '23514';
      END IF;
    END IF;

    v_credito_nuevo := round(
      (v_totales ->> 'subtotal')::numeric * CASE WHEN v_moneda = 'USD' THEN v_tipo_cambio ELSE 1 END,
      2
    );
    IF coalesce(v_cliente.limite_credito, 0) > 0 THEN
      SELECT coalesce(round(sum(
        cuenta.saldo_pendiente
          * CASE WHEN cuenta.moneda = 'USD' THEN cuenta.tipo_cambio_origen ELSE 1 END
      ), 2), 0)
      INTO v_credito_utilizado
      FROM public.cuentas_por_cobrar AS cuenta
      WHERE cuenta.cliente_id = v_cliente.id
        AND cuenta.estado IN ('pendiente', 'parcial');

      IF v_credito_utilizado + v_credito_nuevo > v_cliente.limite_credito
         AND NOT coalesce(v_actor_admin, false) THEN
        RAISE EXCEPTION 'credito_limite_excedido' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  v_fecha_compromiso := coalesce(v_rfq.fecha_requerida, now());
  v_prioridad := CASE
    WHEN v_rfq.prioridad IN ('baja', 'normal', 'alta', 'urgente') THEN v_rfq.prioridad
    ELSE 'normal'
  END;
  v_folio := public.generar_folio_periodico(CASE WHEN v_es_interna THEN 'OI' ELSE 'O' END);

  -- Archivos vivos de cabecera (no se copian blobs; se congelan los ids para
  -- que la orden no dependa de datos futuros). El linaje de cabecera son todas
  -- las revisiones A..aceptada de ESTA propuesta: un plano adjuntado en A sigue
  -- siendo el plano vigente de la revisión aceptada en B. Las revisiones
  -- posteriores a la aceptada quedan fuera por `letra`.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'archivo_id', linaje.archivo_id,
    'entidad', linaje.entidad,
    'clase', linaje.clase,
    'tema_codigo', linaje.tema_codigo,
    'nombre_original', linaje.nombre_original,
    'nombre_erp', linaje.nombre_erp,
    'mime', linaje.mime,
    'revision_id', linaje.revision_id,
    'revision_letra', linaje.letra
  ) ORDER BY linaje.letra ASC NULLS FIRST, linaje.creado_en, linaje.archivo_id), '[]'::jsonb)
  INTO v_archivos_snapshot
  FROM (
    SELECT
      a.id AS archivo_id,
      a.entidad,
      a.clase,
      a.tema_codigo,
      a.nombre_original,
      a.nombre_erp,
      a.mime,
      a.creado_en,
      rev.id AS revision_id,
      rev.letra
    FROM public.archivos AS a
    LEFT JOIN public.propuesta_revisiones AS rev
      ON a.entidad = 'propuesta_revision'
     AND rev.id = a.entidad_id
    WHERE a.vigente
      AND (
        (
          a.entidad = 'propuesta_revision'
          AND rev.propuesta_id = v_propuesta.id
          AND rev.letra <= v_revision.letra
        )
        OR (a.entidad = 'propuesta' AND a.entidad_id = v_propuesta.id)
        OR (a.entidad = 'rfq' AND a.entidad_id = v_rfq.id)
        OR (
          a.entidad = 'rfq_item'
          AND a.entidad_id IN (
            SELECT i.rfq_item_id
            FROM public.propuesta_items AS i
            WHERE i.revision_id = p_revision_id AND i.rfq_item_id IS NOT NULL
          )
        )
      )
  ) AS linaje;

  -- La orden nace primero (las partidas la referencian); el snapshot se
  -- completa al final del bucle de ítems.
  INSERT INTO public.ordenes_produccion (
    id, folio, folio_sii, cliente_id, cotizacion_id, estado, estado_sii,
    prioridad, fecha_compromiso, es_interna, propuesta_id,
    propuesta_revision_id, rfq_id, snapshot_json
  ) VALUES (
    v_orden_id, v_folio, v_folio, v_cliente.id, v_rfq.id, 'borrador', 'CONFIRMADA',
    v_prioridad, v_fecha_compromiso, v_es_interna, v_propuesta.id,
    p_revision_id, v_rfq.id, '{}'::jsonb
  );

  FOR v_item IN
    SELECT
      i.*,
      material.nombre AS material_nombre,
      espesor.etiqueta AS espesor_etiqueta
    FROM public.propuesta_items AS i
    LEFT JOIN public.catalogo_materiales AS material ON material.id = i.material_id
    LEFT JOIN public.catalogo_espesores AS espesor ON espesor.id = i.espesor_id
    WHERE i.revision_id = p_revision_id
    ORDER BY i.codigo, i.creado_en, i.id
  LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'proceso_id', proceso.id,
      'codigo', proceso.codigo,
      'nombre', proceso.nombre,
      'orden', operacion.orden
    ) ORDER BY operacion.orden, proceso.codigo), '[]'::jsonb)
    INTO v_operaciones
    FROM public.propuesta_item_operaciones AS operacion
    JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
    WHERE operacion.item_id = v_item.id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'secuencia', ruteo.secuencia,
      'proceso_id', proceso.id,
      'proceso_codigo', proceso.codigo,
      'proceso_nombre', proceso.nombre,
      'grupo_equipo_id', ruteo.grupo_equipo_id,
      'grupo_planeado_id', ruteo.grupo_planeado_id,
      'setup_horas', ruteo.setup_horas,
      'run_horas', ruteo.run_horas,
      'total_horas', ruteo.total_horas,
      'requiere_revision', ruteo.requiere_revision
    ) ORDER BY ruteo.secuencia), '[]'::jsonb)
    INTO v_ruteo
    FROM public.propuesta_item_ruteo AS ruteo
    LEFT JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE ruteo.item_id = v_item.id;

    -- Linaje documental del ítem: la identidad estable es (propuesta, codigo),
    -- no el UUID de la fila, porque cada revisión copia sus ítems. Se incluyen
    -- los archivos vigentes del mismo código en A..revisión aceptada y se
    -- excluyen otro código, otra propuesta y revisiones posteriores.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'archivo_id', linaje.archivo_id,
      'clase', linaje.clase,
      'tema_codigo', linaje.tema_codigo,
      'nombre_original', linaje.nombre_original,
      'nombre_erp', linaje.nombre_erp,
      'mime', linaje.mime,
      'item_id', linaje.item_id,
      'revision_id', linaje.revision_id,
      'revision_letra', linaje.letra
    ) ORDER BY linaje.letra, linaje.creado_en, linaje.archivo_id), '[]'::jsonb)
    INTO v_archivos_item
    FROM (
      SELECT
        a.id AS archivo_id,
        a.clase,
        a.tema_codigo,
        a.nombre_original,
        a.nombre_erp,
        a.mime,
        a.creado_en,
        historico.id AS item_id,
        revision.id AS revision_id,
        revision.letra
      FROM public.propuesta_items AS historico
      JOIN public.propuesta_revisiones AS revision ON revision.id = historico.revision_id
      JOIN public.archivos AS a
        ON a.entidad = 'propuesta_item'
       AND a.entidad_id = historico.id
       AND a.vigente
      WHERE revision.propuesta_id = v_propuesta.id
        AND revision.letra <= v_revision.letra
        AND historico.codigo = v_item.codigo
    ) AS linaje;

    v_item_snapshot := jsonb_build_object(
      'item_id', v_item.id,
      'codigo', v_item.codigo,
      'descripcion', v_item.descripcion,
      'cantidad', v_item.cantidad,
      'precio_unitario', v_item.precio_unitario,
      'es_descuento', v_item.es_descuento,
      'material_id', v_item.material_id,
      'material', v_item.material_nombre,
      'espesor_id', v_item.espesor_id,
      'espesor', v_item.espesor_etiqueta,
      'acabado', v_item.acabado,
      'notas', v_item.notas,
      'operaciones', v_operaciones,
      'ruteo', v_ruteo,
      'archivos', v_archivos_item
    );
    v_items_snapshot := v_items_snapshot || jsonb_build_array(v_item_snapshot);

    IF v_item.es_descuento OR NOT v_item.activo THEN
      CONTINUE;
    END IF;

    -- Partida fabricable: procesos/ruteo y área del primer proceso.
    SELECT array_agg(nombre_orden.etiqueta ORDER BY nombre_orden.secuencia, nombre_orden.etiqueta)
    INTO v_procesos
    FROM (
      SELECT left(proceso.nombre, 60) AS etiqueta, ruteo.secuencia
      FROM public.propuesta_item_ruteo AS ruteo
      JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
      WHERE ruteo.item_id = v_item.id
      UNION ALL
      SELECT left(proceso.nombre, 60), 1000 + operacion.orden
      FROM public.propuesta_item_operaciones AS operacion
      JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
      WHERE operacion.item_id = v_item.id
        AND NOT EXISTS (
          SELECT 1 FROM public.propuesta_item_ruteo AS r WHERE r.item_id = v_item.id
        )
    ) AS nombre_orden;

    SELECT coalesce(sum(ruteo.total_horas), 0) * 60
    INTO v_tiempo_estimado
    FROM public.propuesta_item_ruteo AS ruteo
    WHERE ruteo.item_id = v_item.id;

    SELECT proceso.area_trabajo_codigo INTO v_area_codigo
    FROM public.propuesta_item_ruteo AS ruteo
    JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE ruteo.item_id = v_item.id
    ORDER BY ruteo.secuencia
    LIMIT 1;

    INSERT INTO public.partidas_orden_produccion (
      orden_id, codigo_pieza, codigo_item, propuesta_item_id, descripcion,
      cantidad_solicitada, unidad_medida, material_id, tiempo_estimado_minutos,
      area_trabajo_codigo, procesos, es_externo
    ) VALUES (
      v_orden_id,
      v_item.codigo,
      v_item.codigo,
      v_item.id,
      v_item.descripcion,
      v_item.cantidad,
      'unidad',
      NULL,
      coalesce(v_tiempo_estimado, 0),
      v_area_codigo,
      coalesce(v_procesos, '{}'::text[]),
      false
    );
    v_partidas := v_partidas + 1;
  END LOOP;

  IF v_partidas = 0 THEN
    RAISE EXCEPTION 'propuesta_sin_items_fabricables' USING ERRCODE = '23514';
  END IF;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'orden_id', v_orden_id,
    'creado_en', now(),
    'origen', jsonb_build_object(
      'rfq_id', v_rfq.id,
      'rfq_folio', v_rfq.folio_rfq,
      'propuesta_id', v_propuesta.id,
      'propuesta_folio', v_propuesta.folio_cnc,
      'revision_id', p_revision_id,
      'revision_folio', v_revision.folio_revision,
      'letra', v_revision.letra
    ),
    'cabecera', v_revision.snapshot_cabecera,
    'fecha_compromiso', v_fecha_compromiso,
    'prioridad', v_prioridad,
    'es_interna', v_es_interna,
    'totales', jsonb_build_object(
      'subtotal', (v_totales ->> 'subtotal')::numeric,
      'descuento', (v_totales ->> 'descuento')::numeric,
      'iva', (v_totales ->> 'iva')::numeric,
      'total', (v_totales ->> 'total')::numeric,
      'iva_porcentaje', (v_totales ->> 'ivaPorcentaje')::numeric,
      'moneda', v_moneda,
      'tipo_cambio', CASE WHEN v_moneda = 'USD' THEN v_tipo_cambio ELSE 1 END
    ),
    'items', v_items_snapshot,
    'archivos', v_archivos_snapshot,
    'observaciones', nullif(btrim(coalesce(v_rfq.notas, '')), '')
  );

  UPDATE public.ordenes_produccion
  SET snapshot_json = v_snapshot
  WHERE ordenes_produccion.id = v_orden_id;

  -- D-04: la AR nace no cobrable; se activa al entregar el 100 % (OBS-21).
  IF NOT v_es_interna THEN
    IF (v_totales ->> 'total')::numeric > 0
       AND (v_totales ->> 'total')::numeric <= 99999999.9999 THEN
      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, monto_subtotal, monto_iva,
        saldo_pendiente, moneda, tipo_cambio_origen, estado,
        fecha_vencimiento, cobrable_desde
      ) VALUES (
        v_orden_id, v_cliente.id,
        round((v_totales ->> 'total')::numeric, 4),
        round((v_totales ->> 'subtotal')::numeric, 4),
        round((v_totales ->> 'iva')::numeric, 4),
        round((v_totales ->> 'total')::numeric, 4),
        CASE WHEN v_moneda = 'USD' THEN 'USD' ELSE 'MXN' END,
        CASE WHEN v_moneda = 'USD' THEN round(v_tipo_cambio, 4) ELSE 1 END,
        'pendiente', NULL, NULL
      );
    END IF;
  END IF;

  -- La orden confirma la venta: la revisión pasa a SALE_CONFIRMED si no lo estaba.
  IF v_revision.estado = 'ACCEPTED' THEN
    PERFORM set_config('sii.b4_rpc', 'on', true);
    UPDATE public.propuesta_revisiones
    SET estado = 'SALE_CONFIRMED', actualizado_en = now()
    WHERE propuesta_revisiones.id = p_revision_id;
    UPDATE public.propuestas
    SET estado = 'SALE_CONFIRMED', revision_vigente_id = p_revision_id
    WHERE propuestas.id = v_propuesta.id;
    INSERT INTO public.propuesta_revision_eventos (
      revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
    ) VALUES (
      p_revision_id, 'ACCEPTED', 'SALE_CONFIRMED', 'confirmar_venta_desde_orden',
      p_actor_id, p_correlation_id
    );
  END IF;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_orden_id,
    'orden_creada',
    jsonb_build_object(
      'origen', 'revision_aceptada',
      'propuesta_revision_id', p_revision_id,
      'folio_sii', v_folio,
      'partidas', v_partidas,
      'es_interna', v_es_interna
    ),
    NULL, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_orden_id, v_folio, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid) IS
  'SII-B5.1/ADR-SII-03 + C3.1: orden idempotente desde la revisión aceptada, con snapshot congelado, folio O-/OI- y AR no cobrable. El snapshot documental usa linaje estable: cabecera de A..revisión aceptada y, por ítem, el mismo ITxx de A..revisión aceptada; nunca una revisión posterior. Fecha compromiso = fecha_requerida del RFQ (ajustable pre-producción). Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid)
  TO service_role;
