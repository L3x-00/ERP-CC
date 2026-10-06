-- =============================================================================
-- SII-B4.7/4.8 — PDF por revisión y envío atómico (ADR-SII-04)
-- Plan: docs/plan-erp-sii/04-propuestas.md §4.7 (PDF y envío), §4.8 (archivos)
-- Documento del cliente: §10.5 (PDF y entorno), §10.6 (archivos), §6 (integridad)
--
-- Entrega:
--   * bucket privado `propuestas-pdf` con límites de tamaño/MIME
--   * `registrar_pdf_revision`: registro idempotente por (revisión, hash) con
--     único vigente por revisión (trigger de versionado de la ola 1)
--   * `enviar_revision`: exige READY_TO_SEND + PDF vigente + canal + destino +
--     próxima acción, pasa a SENT y congela en la misma transacción
-- Aditiva e idempotente. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias (A 0610* → B3 0710* → B4 0711* )
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.propuesta_pdfs') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007110001_sii_b4_propuestas_base antes';
  END IF;
  IF to_regclass('public.archivos') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261005100003_sii_b1_archivos antes';
  END IF;
  IF to_regprocedure('privado.actor_con_permiso(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100003_sii_b3_rfq_acciones antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Buckets privados de la propuesta
--    - `propuestas-pdf`: PDFs por revisión (solo application/pdf)
--    - `propuestas-archivos`: adjuntos propios de la revisión (perfil técnico)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('propuestas-pdf', 'propuestas-pdf', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'propuestas-pdf';

INSERT INTO storage.buckets (id, name, public)
VALUES ('propuestas-archivos', 'propuestas-archivos', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/octet-stream',
      'image/vnd.dxf', 'application/dxf', 'application/acad', 'image/vnd.dwg',
      'application/step', 'model/step', 'application/iges', 'model/iges',
      'application/postscript', 'application/illustrator', 'application/eps',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'propuestas-archivos';

-- -----------------------------------------------------------------------------
-- 2. Registro idempotente del PDF de una revisión
--    - Solo revisiones READY_TO_SEND (plan §4.7.1)
--    - Idempotente por (revision_id, contenido_hash): mismo contenido ⇒ mismo PDF
--    - El trigger de la ola 1 desmarca el vigente anterior y encadena reemplaza_a
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pdf_revision(
  p_revision_id uuid,
  p_archivo_id uuid,
  p_contenido_hash text,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_archivo public.archivos%ROWTYPE;
  v_hash text;
  v_pdf public.propuesta_pdfs%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_generar_pdf') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  v_hash := btrim(COALESCE(p_contenido_hash, ''));
  IF char_length(v_hash) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'pdf_hash_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_archivo_id IS NULL THEN
    RAISE EXCEPTION 'pdf_archivo_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones
  WHERE id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'READY_TO_SEND' THEN
    RAISE EXCEPTION 'revision_no_apta_pdf' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;

  SELECT * INTO v_archivo FROM public.archivos WHERE id = p_archivo_id;
  IF NOT FOUND
     OR v_archivo.vigente IS NOT TRUE
     OR v_archivo.entidad <> 'propuesta_revision'
     OR v_archivo.entidad_id <> p_revision_id
     OR v_archivo.bucket <> 'propuestas-pdf'
     OR lower(v_archivo.clase) <> 'pdf' THEN
    RAISE EXCEPTION 'pdf_archivo_invalido' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia: mismo contenido ⇒ se devuelve el PDF ya registrado.
  SELECT * INTO v_pdf
  FROM public.propuesta_pdfs
  WHERE revision_id = p_revision_id AND contenido_hash = v_hash
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'pdfId', v_pdf.id,
      'version', v_pdf.version,
      'vigente', v_pdf.vigente,
      'yaExistia', true
    );
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  INSERT INTO public.propuesta_pdfs (
    revision_id, archivo_id, contenido_hash, generado_por
  ) VALUES (
    p_revision_id, p_archivo_id, v_hash, p_actor
  )
  RETURNING * INTO v_pdf;

  RETURN jsonb_build_object(
    'pdfId', v_pdf.id,
    'version', v_pdf.version,
    'vigente', v_pdf.vigente,
    'yaExistia', false
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_pdf_revision(uuid, uuid, text, uuid, uuid) IS
  'SII-B4.7: registra el PDF de una revisión READY_TO_SEND, idempotente por hash y con único vigente. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_pdf_revision(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pdf_revision(uuid, uuid, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Envío atómico: READY_TO_SEND + PDF vigente + canal + destino + próxima acción
--    Pasa la revisión (y su propuesta espejo) a SENT y congela en la misma
--    transacción; cualquier fallo no deja cambios.
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
  'SII-B4.7: envía la revisión READY_TO_SEND con PDF vigente/canal/destino/próxima acción y congela atómicamente. Solo service_role.';

REVOKE ALL ON FUNCTION public.enviar_revision(uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_revision(uuid, text, text, uuid, uuid) TO service_role;
