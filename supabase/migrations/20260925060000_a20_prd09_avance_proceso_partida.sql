-- A20/PRD-09: avance acumulado por pareja partida×proceso sobre las metas de
-- ORD-07. Cada operación intermedia acumula en su propia meta sin alterar las
-- piezas físicas finales de la partida; el camino histórico sin metas conserva
-- la regla de última secuencia y el conteo global de piezas.
ALTER TABLE public.registros_avance_partida
  ADD COLUMN IF NOT EXISTS meta_proceso_id uuid
    REFERENCES public.metas_proceso_partida (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_registros_avance_partida_meta
  ON public.registros_avance_partida (meta_proceso_id)
  WHERE meta_proceso_id IS NOT NULL;

-- Las vías que solo conocen piezas físicas (avance de piso, importaciones
-- administrativas) atribuyen el registro a la meta final. Las sesiones que
-- eligen un proceso explícito no son tocadas.
CREATE OR REPLACE FUNCTION public.asignar_meta_final_avance_partida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.meta_proceso_id IS NULL THEN
    SELECT meta.id
    INTO NEW.meta_proceso_id
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = NEW.partida_id
    ORDER BY meta.secuencia DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_asignar_meta_final_avance_partida
  ON public.registros_avance_partida;
CREATE TRIGGER trigger_asignar_meta_final_avance_partida
  BEFORE INSERT ON public.registros_avance_partida
  FOR EACH ROW EXECUTE FUNCTION public.asignar_meta_final_avance_partida();

-- Una partida con metas está completa solo cuando todas las alcanzaron; una
-- partida histórica sin metas conserva la comparación física de siempre.
CREATE OR REPLACE FUNCTION privado.partida_produccion_completa(p_partida_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = p_partida_id
    ) THEN NOT EXISTS (
      SELECT 1
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = p_partida_id
        AND coalesce((
          SELECT sum(avance.cantidad_producida)
          FROM public.registros_avance_partida AS avance
          WHERE avance.meta_proceso_id = meta.id
        ), 0::numeric) < meta.meta_piezas
    )
    ELSE coalesce((
      SELECT partida.cantidad_producida >= partida.cantidad_solicitada
      FROM public.partidas_orden_produccion AS partida
      WHERE partida.id = p_partida_id
    ), false)
  END;
$$;

CREATE OR REPLACE FUNCTION privado.orden_produccion_completa(p_orden_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND NOT privado.partida_produccion_completa(partida.id)
  );
$$;

REVOKE ALL ON FUNCTION privado.partida_produccion_completa(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.orden_produccion_completa(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- El cierre de sesión acepta la meta trabajada. Los caminos con una sola meta
-- siguen sin exigirla; con varias, la elección explícita es obligatoria.
DROP FUNCTION IF EXISTS public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.cerrar_sesion_trabajo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_estado_destino text,
  p_motivo_pausa text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_meta_proceso_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  horas_brutas numeric,
  horas_netas numeric,
  piezas_producidas numeric,
  cantidad_producida_partida numeric,
  estado_orden text,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_partida_id uuid;
  v_orden_sesion_id uuid;
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
  v_programacion public.programacion_areas%ROWTYPE;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_cantidad_producida_nueva numeric;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_cantidad_metas integer;
  v_es_meta_final boolean := false;
  v_hecho_meta numeric := 0;
  v_partida_completa boolean;
  v_es_ultima_secuencia boolean;
  v_orden_completa boolean;
  v_estado_programacion text;
  v_estado_orden text;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0 OR p_estado_destino NOT IN ('pausada', 'finalizada') THEN
    RAISE EXCEPTION 'cierre_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_estado_destino = 'pausada'
     AND coalesce(nullif(btrim(p_motivo_pausa), ''), '') NOT IN (
       'falta_informacion', 'material_pendiente', 'aprobacion_cliente',
       'problema_tecnico', 'mantenimiento', 'otro'
     ) THEN
    RAISE EXCEPTION 'motivo_pausa_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Lectura sin lock solo para descubrir la partida; el lock real de la sesión
  -- se toma al final, después de partida/orden/programación/recurso.
  SELECT sesion.partida_id, sesion.orden_id
  INTO v_partida_id, v_orden_sesion_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id, partida.cantidad_producida, partida.cantidad_solicitada
  INTO v_orden_id, v_operador_asignado_id, v_cantidad_producida_actual, v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id
  FOR UPDATE;
  IF NOT FOUND OR v_orden_id <> v_orden_sesion_id THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_sesion_id AND orden.estado = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.rol = 'operador' AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = (
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_sesion_id
    AND programacion.estado_planeacion = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Recién aquí se bloquea la sesión; se revalida contra lo leído sin lock.
  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'activa'
     OR v_sesion.partida_id IS DISTINCT FROM v_partida_id
     OR v_sesion.orden_id IS DISTINCT FROM v_orden_sesion_id THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.programacion_areas AS posterior
    WHERE posterior.partida_id = v_sesion.partida_id
      AND posterior.secuencia > v_programacion.secuencia
      AND posterior.estado_planeacion <> 'cancelada'
  ) INTO v_es_ultima_secuencia;

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = v_sesion.partida_id;

  IF v_cantidad_metas > 0 THEN
    -- Con metas, cada operación acumula en su propia pareja partida×proceso y
    -- el tope es la meta elegida, no la cantidad física final.
    IF p_meta_proceso_id IS NOT NULL THEN
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.id = p_meta_proceso_id AND meta.partida_id = v_sesion.partida_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
      ORDER BY meta.secuencia DESC
      LIMIT 1
      FOR UPDATE;
    END IF;

    v_es_meta_final := v_meta.secuencia = (
      SELECT max(meta.secuencia) FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
    );
    SELECT coalesce(sum(avance.cantidad_producida), 0)
    INTO v_hecho_meta
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_piezas_producidas > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;

    -- Solo la última operación entrega las piezas físicas que se despachan.
    v_cantidad_producida_nueva := v_cantidad_producida_actual
      + CASE WHEN v_es_meta_final THEN p_piezas_producidas ELSE 0 END;
  ELSE
    IF v_cantidad_producida_actual + p_piezas_producidas > v_cantidad_solicitada THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    IF p_piezas_producidas > 0 AND v_es_ultima_secuencia = false THEN
      RAISE EXCEPTION 'produccion_solo_ultima_secuencia' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_producida_nueva := v_cantidad_producida_actual + p_piezas_producidas;
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET
    fecha_fin = now(), horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
    piezas_producidas = p_piezas_producidas,
    motivo_pausa = CASE WHEN p_estado_destino = 'pausada' THEN nullif(btrim(p_motivo_pausa), '') ELSE NULL END,
    notas = nullif(btrim(p_notas), ''), estado_sesion = p_estado_destino
  WHERE sesion.id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id, meta_proceso_id
    ) VALUES (v_sesion.partida_id, p_operador_id, p_piezas_producidas, 0, p_sesion_id, v_meta.id);
  END IF;
  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_producida_nueva,
      tiempo_real_minutos = partida.tiempo_real_minutos + (v_horas_netas * 60)
  WHERE partida.id = v_sesion.partida_id;

  v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);

  IF p_estado_destino = 'pausada' THEN
    v_estado_programacion := 'bloqueada';
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;
  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = v_estado_programacion
  WHERE programacion.id = v_sesion.programacion_id;
  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (
    v_sesion.partida_id, p_operador_id,
    CASE WHEN p_estado_destino = 'pausada' THEN 'pausa' ELSE 'fin' END,
    nullif(btrim(p_notas), '')
  );

  v_orden_completa := privado.orden_produccion_completa(v_sesion.orden_id);
  IF coalesce(v_orden_completa, false) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = now()
    WHERE orden.id = v_sesion.orden_id;
  END IF;
  SELECT orden.estado INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id;

  RETURN QUERY
  SELECT sesion.id, sesion.estado_sesion, sesion.horas_brutas, sesion.horas_netas,
    sesion.piezas_producidas, v_cantidad_producida_nueva, v_estado_orden,
    v_estado_programacion, sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) IS
  'Cierra o pausa una sesión y acumula piezas en la meta del proceso elegido; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid)
  TO service_role;

-- El avance global de piso sigue existiendo para piezas físicas y suma a la meta
-- final, pero la OP solo se completa cuando todas las metas se cumplen.
CREATE OR REPLACE FUNCTION public.registrar_avance_partida_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_cantidad_producida numeric,
  p_cantidad_scrap numeric
)
RETURNS TABLE (
  partida_id uuid,
  cantidad_producida numeric,
  cantidad_scrap numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
  v_meta_final numeric;
BEGIN
  IF p_cantidad_producida IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_producida < 0
     OR p_cantidad_scrap < 0
     OR (p_cantidad_producida + p_cantidad_scrap) <= 0 THEN
    RAISE EXCEPTION 'cantidad_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    partida.orden_id,
    partida.operador_asignado_id,
    partida.cantidad_producida,
    partida.cantidad_solicitada
  INTO
    v_orden_id,
    v_operador_asignado_id,
    v_cantidad_producida_actual,
    v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  IF v_cantidad_producida_actual + p_cantidad_producida > v_cantidad_solicitada THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT meta.meta_piezas INTO v_meta_final
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = p_partida_id
  ORDER BY meta.secuencia DESC
  LIMIT 1;
  IF v_meta_final IS NOT NULL
     AND v_cantidad_producida_actual + p_cantidad_producida > v_meta_final THEN
    RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
  END IF;

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

  INSERT INTO public.registros_avance_partida (
    partida_id,
    operador_id,
    cantidad_producida,
    cantidad_scrap
  )
  VALUES (
    p_partida_id,
    p_operador_id,
    p_cantidad_producida,
    p_cantidad_scrap
  );

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET
    cantidad_producida = partida.cantidad_producida + p_cantidad_producida,
    cantidad_scrap = partida.cantidad_scrap + p_cantidad_scrap
  WHERE partida.id = p_partida_id
  RETURNING
    partida.id,
    partida.cantidad_producida,
    partida.cantidad_scrap,
    partida.actualizado_en;

  IF privado.orden_produccion_completa(v_orden_id) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = coalesce(orden.fecha_fin, now())
    WHERE orden.id = v_orden_id
      AND orden.estado = 'en_proceso';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  TO service_role;
