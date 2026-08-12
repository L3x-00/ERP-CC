-- =============================================================================
-- Migración: registro de tiempo de operador de Órdenes de Producción — Fase 5.3.
-- Las marcas de piso usan la hora del servidor y solo se aceptan para una OP
-- actualmente en proceso. La comprobación queda en PostgreSQL para no dejar
-- una ventana entre el estado validado y el INSERT.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_tiempo_operador_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_accion text,
  p_notas text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  partida_id uuid,
  operador_id uuid,
  accion text,
  fecha_registro timestamptz,
  notas text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  IF p_accion NOT IN ('inicio', 'pausa', 'fin') THEN
    RAISE EXCEPTION 'accion_tiempo_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Serializa los registros de la misma partida y evita que una partida se
  -- reasigne mientras se valida su orden de producción.
  SELECT partida.orden_id
  INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- El lock de la OP cierra la carrera con una cancelación o terminación: tras
  -- esperar un cambio concurrente, PostgreSQL reevalúa el estado actual.
  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- No se recibe fecha desde el cliente: la marca usa now() del servidor de
  -- base de datos y constituye la fuente auditable de la jornada de piso.
  RETURN QUERY
  INSERT INTO public.registros_tiempo_operador (
    partida_id,
    operador_id,
    accion,
    notas
  )
  VALUES (
    p_partida_id,
    p_operador_id,
    p_accion,
    NULLIF(btrim(p_notas), '')
  )
  RETURNING
    registros_tiempo_operador.id,
    registros_tiempo_operador.partida_id,
    registros_tiempo_operador.operador_id,
    registros_tiempo_operador.accion,
    registros_tiempo_operador.fecha_registro,
    registros_tiempo_operador.notas,
    registros_tiempo_operador.creado_en,
    registros_tiempo_operador.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.registrar_tiempo_operador_op(uuid, uuid, text, text) IS
  'Registra tiempo de un operador activo solo en OP en proceso; usa hora de PostgreSQL. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_tiempo_operador_op(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tiempo_operador_op(uuid, uuid, text, text)
  TO service_role;
