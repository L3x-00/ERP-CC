-- =============================================================================
-- C2.2 — Próxima acción por transición del RFQ (DC-06, CONTRATOS-CORTE-0 §3.2)
--
--   * Las transiciones no terminales (marcar incompleto, poner en espera del
--     cliente o técnica, marcar listo) exigen `p_args.proxima_accion`
--     {codigo, texto, fecha, responsable_id} y la guardan en la MISMA
--     operación que el estado: si el seguimiento es inválido o la validación
--     LISTO falla, no cambia nada.
--   * Cerrar/cancelar no exigen acción futura: exigen motivo y limpian la
--     próxima acción pendiente (no queda una acción ficticia en agenda).
--   * Permisos, CAS y transiciones válidas se conservan de SII-B3.2.
--
-- Aditiva: misma firma, sin cambios de tabla. Aplicar solo en local.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cambiar_estado_rfq(
  p_rfq_id uuid,
  p_accion text,
  p_args jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permiso text;
  v_estado text;
  v_nuevo text;
  v_actualizado timestamptz;
  v_esperado timestamptz;
  v_motivo text;
  v_validacion jsonb;
  v_proxima jsonb;
  v_codigo text;
  v_texto text;
  v_fecha date;
  v_responsable uuid;
  v_es_otro boolean;
BEGIN
  IF p_accion IS NULL OR p_accion NOT IN (
    'marcar_incompleto', 'poner_en_espera_cliente', 'poner_en_espera_tecnica',
    'marcar_listo', 'cerrar', 'cancelar'
  ) THEN
    RAISE EXCEPTION 'accion_invalida' USING ERRCODE = '22023';
  END IF;

  -- Permiso por acción (admin siempre); el actor debe estar activo.
  v_permiso := CASE p_accion
    WHEN 'marcar_listo' THEN 'rfq_marcar_listo'
    WHEN 'cerrar' THEN 'rfq_cerrar'
    WHEN 'cancelar' THEN 'rfq_cerrar'
    ELSE 'rfq_editar'
  END;
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, v_permiso) THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  IF p_args IS NULL OR jsonb_typeof(p_args) <> 'object' THEN
    RAISE EXCEPTION 'rfq_args_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_args->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  -- Seguimiento de transiciones no terminales: se valida antes de bloquear.
  IF p_accion NOT IN ('cerrar', 'cancelar') THEN
    v_proxima := p_args->'proxima_accion';
    IF v_proxima IS NULL OR jsonb_typeof(v_proxima) <> 'object' THEN
      RAISE EXCEPTION 'proxima_accion_requerida' USING ERRCODE = '22023';
    END IF;

    v_codigo := NULLIF(btrim(COALESCE(v_proxima->>'codigo', '')), '');
    SELECT pa.es_otro INTO v_es_otro
    FROM public.catalogo_proximas_acciones AS pa
    WHERE pa.codigo = v_codigo AND pa.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proxima_accion_invalida' USING ERRCODE = '22023';
    END IF;

    v_texto := NULLIF(btrim(COALESCE(v_proxima->>'texto', '')), '');
    IF v_es_otro AND (v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 3 AND 300) THEN
      RAISE EXCEPTION 'proxima_accion_detalle_requerido' USING ERRCODE = '22023';
    END IF;
    IF NOT v_es_otro THEN
      v_texto := NULL;
    END IF;

    BEGIN
      v_fecha := NULLIF(btrim(COALESCE(v_proxima->>'fecha', '')), '')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'proxima_accion_fecha_invalida' USING ERRCODE = '22023';
    END;
    IF v_fecha IS NULL OR v_fecha < current_date THEN
      RAISE EXCEPTION 'proxima_accion_fecha_invalida' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_responsable := NULLIF(btrim(COALESCE(v_proxima->>'responsable_id', '')), '')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'proxima_accion_responsable_invalido' USING ERRCODE = '22023';
    END;
    IF v_responsable IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.usuarios AS u WHERE u.id = v_responsable AND u.activo
    ) THEN
      RAISE EXCEPTION 'proxima_accion_responsable_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT p.estado_rfq, p.actualizado_en
  INTO v_estado, v_actualizado
  FROM public.pipeline AS p
  WHERE p.id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  IF v_actualizado IS DISTINCT FROM v_esperado THEN
    -- Conflicto de negocio, no condición de carrera reintentable a ciegas.
    RAISE EXCEPTION 'rfq_desactualizado' USING ERRCODE = '23514';
  END IF;

  CASE p_accion
    WHEN 'marcar_incompleto' THEN
      IF v_estado NOT IN ('NEW', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→INCOMPLETE';
      END IF;
      v_nuevo := 'INCOMPLETE';

    WHEN 'poner_en_espera_cliente' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→WAITING_CUSTOMER';
      END IF;
      v_nuevo := 'WAITING_CUSTOMER';

    WHEN 'poner_en_espera_tecnica' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→WAITING_TECHNICAL';
      END IF;
      v_nuevo := 'WAITING_TECHNICAL';

    WHEN 'marcar_listo' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→READY_FOR_PROPOSAL';
      END IF;
      v_nuevo := 'READY_FOR_PROPOSAL';

    WHEN 'cerrar', 'cancelar' THEN
      IF v_estado NOT IN (
        'NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL'
      ) THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→' || p_accion;
      END IF;
      v_motivo := btrim(COALESCE(p_args->>'motivo', ''));
      IF char_length(v_motivo) < 3 OR char_length(v_motivo) > 300 THEN
        RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
      END IF;
      v_nuevo := CASE p_accion WHEN 'cerrar' THEN 'CLOSED' ELSE 'CANCELLED' END;
  END CASE;

  IF v_nuevo IN ('CLOSED', 'CANCELLED') THEN
    -- Estado terminal: sin acción futura pendiente.
    UPDATE public.pipeline AS p
    SET estado_rfq = v_nuevo,
        proxima_accion_codigo = NULL,
        proxima_accion_texto = NULL,
        fecha_proxima_accion = NULL,
        responsable_proxima_accion_id = NULL
    WHERE p.id = p_rfq_id;
  ELSE
    UPDATE public.pipeline AS p
    SET proxima_accion_codigo = v_codigo,
        proxima_accion_texto = v_texto,
        fecha_proxima_accion = v_fecha,
        responsable_proxima_accion_id = v_responsable
    WHERE p.id = p_rfq_id;

    IF v_nuevo = 'READY_FOR_PROPOSAL' THEN
      -- Revalidación en servidor con el seguimiento ya aplicado: si falla, la
      -- excepción revierte también la próxima acción.
      v_validacion := public.validar_rfq_listo(p_rfq_id);
      IF (v_validacion->>'listo')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'rfq_no_listo' USING ERRCODE = '23514',
          DETAIL = v_validacion::text;
      END IF;
    END IF;

    UPDATE public.pipeline AS p
    SET estado_rfq = v_nuevo
    WHERE p.id = p_rfq_id;
  END IF;

  INSERT INTO public.rfq_eventos (
    rfq_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    p_rfq_id, v_estado, v_nuevo, p_accion, v_motivo, p_actor_id, p_correlation_id
  );

  RETURN v_nuevo;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) IS
  'SII-B3.2 + C2.2: única vía de cambio de estado del RFQ; valida permiso, transición y CAS; las transiciones no terminales guardan la próxima acción en la misma operación y las terminales exigen motivo y la limpian. Solo service_role.';

REVOKE ALL ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) TO service_role;
