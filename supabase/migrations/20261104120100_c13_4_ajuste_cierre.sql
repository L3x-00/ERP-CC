-- C13.4 - Ajuste del cierre integrado: la función de cierre original devuelve
-- una TABLE, no jsonb. Se redefine para asignarla con SELECT INTO y serializar
-- el resultado en la respuesta compuesta.

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

REVOKE ALL ON FUNCTION public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_integrada(uuid, jsonb, uuid, numeric, numeric, text, uuid)
  TO service_role;
