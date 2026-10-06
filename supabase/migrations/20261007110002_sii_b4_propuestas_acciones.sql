-- =============================================================================
-- SII-B4.2/4.3/4.5/4.9/4.10 — Acciones de propuestas y totales
-- Plan: docs/plan-erp-sii/04-propuestas.md §4.2 (estados), §4.3 (revisiones),
--       §4.5 (ítems/ruteo/costeo y totales), §4.9 (requiere revisión),
--       §4.10 (aceptación de la revisión exacta)
-- Documento del cliente: §10.1–§10.4, §10.7
--
-- Entrega (todas SECURITY DEFINER, search_path='', solo service_role):
--   * crear_propuesta(rfq, actor, correlation): RFQ READY_FOR_PROPOSAL →
--     propuesta + revisión A DRAFT con ítems/operaciones/ITxx intactos y RFQ
--     CONVERTED en la misma transacción; idempotente si ya hay DRAFT.
--   * crear_nueva_revision(origen, motivo, actor, correlation): copia profunda
--     letra siguiente (tope Z) y motivo obligatorio.
--   * editar_item_propuesta / editar_ruteo_item / editar_costos_revision
--   * registrar_seguimiento_propuesta (próxima acción del catálogo)
--   * validar_revision (→READY_TO_SEND), rechazar_propuesta, cerrar_propuesta
--   * aceptar_revision (fija accepted_revision_id) y confirmar_venta
--   * calcular_totales_revision (lectura, espejo TS en el dominio)
--
-- ORDEN DE LOCKS documentado: `pipeline` (RFQ) → `propuestas` →
-- `propuesta_revisiones` → `propuesta_items`. Las RPC de ítem descubren su
-- revisión sin lock, luego bloquean la revisión y releen el ítem FOR UPDATE.
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.propuestas') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007110001_sii_b4_propuestas_base antes';
  END IF;
  IF to_regprocedure('privado.actor_con_permiso(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100003_sii_b3_rfq_acciones antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Cálculo de "Requiere revisión" al editar el alcance de una revisión B+
--    (plan §4.9: cantidad/material/espesor cambian respecto al predecesor)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.b4_marcar_requiere_revision(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.propuesta_items%ROWTYPE;
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_pred_revision public.propuesta_revisiones%ROWTYPE;
  v_pred public.propuesta_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.propuesta_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones WHERE id = v_item.revision_id;
  IF NOT FOUND OR v_revision.letra = 'A' THEN
    RETURN;
  END IF;

  SELECT * INTO v_pred_revision
  FROM public.propuesta_revisiones
  WHERE propuesta_id = v_revision.propuesta_id AND letra < v_revision.letra
  ORDER BY letra DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_pred
  FROM public.propuesta_items
  WHERE revision_id = v_pred_revision.id AND codigo = v_item.codigo;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_item.cantidad IS DISTINCT FROM v_pred.cantidad
     OR v_item.material_id IS DISTINCT FROM v_pred.material_id
     OR v_item.espesor_id IS DISTINCT FROM v_pred.espesor_id THEN
    UPDATE public.propuesta_item_ruteo
    SET requiere_revision = true
    WHERE item_id = p_item_id;

    UPDATE public.propuesta_revisiones
    SET requiere_revision_ruteo = true
    WHERE id = v_revision.id;

    IF EXISTS (
      SELECT 1 FROM public.propuesta_revision_costos WHERE revision_id = v_revision.id
    ) THEN
      UPDATE public.propuesta_revisiones
      SET requiere_revision_costeo = true
      WHERE id = v_revision.id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION privado.b4_marcar_requiere_revision(uuid) IS
  'SII-B4.9: marca requiere revisión de ruteo/costeo cuando el alcance cambió respecto al predecesor.';

REVOKE ALL ON FUNCTION privado.b4_marcar_requiere_revision(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Alta desde RFQ: propuesta + revisión A DRAFT (RFQ → CONVERTED)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_propuesta(
  p_rfq_id uuid,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq public.pipeline%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_contacto jsonb;
  v_existente record;
  v_propuesta_id uuid;
  v_revision_id uuid;
  v_folio text;
  v_folio_revision text;
  v_snapshot jsonb;
  v_item record;
  v_pitem_id uuid;
  v_items integer := 0;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_articulo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia bajo lock: si el RFQ ya tiene una revisión DRAFT, se devuelve.
  SELECT r.id, r.propuesta_id, r.folio_revision, r.letra, p.folio_cnc
  INTO v_existente
  FROM public.propuesta_revisiones AS r
  JOIN public.propuestas AS p ON p.id = r.propuesta_id
  WHERE p.rfq_id = p_rfq_id AND r.estado = 'DRAFT'
  ORDER BY r.creado_en, r.id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'propuestaId', v_existente.propuesta_id,
      'propuestaFolio', v_existente.folio_cnc,
      'revisionId', v_existente.id,
      'revisionFolio', v_existente.folio_revision,
      'letra', v_existente.letra,
      'yaExistia', true
    );
  END IF;

  IF v_rfq.estado_rfq <> 'READY_FOR_PROPOSAL' THEN
    RAISE EXCEPTION 'rfq_no_apto_para_propuesta' USING ERRCODE = '23514',
      DETAIL = v_rfq.estado_rfq;
  END IF;
  IF v_rfq.cliente_id IS NULL THEN
    RAISE EXCEPTION 'rfq_sin_cliente' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes AS c WHERE c.id = v_rfq.cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_sin_cliente' USING ERRCODE = '23514';
  END IF;

  IF v_rfq.contacto_id IS NOT NULL THEN
    SELECT to_jsonb(ct) INTO v_contacto
    FROM (
      SELECT ct.nombre, ct.puesto, ct.correo, ct.telefono
      FROM public.contactos_cliente AS ct WHERE ct.id = v_rfq.contacto_id
    ) AS ct;
  END IF;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'cliente_id', v_cliente.id,
    'cliente', jsonb_build_object(
      'razon_social', v_cliente.razon_social,
      'nombre_comercial', v_cliente.nombre_comercial,
      'rfc', v_cliente.rfc,
      'correo', v_cliente.correo,
      'telefono', v_cliente.telefono
    ),
    'contacto_id', v_rfq.contacto_id,
    'contacto', COALESCE(v_contacto, 'null'::jsonb),
    'empresa', v_rfq.empresa,
    'moneda', v_rfq.moneda,
    'condiciones_pago', v_rfq.condiciones_pago,
    'iva_porcentaje', v_rfq.iva_porcentaje,
    'folio_rfq', v_rfq.folio_rfq
  );

  v_folio := public.generar_folio_periodico('CNC');
  v_folio_revision := v_folio || '-A';

  INSERT INTO public.propuestas (
    rfq_id, cliente_id, folio_cnc, estado, responsable_id, creado_por
  ) VALUES (
    p_rfq_id, v_cliente.id, v_folio, 'DRAFT',
    COALESCE(v_rfq.responsable_id, v_rfq.vendedor_id), p_actor
  )
  RETURNING id INTO v_propuesta_id;

  INSERT INTO public.propuesta_revisiones (
    propuesta_id, letra, folio_revision, estado, snapshot_cabecera, creado_por
  ) VALUES (
    v_propuesta_id, 'A', v_folio_revision, 'DRAFT', v_snapshot, p_actor
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.propuestas
  SET revision_vigente_id = v_revision_id
  WHERE id = v_propuesta_id;

  -- Ítems activos del RFQ con su ITxx intacto + operaciones solicitadas.
  FOR v_item IN
    SELECT * FROM public.rfq_items
    WHERE rfq_id = p_rfq_id AND estado = 'activo'
    ORDER BY numero
  LOOP
    INSERT INTO public.propuesta_items (
      revision_id, rfq_item_id, codigo, descripcion, cantidad,
      material_id, espesor_id, acabado, notas, precio_unitario, es_descuento, activo
    ) VALUES (
      v_revision_id, v_item.id, v_item.codigo, v_item.descripcion, v_item.cantidad,
      v_item.material_id, v_item.espesor_id, v_item.acabado, v_item.notas, 0, false, true
    )
    RETURNING id INTO v_pitem_id;
    v_items := v_items + 1;

    INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
    SELECT v_pitem_id, o.proceso_id, o.orden
    FROM public.rfq_item_operaciones AS o
    WHERE o.rfq_item_id = v_item.id;

    -- Ruteo inicial editable: una secuencia por operación solicitada.
    INSERT INTO public.propuesta_item_ruteo (
      item_id, secuencia, proceso_id, setup_horas, run_horas, requiere_revision
    )
    SELECT v_pitem_id, (o.ord)::integer, o.proceso_id, 0, 0, false
    FROM (
      SELECT o.proceso_id, row_number() OVER (ORDER BY o.orden, o.id) AS ord
      FROM public.rfq_item_operaciones AS o
      WHERE o.rfq_item_id = v_item.id
    ) AS o;
  END LOOP;

  IF v_rfq.proxima_accion_codigo IS NOT NULL THEN
    INSERT INTO public.propuesta_revision_acciones (
      revision_id, codigo, texto_otro, fecha, responsable_id, creado_por
    ) VALUES (
      v_revision_id, v_rfq.proxima_accion_codigo, v_rfq.proxima_accion_texto,
      v_rfq.fecha_proxima_accion, v_rfq.responsable_proxima_accion_id, p_actor
    );
  END IF;

  UPDATE public.pipeline AS p
  SET estado_rfq = 'CONVERTED'
  WHERE p.id = p_rfq_id;

  INSERT INTO public.rfq_eventos (
    rfq_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
  ) VALUES (
    p_rfq_id, 'READY_FOR_PROPOSAL', 'CONVERTED', 'crear_propuesta', p_actor, p_correlation_id
  );

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
  ) VALUES (
    v_revision_id, NULL, 'DRAFT', 'crear_propuesta', p_actor, p_correlation_id
  );

  RETURN jsonb_build_object(
    'propuestaId', v_propuesta_id,
    'propuestaFolio', v_folio,
    'revisionId', v_revision_id,
    'revisionFolio', v_folio_revision,
    'letra', 'A',
    'items', v_items,
    'yaExistia', false
  );
END;
$$;

COMMENT ON FUNCTION public.crear_propuesta(uuid, uuid, uuid) IS
  'SII-B4.2/4.3: crea propuesta + revisión A DRAFT desde un RFQ LISTO, copia ítems/operaciones y convierte el RFQ (RFQ CONVERTED). Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_propuesta(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_propuesta(uuid, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Nueva revisión B..Z (copia profunda, motivo obligatorio, tope Z)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_nueva_revision(
  p_revision_origen uuid,
  p_motivo text,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen public.propuesta_revisiones%ROWTYPE;
  v_propuesta public.propuestas%ROWTYPE;
  v_draft record;
  v_letra text;
  v_folio text;
  v_revision_id uuid;
  v_item record;
  v_nuevo_item_id uuid;
  v_accion record;
  v_costo record;
  v_motivo text;
  v_creados integer := 0;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_crear_revision') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  v_motivo := btrim(COALESCE(p_motivo, ''));
  IF char_length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  SELECT * INTO v_origen
  FROM public.propuesta_revisiones
  WHERE id = p_revision_origen;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_propuesta
  FROM public.propuestas
  WHERE id = v_origen.propuesta_id
  FOR UPDATE;

  SELECT * INTO v_origen
  FROM public.propuesta_revisiones
  WHERE id = p_revision_origen
  FOR UPDATE;

  -- Idempotencia bajo lock: si ya hay un borrador en la propuesta, se devuelve.
  SELECT r.id, r.letra, r.folio_revision, r.propuesta_id
  INTO v_draft
  FROM public.propuesta_revisiones AS r
  WHERE r.propuesta_id = v_origen.propuesta_id AND r.estado = 'DRAFT'
  ORDER BY r.letra
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'revisionId', v_draft.id,
      'letra', v_draft.letra,
      'folioRevision', v_draft.folio_revision,
      'propuestaId', v_draft.propuesta_id,
      'requiereRevisionRuteo', false,
      'requiereRevisionCosteo', false,
      'yaExistia', true
    );
  END IF;

  IF v_origen.estado NOT IN ('SENT', 'FOLLOW_UP', 'ACCEPTED') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514',
      DETAIL = v_origen.estado;
  END IF;

  SELECT max(r.letra) INTO v_letra
  FROM public.propuesta_revisiones AS r
  WHERE r.propuesta_id = v_propuesta.id;

  IF v_letra IS NULL OR v_letra >= 'Z' THEN
    RAISE EXCEPTION 'limite_revisiones_alcanzado' USING ERRCODE = '23514';
  END IF;
  v_letra := chr(ascii(v_letra) + 1);

  v_folio := v_propuesta.folio_cnc || '-' || v_letra;

  INSERT INTO public.propuesta_revisiones (
    propuesta_id, letra, folio_revision, estado, motivo_creacion,
    snapshot_cabecera, creado_por
  ) VALUES (
    v_propuesta.id, v_letra, v_folio, 'DRAFT', v_motivo,
    v_origen.snapshot_cabecera, p_actor
  )
  RETURNING id INTO v_revision_id;

  -- Copia profunda: ítems, operaciones, ruteo y costos.
  FOR v_item IN
    SELECT * FROM public.propuesta_items
    WHERE revision_id = v_origen.id
    ORDER BY codigo
  LOOP
    INSERT INTO public.propuesta_items (
      revision_id, rfq_item_id, codigo, descripcion, cantidad,
      material_id, espesor_id, acabado, notas, precio_unitario, es_descuento, activo
    ) VALUES (
      v_revision_id, v_item.rfq_item_id, v_item.codigo, v_item.descripcion, v_item.cantidad,
      v_item.material_id, v_item.espesor_id, v_item.acabado, v_item.notas,
      v_item.precio_unitario, v_item.es_descuento, v_item.activo
    )
    RETURNING id INTO v_nuevo_item_id;
    v_creados := v_creados + 1;

    INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
    SELECT v_nuevo_item_id, o.proceso_id, o.orden
    FROM public.propuesta_item_operaciones AS o
    WHERE o.item_id = v_item.id;

    INSERT INTO public.propuesta_item_ruteo (
      item_id, secuencia, proceso_id, grupo_equipo_id, grupo_planeado_id,
      setup_horas, run_horas, requiere_revision
    )
    SELECT v_nuevo_item_id, rt.secuencia, rt.proceso_id, rt.grupo_equipo_id, rt.grupo_planeado_id,
           rt.setup_horas, rt.run_horas, false
    FROM public.propuesta_item_ruteo AS rt
    WHERE rt.item_id = v_item.id;
  END LOOP;

  FOR v_costo IN
    SELECT * FROM public.propuesta_revision_costos WHERE revision_id = v_origen.id
  LOOP
    INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto, nota)
    VALUES (v_revision_id, v_costo.categoria, v_costo.monto, v_costo.nota);
  END LOOP;

  -- Copia la última próxima acción conocida (histórico por revisión).
  SELECT * INTO v_accion
  FROM public.propuesta_revision_acciones
  WHERE revision_id = v_origen.id
  ORDER BY creado_en DESC, id DESC
  LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.propuesta_revision_acciones (
      revision_id, codigo, texto_otro, fecha, responsable_id, canal, nota, creado_por
    ) VALUES (
      v_revision_id, v_accion.codigo, v_accion.texto_otro, v_accion.fecha,
      v_accion.responsable_id, v_accion.canal, v_accion.nota, p_actor
    );
  END IF;

  UPDATE public.propuestas
  SET estado = 'DRAFT', revision_vigente_id = v_revision_id
  WHERE id = v_propuesta.id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    v_revision_id, NULL, 'DRAFT', 'crear_nueva_revision', v_motivo, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object(
    'propuestaId', v_propuesta.id,
    'revisionId', v_revision_id,
    'letra', v_letra,
    'folioRevision', v_folio,
    'items', v_creados,
    'requiereRevisionRuteo', false,
    'requiereRevisionCosteo', false,
    'yaExistia', false
  );
END;
$$;

COMMENT ON FUNCTION public.crear_nueva_revision(uuid, text, uuid, uuid) IS
  'SII-B4.3: crea la revisión siguiente (B..Z) copiando el snapshot completo con motivo obligatorio. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_nueva_revision(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nueva_revision(uuid, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Edición de ítem DRAFT (CAS + permisos de artículo/precio)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.editar_item_propuesta(
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
  v_item public.propuesta_items%ROWTYPE;
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_esperado timestamptz;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_material_id uuid;
  v_espesor_id uuid;
  v_acabado text;
  v_notas text;
  v_activo boolean;
  v_es_descuento boolean;
  v_toca_precio boolean;
  v_toca_articulo boolean;
  v_material public.catalogo_materiales%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_toca_precio := p_datos ? 'precio_unitario';
  v_toca_articulo :=
    (p_datos ? 'descripcion') OR (p_datos ? 'cantidad') OR (p_datos ? 'material_id')
    OR (p_datos ? 'espesor_id') OR (p_datos ? 'acabado') OR (p_datos ? 'notas')
    OR (p_datos ? 'activo') OR (p_datos ? 'es_descuento');

  IF v_toca_precio AND NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_precio') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501', DETAIL = 'precio';
  END IF;
  IF v_toca_articulo AND NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_articulo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501', DETAIL = 'articulo';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  -- Descubrir la revisión sin lock y luego bloquear en el orden documentado.
  SELECT r.* INTO v_revision
  FROM public.propuesta_revisiones AS r
  JOIN public.propuesta_items AS i ON i.revision_id = r.id
  WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = v_revision.id FOR UPDATE;

  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  SELECT * INTO v_item FROM public.propuesta_items
  WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  IF v_item.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'item_desactualizado' USING ERRCODE = '23514';
  END IF;

  -- Valores resultantes (los ausentes se conservan).
  v_descripcion := CASE WHEN p_datos ? 'descripcion'
    THEN btrim(COALESCE(privado.json_texto(p_datos, 'descripcion'), '')) ELSE v_item.descripcion END;
  IF char_length(v_descripcion) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'item_descripcion_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'cantidad' THEN
    v_cantidad := privado.json_numero(p_datos, 'cantidad');
  ELSE
    v_cantidad := v_item.cantidad;
  END IF;
  IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 1000000000
     OR v_cantidad <> round(v_cantidad, 2) THEN
    RAISE EXCEPTION 'item_cantidad_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'precio_unitario' THEN
    v_precio := privado.json_numero(p_datos, 'precio_unitario');
  ELSE
    v_precio := v_item.precio_unitario;
  END IF;
  IF v_precio IS NULL OR v_precio < 0 OR v_precio > 1000000000 THEN
    RAISE EXCEPTION 'item_precio_invalido' USING ERRCODE = '22023';
  END IF;

  v_material_id := CASE WHEN p_datos ? 'material_id'
    THEN privado.json_uuid(p_datos, 'material_id') ELSE v_item.material_id END;
  v_espesor_id := CASE WHEN p_datos ? 'espesor_id'
    THEN privado.json_uuid(p_datos, 'espesor_id') ELSE v_item.espesor_id END;

  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_material FROM public.catalogo_materiales AS m WHERE m.id = v_material_id;
    IF NOT FOUND OR NOT v_material.activo THEN
      RAISE EXCEPTION 'material_invalido' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.catalogo_espesores AS e WHERE e.material_id = v_material_id AND e.activo)
       AND v_espesor_id IS NULL THEN
      RAISE EXCEPTION 'espesor_requerido' USING ERRCODE = '22023';
    END IF;
    IF v_espesor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.id = v_espesor_id AND e.material_id = v_material_id AND e.activo
    ) THEN
      RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_espesor_id IS NOT NULL THEN
    RAISE EXCEPTION 'espesor_sin_material' USING ERRCODE = '22023';
  END IF;

  v_acabado := CASE WHEN p_datos ? 'acabado'
    THEN NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'acabado'), '')), '')
    ELSE v_item.acabado END;
  IF v_acabado IS NOT NULL AND char_length(v_acabado) > 120 THEN
    RAISE EXCEPTION 'item_acabado_invalido' USING ERRCODE = '22023';
  END IF;

  v_notas := CASE WHEN p_datos ? 'notas'
    THEN NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'notas'), '')), '')
    ELSE v_item.notas END;
  IF v_notas IS NOT NULL AND char_length(v_notas) > 2000 THEN
    RAISE EXCEPTION 'item_notas_invalidas' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'activo' AND jsonb_typeof(p_datos->'activo') <> 'boolean' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'activo';
  END IF;
  v_activo := CASE WHEN p_datos ? 'activo'
    THEN (p_datos->>'activo')::boolean ELSE v_item.activo END;

  IF p_datos ? 'es_descuento' AND jsonb_typeof(p_datos->'es_descuento') <> 'boolean' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'es_descuento';
  END IF;
  v_es_descuento := CASE WHEN p_datos ? 'es_descuento'
    THEN (p_datos->>'es_descuento')::boolean ELSE v_item.es_descuento END;

  UPDATE public.propuesta_items
  SET descripcion = v_descripcion,
      cantidad = v_cantidad,
      material_id = v_material_id,
      espesor_id = v_espesor_id,
      acabado = v_acabado,
      notas = v_notas,
      precio_unitario = v_precio,
      es_descuento = v_es_descuento,
      activo = v_activo
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  -- Cambios de alcance respecto al predecesor marcan "Requiere revisión".
  PERFORM privado.b4_marcar_requiere_revision(p_item_id);

  -- Mantiene el CAS de la revisión al día para las siguientes acciones.
  UPDATE public.propuesta_revisiones
  SET actualizado_en = now()
  WHERE id = v_revision.id;

  RETURN to_jsonb(v_item);
END;
$$;

COMMENT ON FUNCTION public.editar_item_propuesta(uuid, jsonb, uuid, uuid) IS
  'SII-B4.5: edita un ítem DRAFT con CAS y permisos de artículo/precio; marca "Requiere revisión" si cambió el alcance. Solo service_role.';

REVOKE ALL ON FUNCTION public.editar_item_propuesta(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_item_propuesta(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Ruteo de un ítem (reemplazo completo en DRAFT; confirma "Requiere revisión")
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.editar_ruteo_item(
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
  v_item public.propuesta_items%ROWTYPE;
  v_esperado timestamptz;
  v_filas jsonb;
  v_fila jsonb;
  v_proceso_id uuid;
  v_grupo_equipo uuid;
  v_grupo_planeado uuid;
  v_setup numeric;
  v_run numeric;
  v_secuencia integer := 0;
  v_creadas integer := 0;
  v_flag boolean;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_ruteo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR jsonb_typeof(p_datos->'filas') <> 'array' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_revision
  FROM public.propuesta_revisiones AS r
  JOIN public.propuesta_items AS i ON i.revision_id = r.id
  WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = v_revision.id FOR UPDATE;

  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  SELECT * INTO v_item FROM public.propuesta_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Validación completa antes de reemplazar (una carga inválida no borra nada).
  FOR v_fila IN SELECT e.value FROM jsonb_array_elements(p_datos->'filas') AS e(value) LOOP
    IF jsonb_typeof(v_fila) <> 'object' THEN
      RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'filas';
    END IF;
    v_proceso_id := privado.json_uuid(v_fila, 'proceso_id');
    IF v_proceso_id IS NULL THEN
      RAISE EXCEPTION 'ruteo_proceso_requerido' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.catalogo_procesos AS p WHERE p.id = v_proceso_id AND p.activo) THEN
      RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
    END IF;

    v_grupo_equipo := privado.json_uuid(v_fila, 'grupo_equipo_id');
    v_grupo_planeado := privado.json_uuid(v_fila, 'grupo_planeado_id');
    IF v_grupo_equipo IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.grupos_equipo AS g WHERE g.id = v_grupo_equipo
    ) THEN
      RAISE EXCEPTION 'grupo_equipo_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_grupo_planeado IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.grupos_planeados AS g WHERE g.id = v_grupo_planeado
    ) THEN
      RAISE EXCEPTION 'grupo_planeado_invalido' USING ERRCODE = '22023';
    END IF;

    v_setup := COALESCE(privado.json_numero(v_fila, 'setup_horas'), 0);
    v_run := COALESCE(privado.json_numero(v_fila, 'run_horas'), 0);
    IF v_setup < 0 OR v_setup > 10000 OR v_run < 0 OR v_run > 100000 THEN
      RAISE EXCEPTION 'ruteo_horas_invalidas' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.propuesta_item_ruteo WHERE item_id = p_item_id;

  FOR v_fila IN SELECT e.value FROM jsonb_array_elements(p_datos->'filas') AS e(value) LOOP
    v_secuencia := v_secuencia + 1;
    INSERT INTO public.propuesta_item_ruteo (
      item_id, secuencia, proceso_id, grupo_equipo_id, grupo_planeado_id,
      setup_horas, run_horas, requiere_revision
    ) VALUES (
      p_item_id,
      v_secuencia,
      privado.json_uuid(v_fila, 'proceso_id'),
      privado.json_uuid(v_fila, 'grupo_equipo_id'),
      privado.json_uuid(v_fila, 'grupo_planeado_id'),
      COALESCE(privado.json_numero(v_fila, 'setup_horas'), 0),
      COALESCE(privado.json_numero(v_fila, 'run_horas'), 0),
      false
    );
    v_creadas := v_creadas + 1;
  END LOOP;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_ruteo = EXISTS (
        SELECT 1
        FROM public.propuesta_item_ruteo AS rt
        JOIN public.propuesta_items AS i ON i.id = rt.item_id
        WHERE i.revision_id = v_revision.id AND rt.requiere_revision
      ),
      actualizado_en = now()
  WHERE id = v_revision.id
  RETURNING requiere_revision_ruteo INTO v_flag;

  RETURN jsonb_build_object(
    'itemId', p_item_id,
    'filas', v_creadas,
    'requiereRevisionRuteo', v_flag
  );
END;
$$;

COMMENT ON FUNCTION public.editar_ruteo_item(uuid, jsonb, uuid, uuid) IS
  'SII-B4.5/4.9: reemplaza el ruteo estimado de un ítem DRAFT (confirma las filas y recalcula "Requiere revisión"). Solo service_role.';

REVOKE ALL ON FUNCTION public.editar_ruteo_item(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_ruteo_item(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Costos internos de la revisión (reemplazo por categoría en DRAFT)
-- -----------------------------------------------------------------------------
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

  DELETE FROM public.propuesta_revision_costos WHERE revision_id = p_revision_id;

  FOR v_costo IN SELECT e.value FROM jsonb_array_elements(p_datos->'costos') AS e(value) LOOP
    v_categoria := privado.json_texto(v_costo, 'categoria');
    v_monto := privado.json_numero(v_costo, 'monto');
    v_nota := NULLIF(btrim(COALESCE(privado.json_texto(v_costo, 'nota'), '')), '');
    INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto, nota)
    VALUES (p_revision_id, v_categoria, v_monto, v_nota);
    v_total := v_total + v_monto;
    v_creados := v_creados + 1;
  END LOOP;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_costeo = false,
      actualizado_en = now()
  WHERE id = p_revision_id;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'categorias', v_creados,
    'costoTotal', round(v_total, 4)
  );
END;
$$;

COMMENT ON FUNCTION public.editar_costos_revision(uuid, jsonb, uuid, uuid) IS
  'SII-B4.5: reemplaza el costeo interno por categoría en DRAFT y confirma "Requiere revisión de costeo". Solo service_role.';

REVOKE ALL ON FUNCTION public.editar_costos_revision(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_costos_revision(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Seguimiento: próxima acción del catálogo (histórico por revisión)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_seguimiento_propuesta(
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
  v_codigo text;
  v_texto_otro text;
  v_fecha date;
  v_responsable uuid;
  v_canal text;
  v_nota text;
  v_es_otro boolean;
  v_nuevo_estado text;
  v_accion_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_seguimiento') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  v_codigo := privado.json_texto(p_datos, 'codigo');
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'proxima_accion_requerida' USING ERRCODE = '22023';
  END IF;
  SELECT pa.es_otro INTO v_es_otro
  FROM public.catalogo_proximas_acciones AS pa
  WHERE pa.codigo = v_codigo AND pa.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proxima_accion_invalida' USING ERRCODE = '22023';
  END IF;

  v_texto_otro := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'texto_otro'), '')), '');
  IF v_es_otro AND (v_texto_otro IS NULL OR char_length(v_texto_otro) NOT BETWEEN 3 AND 300) THEN
    RAISE EXCEPTION 'texto_otro_requerido' USING ERRCODE = '22023';
  END IF;

  v_fecha := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'fecha'), '')), '')::date;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_proxima_accion_requerida' USING ERRCODE = '22023';
  END IF;

  v_responsable := COALESCE(privado.json_uuid(p_datos, 'responsable_id'), p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.usuarios AS u WHERE u.id = v_responsable AND u.activo) THEN
    RAISE EXCEPTION 'responsable_invalido' USING ERRCODE = '22023';
  END IF;

  v_canal := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'canal'), '')), '');
  IF v_canal IS NOT NULL AND char_length(v_canal) > 60 THEN
    RAISE EXCEPTION 'canal_invalido' USING ERRCODE = '22023';
  END IF;
  v_nota := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'nota'), '')), '');
  IF v_nota IS NOT NULL AND char_length(v_nota) > 1000 THEN
    RAISE EXCEPTION 'nota_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado NOT IN ('DRAFT', 'SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  INSERT INTO public.propuesta_revision_acciones (
    revision_id, codigo, texto_otro, fecha, responsable_id, canal, nota, creado_por
  ) VALUES (
    p_revision_id, v_codigo, v_texto_otro, v_fecha, v_responsable, v_canal, v_nota, p_actor
  )
  RETURNING id INTO v_accion_id;

  v_nuevo_estado := CASE WHEN v_revision.estado = 'SENT' THEN 'FOLLOW_UP' ELSE v_revision.estado END;

  UPDATE public.propuesta_revisiones
  SET estado = v_nuevo_estado,
      actualizado_en = now()
  WHERE id = p_revision_id;

  IF v_nuevo_estado <> v_revision.estado THEN
    UPDATE public.propuestas
    SET estado = v_nuevo_estado, revision_vigente_id = p_revision_id
    WHERE id = v_revision.propuesta_id;

    INSERT INTO public.propuesta_revision_eventos (
      revision_id, estado_anterior, estado_nuevo, accion, canal, motivo, actor_id, correlation_id
    ) VALUES (
      p_revision_id, v_revision.estado, v_nuevo_estado, 'registrar_seguimiento',
      v_canal, v_nota, p_actor, p_correlation_id
    );
  END IF;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'accionId', v_accion_id,
    'estado', v_nuevo_estado
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) IS
  'SII-B4.6: registra la próxima acción de la revisión (DRAFT queda en DRAFT, SENT pasa a FOLLOW_UP). Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Validación de la revisión (→ READY_TO_SEND)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_revision(
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
  v_faltantes text[] := '{}';
  v_activos integer;
  v_item record;
  v_detalle jsonb;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_validar') THEN
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
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  IF v_revision.requiere_revision_ruteo THEN
    v_faltantes := array_append(v_faltantes, 'confirmar ruteo (Requiere revisión)');
  END IF;
  IF v_revision.requiere_revision_costeo THEN
    v_faltantes := array_append(v_faltantes, 'confirmar costeo (Requiere revisión)');
  END IF;

  SELECT count(*) INTO v_activos
  FROM public.propuesta_items AS i
  WHERE i.revision_id = p_revision_id AND i.activo;

  IF v_activos = 0 THEN
    v_faltantes := array_append(v_faltantes, 'al menos un ítem activo');
  END IF;

  FOR v_item IN
    SELECT i.codigo FROM public.propuesta_items AS i
    WHERE i.revision_id = p_revision_id AND i.activo
      AND NOT EXISTS (SELECT 1 FROM public.propuesta_item_ruteo AS rt WHERE rt.item_id = i.id)
    ORDER BY i.codigo
  LOOP
    v_faltantes := array_append(v_faltantes, 'ítem ' || v_item.codigo || ': ruteo estimado');
  END LOOP;

  IF cardinality(v_faltantes) > 0 THEN
    v_detalle := jsonb_build_object(
      'revisionId', p_revision_id,
      'faltantes', to_jsonb(v_faltantes),
      'requiereRevisionRuteo', v_revision.requiere_revision_ruteo,
      'requiereRevisionCosteo', v_revision.requiere_revision_costeo
    );
    RAISE EXCEPTION 'requiere_revision_pendiente' USING ERRCODE = '23514', DETAIL = v_detalle::text;
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'READY_TO_SEND',
      validada_en = now(),
      validada_por = p_actor,
      actualizado_en = now()
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'READY_TO_SEND', revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
  ) VALUES (
    p_revision_id, 'DRAFT', 'READY_TO_SEND', 'validar_revision', p_actor, p_correlation_id
  );

  RETURN jsonb_build_object('revisionId', p_revision_id, 'estado', 'READY_TO_SEND');
END;
$$;

COMMENT ON FUNCTION public.validar_revision(uuid, jsonb, uuid, uuid) IS
  'SII-B4.4/4.9: valida la revisión DRAFT (→READY_TO_SEND); bloquea con `requiere_revision_pendiente` y detalle si falta confirmar ruteo/costeo o completar ítems. Solo service_role.';

REVOKE ALL ON FUNCTION public.validar_revision(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_revision(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. Rechazo y cierre (motivo obligatorio, historia conservada)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rechazar_propuesta(
  p_revision_id uuid,
  p_motivo text,
  p_actualizado_en timestamptz,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_motivo text;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_cerrar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  v_motivo := btrim(COALESCE(p_motivo, ''));
  IF char_length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado NOT IN ('DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF p_actualizado_en IS NULL OR v_revision.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'REJECTED', actualizado_en = now()
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'REJECTED', revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    p_revision_id, v_revision.estado, 'REJECTED', 'rechazar_propuesta',
    v_motivo, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object('revisionId', p_revision_id, 'estado', 'REJECTED');
END;
$$;

COMMENT ON FUNCTION public.rechazar_propuesta(uuid, text, timestamptz, uuid, uuid) IS
  'SII-B4.10: rechaza una revisión con motivo obligatorio y CAS; conserva la historia. Solo service_role.';

REVOKE ALL ON FUNCTION public.rechazar_propuesta(uuid, text, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_propuesta(uuid, text, timestamptz, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cerrar_propuesta(
  p_revision_id uuid,
  p_motivo text,
  p_actualizado_en timestamptz,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_motivo text;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_cerrar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  v_motivo := btrim(COALESCE(p_motivo, ''));
  IF char_length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado NOT IN ('DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF p_actualizado_en IS NULL OR v_revision.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'CLOSED', actualizado_en = now()
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'CLOSED', revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    p_revision_id, v_revision.estado, 'CLOSED', 'cerrar_propuesta',
    v_motivo, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object('revisionId', p_revision_id, 'estado', 'CLOSED');
END;
$$;

COMMENT ON FUNCTION public.cerrar_propuesta(uuid, text, timestamptz, uuid, uuid) IS
  'SII-B4.10: cierra una propuesta con motivo obligatorio y CAS; conserva la historia. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_propuesta(uuid, text, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_propuesta(uuid, text, timestamptz, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 10. Aceptación de la revisión exacta y confirmación de venta
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aceptar_revision(
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
  v_canal text;
  v_destino text;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_aceptar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  v_canal := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'canal'), '')), '');
  v_destino := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'destino'), '')), '');

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado NOT IN ('SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'ACCEPTED', actualizado_en = now()
  WHERE id = p_revision_id;

  -- La revisión aceptada es explícita: puede ser anterior a la última.
  UPDATE public.propuestas
  SET estado = 'ACCEPTED',
      accepted_revision_id = p_revision_id,
      revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, canal, destino, actor_id, correlation_id
  ) VALUES (
    p_revision_id, v_revision.estado, 'ACCEPTED', 'aceptar_revision',
    v_canal, v_destino, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'estado', 'ACCEPTED',
    'acceptedRevisionId', p_revision_id
  );
END;
$$;

COMMENT ON FUNCTION public.aceptar_revision(uuid, jsonb, uuid, uuid) IS
  'SII-B4.10: acepta la revisión exacta (SENT/FOLLOW_UP) y fija accepted_revision_id; puede ser anterior a la última. Solo service_role.';

REVOKE ALL ON FUNCTION public.aceptar_revision(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aceptar_revision(uuid, jsonb, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirmar_venta(
  p_revision_id uuid,
  p_actualizado_en timestamptz,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_aceptar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF p_actualizado_en IS NULL OR v_revision.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.propuestas AS p
    WHERE p.id = v_revision.propuesta_id AND p.accepted_revision_id = p_revision_id
  ) THEN
    RAISE EXCEPTION 'revision_no_aceptada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'SALE_CONFIRMED', actualizado_en = now()
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'SALE_CONFIRMED', revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
  ) VALUES (
    p_revision_id, 'ACCEPTED', 'SALE_CONFIRMED', 'confirmar_venta', p_actor, p_correlation_id
  );

  RETURN jsonb_build_object('revisionId', p_revision_id, 'estado', 'SALE_CONFIRMED');
END;
$$;

COMMENT ON FUNCTION public.confirmar_venta(uuid, timestamptz, uuid, uuid) IS
  'SII-B4.10: confirma la venta sobre la revisión aceptada (SALE_CONFIRMED) y habilita la orden (B5). Solo service_role.';

REVOKE ALL ON FUNCTION public.confirmar_venta(uuid, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_venta(uuid, timestamptz, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 11. Totales y margen (lectura; espejo TS `calcularTotalesPropuesta`)
--     Redondeo documentado: montos a 2 decimales, margen a 4.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_totales_revision(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_iva_porcentaje numeric;
  v_bruto numeric := 0;
  v_descuento numeric := 0;
  v_subtotal numeric;
  v_iva numeric;
  v_total numeric;
  v_costo numeric := 0;
  v_margen numeric;
BEGIN
  SELECT * INTO v_revision FROM public.propuesta_revisiones WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  v_iva_porcentaje := COALESCE((v_revision.snapshot_cabecera->>'iva_porcentaje')::numeric, 16);

  SELECT
    COALESCE(sum(i.cantidad * i.precio_unitario) FILTER (WHERE NOT i.es_descuento), 0),
    COALESCE(sum(i.cantidad * i.precio_unitario) FILTER (WHERE i.es_descuento), 0)
  INTO v_bruto, v_descuento
  FROM public.propuesta_items AS i
  WHERE i.revision_id = p_revision_id AND i.activo;

  v_subtotal := round(v_bruto - v_descuento, 2);
  v_iva := round(v_subtotal * v_iva_porcentaje / 100, 2);
  v_total := round(v_subtotal + v_iva, 2);

  SELECT COALESCE(sum(c.monto), 0) INTO v_costo
  FROM public.propuesta_revision_costos AS c
  WHERE c.revision_id = p_revision_id;

  v_margen := CASE
    WHEN v_subtotal = 0 THEN NULL
    ELSE round((v_subtotal - v_costo) / v_subtotal, 4)
  END;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'moneda', COALESCE(v_revision.snapshot_cabecera->>'moneda', 'MXN'),
    'bruto', round(v_bruto, 2),
    'descuento', round(v_descuento, 2),
    'subtotal', v_subtotal,
    'ivaPorcentaje', v_iva_porcentaje,
    'iva', v_iva,
    'total', v_total,
    'costoTotal', round(v_costo, 4),
    'margen', v_margen
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_totales_revision(uuid) IS
  'SII-B4.5: subtotal (ítems activos menos descuentos), IVA, total y margen (null si subtotal 0). Solo service_role.';

REVOKE ALL ON FUNCTION public.calcular_totales_revision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_totales_revision(uuid) TO service_role;
