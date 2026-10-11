-- =============================================================================
-- B4 — «Crear nueva versión» también desde una revisión LISTA PARA ENVIAR
--
-- Observación del Product Owner (2026-10-11): con la propuesta validada
-- (READY_TO_SEND) el botón «Crear nueva versión» quedaba bloqueado y no había
-- forma de ajustar el contenido antes de enviarla (la revisión validada es
-- inmutable para edición directa). Esta migración permite que READY_TO_SEND sea
-- un origen válido de la siguiente versión (B..Z); la revisión original queda en
-- el historial y el borrador nuevo es el que se edita/enviará.
--
-- Aditiva: reemplaza `public.crear_nueva_revision` conservando íntegro el resto
-- del comportamiento (motivo obligatorio, idempotencia si ya hay borrador,
-- copia profunda de ítems/operaciones/ruteo/costos, permiso y lock).
-- Aplicar solo en local hasta autorización del PO.
-- =============================================================================

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

  -- READY_TO_SEND se suma a los orígenes válidos: permite ajustar antes de
  -- enviar sin tocar la revisión validada (queda como historial de solo lectura).
  IF v_origen.estado NOT IN ('READY_TO_SEND', 'SENT', 'FOLLOW_UP', 'ACCEPTED') THEN
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
  'SII-B4.3 + obs. cliente: crea la revisión siguiente (B..Z) copiando el snapshot completo con motivo obligatorio; READY_TO_SEND, SENT, FOLLOW_UP y ACCEPTED son orígenes válidos. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_nueva_revision(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nueva_revision(uuid, text, uuid, uuid) TO service_role;
