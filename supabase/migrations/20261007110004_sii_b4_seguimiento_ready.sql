-- =============================================================================
-- SII-B4.6 (ajuste) — Próxima acción también en READY_TO_SEND
--
-- El diálogo de envío exige "registrar la próxima acción antes de enviar"
-- (enviar_revision valida que exista), pero el RPC solo permitía
-- DRAFT/SENT/FOLLOW_UP, dejando el envío imposible de preparar desde la UI.
-- Se agrega READY_TO_SEND: la revisión permanece en su estado; SENT→FOLLOW_UP
-- se mantiene.
-- Idempotente: CREATE OR REPLACE.
-- =============================================================================

DO $$ BEGIN
  IF to_regclass('public.propuesta_revision_acciones') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007110001_sii_b4_propuestas_base antes';
  END IF;
END $$;

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
  -- READY_TO_SEND incluido: la próxima acción es requisito para enviar.
  IF v_revision.estado NOT IN ('DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP') THEN
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
    'accionId', v_accion_id,
    'estado', v_nuevo_estado,
    'actualizadoEn', (SELECT actualizado_en FROM public.propuesta_revisiones WHERE id = p_revision_id)
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) IS
  'SII-B4.6: registra la próxima acción (DRAFT/READY_TO_SEND se conservan, SENT→FOLLOW_UP). Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_seguimiento_propuesta(uuid, jsonb, uuid, uuid) TO service_role;
