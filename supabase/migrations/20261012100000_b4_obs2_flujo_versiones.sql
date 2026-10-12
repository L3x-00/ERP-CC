-- =============================================================================
-- Obs. cliente 2026-10-12 — Flujo de versiones y aceptación de propuestas
--
--   1. «Crear nueva versión» solo desde revisiones ENVIADAS (SENT/FOLLOW_UP):
--      en READY_TO_SEND se edita con `reabrir_revision` (vuelve a DRAFT, con
--      motivo y evento; el PDF vigente se invalida para regenerarlo).
--   2. Una propuesta aceptada ya no admite más versiones ni aceptaciones:
--      `propuesta_ya_aceptada` en crear_nueva_revision, aceptar_revision,
--      validar_revision, registrar_seguimiento_propuesta, enviar_revision,
--      rechazar_propuesta y cerrar_propuesta (las demás versiones quedan como
--      historial de solo lectura).
--   3. La aceptación dispara el intento de Orden sin depender de `orden_liberar`
--      del actor: `procesar_solicitud_orden` y `crear_orden_desde_revision`
--      aceptan `orden_liberar` o `propuesta_aceptar` (el reintento manual desde
--      la UI sigue exigiendo `orden_liberar` en la Server Action).
--
-- Aditiva: CREATE OR REPLACE conserva firmas, permisos y el resto del
-- comportamiento. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Crear nueva versión: solo desde ENVIADAS y nunca tras la aceptación
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

  -- Obs. cliente 2026-10-12: la propuesta aceptada ya no admite versiones
  -- nuevas; las demás revisiones quedan solo como historial.
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
  END IF;

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

  -- Obs. cliente 2026-10-12: una versión nueva solo nace de una revisión ya
  -- enviada al cliente; «Lista para enviar» se edita con reabrir_revision.
  IF v_origen.estado NOT IN ('SENT', 'FOLLOW_UP') THEN
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
  'SII-B4.3 + obs. cliente 2026-10-12: crea la revisión siguiente (B..Z) copiando el snapshot completo; solo SENT y FOLLOW_UP son orígenes válidos y una propuesta aceptada no admite versiones nuevas. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. Reabrir una revisión LISTA PARA ENVIAR (botón «Editar»)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reabrir_revision(
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
  v_propuesta public.propuestas%ROWTYPE;
  v_esperado timestamptz;
  v_motivo text;
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

  v_motivo := btrim(COALESCE(p_datos->>'motivo', ''));
  IF char_length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'READY_TO_SEND' THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
  END IF;

  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'DRAFT',
      validada_en = NULL,
      validada_por = NULL,
      actualizado_en = now()
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'DRAFT', revision_vigente_id = p_revision_id
  WHERE id = v_propuesta.id;

  -- El PDF validado queda obsoleto: al reeditar hay que regenerarlo antes de
  -- volver a enviar (enviar_revision exige un PDF vigente).
  UPDATE public.propuesta_pdfs
  SET vigente = false
  WHERE revision_id = p_revision_id AND vigente;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    p_revision_id, 'READY_TO_SEND', 'DRAFT', 'reabrir_revision', v_motivo, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object('revisionId', p_revision_id, 'estado', 'DRAFT');
END;
$$;

COMMENT ON FUNCTION public.reabrir_revision(uuid, jsonb, uuid, uuid) IS
  'Obs. cliente 2026-10-12: devuelve una revisión READY_TO_SEND a DRAFT con motivo, invalida el PDF vigente y registra el evento (botón «Editar»). Solo service_role.';

REVOKE ALL ON FUNCTION public.reabrir_revision(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_revision(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Validar: bloqueado si la propuesta ya fue aceptada
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
  v_propuesta public.propuestas%ROWTYPE;
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

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
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
  'SII-B4.4/4.9 + obs. cliente 2026-10-12: valida la revisión DRAFT (→READY_TO_SEND); bloquea si la propuesta ya fue aceptada. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 4. Seguimiento: bloqueado si la propuesta ya fue aceptada (historial)
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
  v_propuesta public.propuestas%ROWTYPE;
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
  -- READY_TO_SEND incluido: la próxima acción es requisito para enviar.
  IF v_revision.estado NOT IN ('DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
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
    'accionId', v_accion_id,
    'estado', v_nuevo_estado,
    'actualizadoEn', (SELECT actualizado_en FROM public.propuesta_revisiones WHERE id = p_revision_id)
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) IS
  'SII-B4.6 + obs. cliente 2026-10-12: registra la próxima acción (DRAFT/READY_TO_SEND se conservan, SENT→FOLLOW_UP); bloqueado si la propuesta ya fue aceptada. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 5. Enviar: bloqueado si la propuesta ya fue aceptada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enviar_revision(
  p_revision_id uuid,
  p_canal text,
  p_destino text,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_propuesta public.propuestas%ROWTYPE;
  v_canal text;
  v_destino text;
  v_enviado_en timestamptz;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_enviar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  v_canal := btrim(COALESCE(p_canal, ''));
  IF char_length(v_canal) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'canal_requerido' USING ERRCODE = '22023';
  END IF;
  v_destino := btrim(COALESCE(p_destino, ''));
  IF char_length(v_destino) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'destino_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones
  WHERE id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'READY_TO_SEND' THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.propuesta_pdfs
    WHERE revision_id = p_revision_id AND vigente
  ) THEN
    RAISE EXCEPTION 'pdf_requerido' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.propuesta_revision_acciones
    WHERE revision_id = p_revision_id
  ) THEN
    RAISE EXCEPTION 'proxima_accion_requerida' USING ERRCODE = '23514';
  END IF;

  v_enviado_en := now();

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'SENT',
      canal_envio = v_canal,
      destino_envio = v_destino,
      enviado_en = v_enviado_en,
      enviado_por = p_actor,
      actualizado_en = v_enviado_en
  WHERE id = p_revision_id;

  UPDATE public.propuestas
  SET estado = 'SENT', revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, canal, destino, actor_id, correlation_id
  ) VALUES (
    p_revision_id, 'READY_TO_SEND', 'SENT', 'enviar_revision',
    v_canal, v_destino, p_actor, p_correlation_id
  );

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'estado', 'SENT',
    'canal', v_canal,
    'destino', v_destino,
    'enviadoEn', v_enviado_en
  );
END;
$$;

COMMENT ON FUNCTION public.enviar_revision(uuid, text, text, uuid, uuid) IS
  'SII-B4.7 + obs. cliente 2026-10-12: envía la revisión READY_TO_SEND con PDF vigente/canal/destino/próxima acción; bloqueado si la propuesta ya fue aceptada. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 6. Rechazo y cierre: bloqueados si la propuesta ya fue aceptada
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
  v_propuesta public.propuestas%ROWTYPE;
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

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
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
  'SII-B4.10 + obs. cliente 2026-10-12: rechaza una revisión con motivo; bloqueado si la propuesta ya fue aceptada. Solo service_role.';

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
  v_propuesta public.propuestas%ROWTYPE;
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

  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
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
  'SII-B4.10 + obs. cliente 2026-10-12: cierra una propuesta con motivo; bloqueado si la propuesta ya fue aceptada. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 7. Aceptación única por propuesta
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
  v_propuesta public.propuestas%ROWTYPE;
  v_esperado timestamptz;
  v_canal text;
  v_destino text;
  v_fecha_compromiso date;
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

  -- C4.1/DC-09: la fecha compromiso comercial se confirma al aceptar.
  BEGIN
    v_fecha_compromiso := NULLIF(btrim(COALESCE(p_datos->>'fecha_compromiso_comercial', '')), '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'fecha_compromiso_invalida' USING ERRCODE = '22023';
  END;
  IF v_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = '22023';
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

  -- Obs. cliente 2026-10-12: la propuesta se acepta una sola vez; después las
  -- demás revisiones quedan solo como historial.
  SELECT * INTO v_propuesta FROM public.propuestas
  WHERE id = v_revision.propuesta_id FOR UPDATE;
  IF v_propuesta.accepted_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'propuesta_ya_aceptada' USING ERRCODE = '23514';
  END IF;

  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'ACCEPTED', fecha_compromiso_comercial = v_fecha_compromiso, actualizado_en = now()
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

  -- Misma transacción: solicitud durable y única de Orden para esta revisión.
  INSERT INTO public.solicitudes_orden (revision_id, propuesta_id, fecha_compromiso_comercial, creado_por)
  VALUES (p_revision_id, v_revision.propuesta_id, v_fecha_compromiso, p_actor)
  ON CONFLICT (revision_id) DO NOTHING;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'estado', 'ACCEPTED',
    'acceptedRevisionId', p_revision_id,
    'fechaCompromisoComercial', v_fecha_compromiso,
    'solicitudOrden', 'PENDING'
  );
END;
$$;

COMMENT ON FUNCTION public.aceptar_revision(uuid, jsonb, uuid, uuid) IS
  'SII-B4.10 + C4.1 + obs. cliente 2026-10-12: acepta la revisión exacta (puede ser anterior) una sola vez por propuesta y crea la solicitud única de Orden. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 8. Orden automática al aceptar: la aceptación autoriza el intento
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_solicitud_orden(
  p_revision_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_solicitud public.solicitudes_orden%ROWTYPE;
  v_orden record;
  v_codigo text;
  v_detalle text;
BEGIN
  -- Obs. cliente 2026-10-12: la aceptación dispara el intento automático, así
  -- que `propuesta_aceptar` también habilita procesar; el reintento manual
  -- desde la UI sigue exigiendo `orden_liberar` en la Server Action.
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'orden_liberar')
    OR privado.actor_con_permiso(p_actor_id, 'propuesta_aceptar')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_solicitud FROM public.solicitudes_orden AS s
  WHERE s.revision_id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_orden_inexistente' USING ERRCODE = '22023';
  END IF;

  IF v_solicitud.estado = 'CREATED' THEN
    RETURN (
      SELECT jsonb_build_object('estado', 'CREATED', 'ordenId', o.id, 'folio', o.folio,
        'folioSii', o.folio_sii, 'yaExistia', true)
      FROM public.ordenes_produccion AS o WHERE o.id = v_solicitud.orden_id
    );
  END IF;

  BEGIN
    SELECT * INTO v_orden
    FROM public.crear_orden_desde_revision(p_revision_id, p_actor_id, p_correlation_id);

    UPDATE public.solicitudes_orden
    SET estado = 'CREATED', orden_id = v_orden.id, causa_codigo = NULL, causa_detalle = NULL,
        intentos = intentos + 1, ultimo_intento_por = p_actor_id, actualizado_en = now()
    WHERE id = v_solicitud.id;

    RETURN jsonb_build_object('estado', 'CREATED', 'ordenId', v_orden.id, 'folio', v_orden.folio,
      'folioSii', v_orden.folio_sii, 'yaExistia', v_orden.ya_existia);
  EXCEPTION WHEN others THEN
    -- El intento fallido se revierte completo (subtransacción); la aceptación
    -- y la solicitud permanecen, con la causa para reintentar.
    GET STACKED DIAGNOSTICS v_codigo = MESSAGE_TEXT, v_detalle = PG_EXCEPTION_DETAIL;
    UPDATE public.solicitudes_orden
    SET estado = 'BLOCKED', causa_codigo = left(v_codigo, 120), causa_detalle = left(v_detalle, 2000),
        intentos = intentos + 1, ultimo_intento_por = p_actor_id, actualizado_en = now()
    WHERE id = v_solicitud.id;
    RETURN jsonb_build_object('estado', 'BLOCKED', 'causa', left(v_codigo, 120), 'detalle', v_detalle);
  END;
END;
$$;

COMMENT ON FUNCTION public.procesar_solicitud_orden(uuid, uuid, uuid) IS
  'C4.1/DC-09 + obs. cliente 2026-10-12: crea (o recupera) la Orden de una solicitud; acepta actores con orden_liberar o propuesta_aceptar (intento automático tras aceptar). Idempotente. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 9. Crear orden desde revisión: mismo permiso dual (building block interno)
-- -----------------------------------------------------------------------------
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
  -- Obs. cliente 2026-10-12: el intento automático tras aceptar usa el actor
  -- que aceptó (propuesta_aceptar); el reintento manual exige orden_liberar.
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'orden_liberar')
    OR privado.actor_con_permiso(p_actor_id, 'propuesta_aceptar')
  ) THEN
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
  'SII-B5.1/ADR-SII-03 + C3.1 + obs. cliente 2026-10-12: orden idempotente desde la revisión aceptada con snapshot congelado; acepta actores con orden_liberar o propuesta_aceptar. Solo service_role.';
