-- =============================================================================
-- Migración: ORD-05 — edición de órdenes únicamente en `borrador`, con
-- compare-and-set sobre `actualizado_en`. ORCA MFG ERP — Órdenes.
--
-- Decisión (19-sep): la cabecera y las partidas se editan solo mientras la OP
-- está en `borrador`; una orden que ya arrancó se corrige por cancelar y
-- reemplazar (D-01/D-06). La RPC:
--   * bloquea la orden con FOR UPDATE y exige el token `actualizado_en` leído
--     por la pantalla (optimistic locking) antes de escribir;
--   * preserva los ids de las partidas existentes (así la asignación de
--     operador no se pierde), y rechaza eliminar una partida con historial de
--     piso o con operador asignado;
--   * valida cantidades, material y prioridad con los mismos criterios que
--     `crear_orden_produccion`;
--   * no toca históricos de sesiones, consumos ni avances.
--
-- No requiere columnas nuevas. La aplica el PO. Solo `service_role`; la
-- auditoría la agrega la Server Action.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.actualizar_orden_borrador(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_prioridad text,
  p_fecha_compromiso timestamptz,
  p_partidas jsonb
)
RETURNS TABLE (
  id uuid,
  folio text,
  estado text,
  prioridad text,
  fecha_compromiso timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_actualizado_en IS NULL THEN
    RAISE EXCEPTION 'solicitud_edicion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_prioridad IS NULL OR p_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_partidas IS NULL
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0 THEN
    RAISE EXCEPTION 'partidas_requeridas' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_partidas) AS elemento(partida)
    WHERE jsonb_typeof(elemento.partida) <> 'object'
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS partida(
      codigo_pieza text,
      cantidad_solicitada numeric,
      unidad_medida text,
      tiempo_estimado_minutos numeric,
      material_id uuid
    )
    WHERE nullif(btrim(partida.codigo_pieza), '') IS NULL
       OR partida.cantidad_solicitada IS NULL
       OR partida.cantidad_solicitada <= 0
       OR nullif(btrim(partida.unidad_medida), '') IS NULL
       OR coalesce(partida.tiempo_estimado_minutos, 0) < 0
       OR (
            partida.material_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.materiales AS material WHERE material.id = partida.material_id
            )
          )
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'check_violation';
  END IF;

  IF v_orden.estado <> 'borrador' THEN
    RAISE EXCEPTION 'orden_no_editable' USING ERRCODE = 'check_violation';
  END IF;

  IF v_orden.actualizado_en <> p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS enviada(id uuid)
    WHERE enviada.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.partidas_orden_produccion AS existente
        WHERE existente.id = enviada.id
          AND existente.orden_id = p_orden_id
      )
  ) THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS enviada(id uuid, cantidad_solicitada numeric)
      ON enviada.id = partida.id
    WHERE partida.orden_id = p_orden_id
      AND enviada.cantidad_solicitada < partida.cantidad_producida
  ) THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
  END IF;

  -- Retirar una partida solo es posible sin historial de piso ni asignación.
  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.id NOT IN (
        SELECT enviada.id
        FROM jsonb_to_recordset(p_partidas) AS enviada(id uuid)
        WHERE enviada.id IS NOT NULL
      )
      AND (
        partida.operador_asignado_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.registros_tiempo_operador AS registro
          WHERE registro.partida_id = partida.id
        )
        OR EXISTS (
          SELECT 1 FROM public.registros_consumo_material AS consumo
          WHERE consumo.partida_id = partida.id
        )
        OR EXISTS (
          SELECT 1 FROM public.registros_avance_partida AS avance
          WHERE avance.partida_id = partida.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'partida_con_historial' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.partidas_orden_produccion AS destino
  SET codigo_pieza = enviada.codigo_pieza,
      descripcion = nullif(btrim(coalesce(enviada.descripcion, '')), ''),
      cantidad_solicitada = enviada.cantidad_solicitada,
      unidad_medida = enviada.unidad_medida,
      material_id = enviada.material_id,
      tiempo_estimado_minutos = coalesce(enviada.tiempo_estimado_minutos, 0),
      maquina_asignada = nullif(btrim(coalesce(enviada.maquina_asignada, '')), '')
  FROM jsonb_to_recordset(p_partidas) AS enviada(
    id uuid,
    codigo_pieza text,
    descripcion text,
    cantidad_solicitada numeric,
    unidad_medida text,
    material_id uuid,
    tiempo_estimado_minutos numeric,
    maquina_asignada text
  )
  WHERE enviada.id IS NOT NULL
    AND destino.id = enviada.id
    AND destino.orden_id = p_orden_id;

  DELETE FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
    AND partida.id NOT IN (
      SELECT enviada.id
      FROM jsonb_to_recordset(p_partidas) AS enviada(id uuid)
      WHERE enviada.id IS NOT NULL
    );

  INSERT INTO public.partidas_orden_produccion (
    orden_id,
    codigo_pieza,
    descripcion,
    cantidad_solicitada,
    unidad_medida,
    material_id,
    tiempo_estimado_minutos,
    maquina_asignada
  )
  SELECT
    p_orden_id,
    nueva.codigo_pieza,
    nullif(btrim(coalesce(nueva.descripcion, '')), ''),
    nueva.cantidad_solicitada,
    nueva.unidad_medida,
    nueva.material_id,
    coalesce(nueva.tiempo_estimado_minutos, 0),
    nullif(btrim(coalesce(nueva.maquina_asignada, '')), '')
  FROM jsonb_to_recordset(p_partidas) AS nueva(
    id uuid,
    codigo_pieza text,
    descripcion text,
    cantidad_solicitada numeric,
    unidad_medida text,
    material_id uuid,
    tiempo_estimado_minutos numeric,
    maquina_asignada text
  )
  WHERE nueva.id IS NULL;

  UPDATE public.ordenes_produccion AS orden
  SET prioridad = p_prioridad,
      fecha_compromiso = p_fecha_compromiso
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  SELECT orden.id, orden.folio, orden.estado, orden.prioridad, orden.fecha_compromiso, orden.actualizado_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.actualizar_orden_borrador(uuid, timestamptz, text, timestamptz, jsonb) IS
  'ORD-05: edita cabecera y partidas de una OP en borrador con FOR UPDATE y CAS sobre actualizado_en; preserva partidas con historial o asignación. Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_orden_borrador(uuid, timestamptz, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_orden_borrador(uuid, timestamptz, text, timestamptz, jsonb)
  TO service_role;
