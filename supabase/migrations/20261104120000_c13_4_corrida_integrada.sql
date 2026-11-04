-- =============================================================================
-- C13.4 - Corrida integrada: varios ítems en una sola sesión, con avance y
-- tiempos independientes por ítem.
--
-- La sesión sigue perteneciendo a una partida (la principal). Los ítems extra
-- se validan contra la misma corrida y su avance se registra en la misma
-- transacción del cierre: si algo falla, no queda avance parcial.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sesion_item_tiempos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL
    REFERENCES public.sesiones_trabajo (id) ON DELETE CASCADE,
  partida_id uuid NOT NULL
    REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  piezas numeric(14, 4) NOT NULL DEFAULT 0 CHECK (piezas >= 0),
  minutos numeric(10, 2) NOT NULL CHECK (minutos > 0 AND minutos <= 1440),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sesion_id, partida_id)
);

COMMENT ON TABLE public.sesion_item_tiempos IS
  'C13.4: piezas y minutos declarados por ítem en una corrida integrada; no sustituye registros_avance_partida.';

CREATE INDEX IF NOT EXISTS idx_sesion_item_tiempos_sesion
  ON public.sesion_item_tiempos (sesion_id);

ALTER TABLE public.sesion_item_tiempos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sesion_item_tiempos_seleccionar ON public.sesion_item_tiempos;
CREATE POLICY sesion_item_tiempos_seleccionar
  ON public.sesion_item_tiempos FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

REVOKE ALL PRIVILEGES ON TABLE public.sesion_item_tiempos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sesion_item_tiempos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.sesion_item_tiempos TO service_role;

-- -----------------------------------------------------------------------------
-- Ítems de una corrida con su avance, para armar la captura integrada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_items_corrida(
  p_corrida_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  codigo_pieza text,
  meta_proceso_id uuid,
  cantidad_solicitada numeric,
  cantidad_producida numeric,
  disponible numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_corrida_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS usuario
    WHERE usuario.id = p_actor_id AND usuario.activo = true
  ) AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT partida.id, partida.codigo_pieza, item.meta_proceso_id,
    partida.cantidad_solicitada, partida.cantidad_producida,
    privado.piezas_disponibles_proceso(item.meta_proceso_id)
  FROM public.corrida_items AS item
  JOIN public.partidas_orden_produccion AS partida ON partida.id = item.partida_id
  WHERE item.corrida_id = p_corrida_id
  ORDER BY partida.codigo_pieza;
END;
$$;

COMMENT ON FUNCTION public.obtener_items_corrida(uuid, uuid) IS
  'C13.4: ítems de la corrida con avance y disponibilidad para la captura integrada.';

-- -----------------------------------------------------------------------------
-- Cierre integrado: avance de los ítems extra + cierre de la sesión principal.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_sesion_integrada(
  p_sesion_id uuid,
  p_items jsonb,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_notas text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_calculo record;
  v_item record;
  v_total_items integer := 0;
  v_piezas_principal numeric := NULL;
  v_total_minutos numeric := 0;
  v_cierre record;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL OR p_material_id IS NULL THEN
    RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_cierre_integrado' USING ERRCODE = '42501';
  END IF;
  IF v_sesion.corrida_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_calculo
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now());

  FOR v_item IN
    SELECT fila.partida_id, fila.piezas, fila.minutos
    FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
  LOOP
    IF v_item.partida_id IS NULL OR v_item.minutos IS NULL OR v_item.minutos <= 0
       OR v_item.piezas IS NULL OR v_item.piezas < 0 THEN
      RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS corrida_item
      WHERE corrida_item.corrida_id = v_sesion.corrida_id
        AND corrida_item.partida_id = v_item.partida_id
    ) THEN
      RAISE EXCEPTION 'item_fuera_de_corrida' USING ERRCODE = '23514';
    END IF;
    IF v_item.partida_id = v_sesion.partida_id THEN
      v_piezas_principal := v_item.piezas;
    END IF;
    v_total_items := v_total_items + 1;
    v_total_minutos := v_total_minutos + v_item.minutos;
  END LOOP;

  IF v_piezas_principal IS NULL THEN
    RAISE EXCEPTION 'item_principal_requerido' USING ERRCODE = '23514';
  END IF;
  IF v_total_items > 1
     AND v_total_minutos > greatest(coalesce(v_calculo.horas_netas, 0) * 60, 1) THEN
    RAISE EXCEPTION 'minutos_exceden_sesion' USING ERRCODE = '23514';
  END IF;

  -- Primero el avance de los ítems extra; si el cierre falla, la transacción
  -- completa se revierte y no queda avance parcial.
  FOR v_item IN
    SELECT fila.partida_id, fila.piezas, fila.minutos
    FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
    WHERE fila.partida_id <> v_sesion.partida_id
  LOOP
    IF v_item.piezas > 0 THEN
      PERFORM public.registrar_avance_partida_op(
        v_item.partida_id, v_sesion.operador_id, v_item.piezas, 0);
    END IF;
  END LOOP;

  INSERT INTO public.sesion_item_tiempos (sesion_id, partida_id, piezas, minutos)
  SELECT p_sesion_id, fila.partida_id, fila.piezas, fila.minutos
  FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
  ON CONFLICT (sesion_id, partida_id) DO UPDATE
    SET piezas = EXCLUDED.piezas, minutos = EXCLUDED.minutos;

  SELECT * INTO v_cierre
  FROM public.cerrar_sesion_con_consumo_operador(
    p_sesion_id, v_sesion.operador_id, v_piezas_principal, p_material_id,
    p_cantidad_usada, p_cantidad_scrap, NULL, p_notas);

  SELECT jsonb_agg(jsonb_build_object(
    'partida_id', tiempo.partida_id,
    'piezas', tiempo.piezas,
    'minutos', tiempo.minutos
  ) ORDER BY tiempo.partida_id)
  INTO v_items
  FROM public.sesion_item_tiempos AS tiempo
  WHERE tiempo.sesion_id = p_sesion_id;

  RETURN jsonb_build_object('cierre', to_jsonb(v_cierre), 'items', coalesce(v_items, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid) IS
  'C13.4: cierra una corrida integrada en una transacción; registra avance y tiempos por ítem.';

-- -----------------------------------------------------------------------------
-- Lectura administrativa de tiempos por sesión integrada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_tiempos_integrados_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  sesion_id uuid,
  fecha_inicio timestamptz,
  operador_nombre text,
  partida_id uuid,
  codigo_pieza text,
  piezas numeric,
  minutos numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_cierre_integrado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT tiempo.sesion_id, sesion.fecha_inicio,
    coalesce(usuario.nombre_completo, 'Operador'),
    tiempo.partida_id, partida.codigo_pieza, tiempo.piezas, tiempo.minutos
  FROM public.sesion_item_tiempos AS tiempo
  JOIN public.sesiones_trabajo AS sesion ON sesion.id = tiempo.sesion_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = tiempo.partida_id
  LEFT JOIN public.usuarios AS usuario ON usuario.id = sesion.operador_id
  WHERE sesion.orden_id = p_orden_id
    AND EXISTS (
      SELECT 1 FROM public.sesion_item_tiempos AS hermano
      WHERE hermano.sesion_id = tiempo.sesion_id
      GROUP BY hermano.sesion_id
      HAVING count(*) > 1
    )
  ORDER BY sesion.fecha_inicio DESC, partida.codigo_pieza;
END;
$$;

COMMENT ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid) IS
  'C13.4: sesiones con más de un ítem y sus tiempos por ítem.';

REVOKE ALL ON FUNCTION public.obtener_items_corrida(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_items_corrida(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid) TO service_role;
