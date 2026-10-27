-- =============================================================================
-- Corrección operativa: iniciar una corrida debe iniciar la orden completa.
--
-- La corrida es la primera evidencia persistida de ejecución. Antes de este
-- ajuste, `iniciar_corrida` dejaba la OP en PLANIFICADA/programada hasta que
-- alguien abría una sesión; Producción, Órdenes y Planeación leían la orden y
-- quedaban desfasadas aun con la corrida EN_PROCESO.
--
-- Se conserva la autorización, el checklist y los grants de la RPC. El orden
-- se bloquea antes de la corrida, conforme al contrato de locks, y se deriva a
-- EN_PRODUCCION en la misma transacción. No se toca `programacion_areas`: una
-- corrida administrativa no asigna por sí misma un recurso ni capacidad.
-- Aplicar solo localmente; el remoto queda bajo control del PO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.iniciar_corrida(
  p_corrida_id uuid,
  p_verificacion jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_corrida public.corridas%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'produccion_operar')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;
  IF NOT privado.verificacion_inicio_completa(p_verificacion) THEN
    RAISE EXCEPTION 'verificacion_inicio_incompleta' USING ERRCODE = '22023';
  END IF;

  -- Descubrir la OP sin lock y después tomar locks en el orden global:
  -- orden → corrida. La corrida se relee bajo lock antes de cambiarla.
  SELECT corrida.orden_id INTO v_orden_id
  FROM public.corridas AS corrida
  WHERE corrida.id = p_corrida_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
  FOR UPDATE;
  IF NOT FOUND OR v_orden.estado_sii NOT IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION') THEN
    RAISE EXCEPTION 'orden_no_iniciable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_corrida
  FROM public.corridas AS corrida
  WHERE corrida.id = p_corrida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_corrida.orden_id <> v_orden.id THEN
    RAISE EXCEPTION 'corrida_orden_inconsistente' USING ERRCODE = '23514';
  END IF;
  IF v_corrida.estado NOT IN ('PLANIFICADA', 'PAUSADA') THEN
    RAISE EXCEPTION 'corrida_no_iniciable' USING ERRCODE = '23514';
  END IF;

  PERFORM privado.iniciar_corrida_interna(p_corrida_id);

  -- El puente SII mantiene `estado` legacy como `en_proceso`, que es lo que
  -- consume el Kanban histórico y las vistas de Producción.
  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'EN_PRODUCCION',
      fecha_inicio = coalesce(orden.fecha_inicio, now())
  WHERE orden.id = v_orden.id;

  RETURN jsonb_build_object('id', p_corrida_id, 'estado', 'EN_PROCESO');
END;
$$;

COMMENT ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) IS
  'SII-B6.2: inicia una corrida con checklist completo y deriva la OP a EN_PRODUCCION. Solo service_role.';

REVOKE ALL ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) TO service_role;
