-- -----------------------------------------------------------------------------
-- C30 — El consumo de materia prima pertenece a la primera operación.
--
-- Problema (O-1126_09 / IT02 / DOBLADO_CNC):
--   `privado.partida_requiere_consumo_material` miraba solo la partida. Como
--   una partida con material propio mantiene ese material durante todas sus
--   operaciones, el cierre de una operación POSTERIOR (p. ej. Doblado, que
--   consume piezas del proceso anterior y no lámina) exigía registrar consumo
--   de materia prima. La UI no captura ese consumo para procesos posteriores,
--   así que la sesión quedaba `pausada` y la programación `bloqueada` sin
--   salida: el cierre era imposible y «dejar el consumo para el cierre»
--   terminaba en el mismo bloqueo.
--
-- Corrección:
--   El requisito de materia prima aplica únicamente a la PRIMERA operación de
--   la partida (la que todavía no tiene una meta con secuencia menor). Las
--   operaciones posteriores consumen piezas del proceso previo, que se
--   registran en `registros_avance_partida` al cerrar.
--
--   * `privado.proceso_consume_piezas_previas` responde si una meta tiene una
--     operación anterior en la misma partida.
--   * `privado.partida_requiere_consumo_material_en_proceso` combina el
--     requisito de material de la partida con la posición de la operación.
--   * Se reemplazan el trigger B2 y `actualizar_avance_sesion_pausada` para
--     usar el nuevo criterio. `privado.partida_requiere_consumo_material`
--     conserva su semántica de partida porque el diagnóstico de consistencia
--     sigue necesitando detectar una partida sin consumo real registrado.
--
-- Sin cambios destructivos: funciones `CREATE OR REPLACE`, mismo contrato.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. ¿Esta operación consume piezas de una operación anterior?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.proceso_consume_piezas_previas(p_meta_proceso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.metas_proceso_partida AS actual
    JOIN public.metas_proceso_partida AS previa
      ON previa.partida_id = actual.partida_id
     AND previa.secuencia < actual.secuencia
    WHERE actual.id = p_meta_proceso_id
  );
$$;

COMMENT ON FUNCTION privado.proceso_consume_piezas_previas(uuid) IS
  'C30: true si la operación tiene una meta previa en la misma partida; entonces consume piezas, no materia prima.';

REVOKE ALL ON FUNCTION privado.proceso_consume_piezas_previas(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Requisito de materia prima acotado a la primera operación.
--    Si no se puede resolver la meta, se conserva el criterio de partida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.partida_requiere_consumo_material_en_proceso(
  p_partida_id uuid,
  p_meta_proceso_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT privado.partida_requiere_consumo_material(p_partida_id)
     AND NOT privado.proceso_consume_piezas_previas(
       coalesce(
         p_meta_proceso_id,
         (
           SELECT m.id
           FROM public.metas_proceso_partida AS m
           WHERE m.partida_id = p_partida_id
             AND (SELECT count(*) FROM public.metas_proceso_partida AS total
                  WHERE total.partida_id = p_partida_id) = 1
         )
       )
     );
$$;

COMMENT ON FUNCTION privado.partida_requiere_consumo_material_en_proceso(uuid, uuid) IS
  'C30: exige materia prima solo en la primera operación de la partida; las posteriores consumen piezas del proceso previo.';

REVOKE ALL ON FUNCTION privado.partida_requiere_consumo_material_en_proceso(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Trigger de cierre: resuelve la operación desde la programación.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.validar_consumo_cierre_b2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta_proceso_id uuid;
BEGIN
  IF NEW.estado_sesion = 'finalizada'
     AND OLD.estado_sesion IS DISTINCT FROM 'finalizada'
     -- C23: descartar una sesión vacía no consume material. El requisito de
     -- consumo aplica solo cuando la sesión declaró piezas producidas.
     AND coalesce(NEW.piezas_producidas, 0) > 0 THEN
    SELECT p.meta_proceso_id INTO v_meta_proceso_id
    FROM public.programacion_areas AS p
    WHERE p.id = NEW.programacion_id;

    IF privado.partida_requiere_consumo_material_en_proceso(
         NEW.partida_id, v_meta_proceso_id
       ) THEN
      RAISE EXCEPTION 'consumo_material_requerido' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.validar_consumo_cierre_b2() IS
  'B2/C23/C30: exige materia prima al cerrar con piezas solo en la primera operación; una sesión vacía puede descartarse.';

REVOKE ALL ON FUNCTION privado.validar_consumo_cierre_b2()
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Avance de una pausa: mismo criterio al decidir si puede finalizar.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.actualizar_avance_sesion_pausada(
  p_sesion_id uuid,
  p_actor_id uuid,
  p_piezas_producidas numeric,
  p_horas_reales numeric,
  p_notas text DEFAULT NULL,
  p_material_id uuid DEFAULT NULL,
  p_cantidad_usada numeric DEFAULT 0,
  p_cantidad_scrap numeric DEFAULT 0,
  p_motivo_consumo text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  fecha_fin timestamptz,
  horas_netas numeric,
  piezas_producidas numeric,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_meta_consumo_id uuid;
  v_fecha_fin_real timestamptz;
  v_comida numeric;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_horas_actuales numeric;
  v_cantidad_metas integer;
  v_hecho_meta numeric := 0;
  -- C23: el avance se aplica como delta contra lo ya declarado por la sesión.
  v_piezas_anteriores numeric := 0;
  v_delta_piezas numeric := 0;
  v_es_meta_final boolean := false;
  v_piezas_previas numeric;
  v_cantidad_nueva numeric;
  v_completa boolean := false;
  v_estado_programacion text;
  v_estado_orden text;
  v_corrida_id uuid;
  v_corrida_completa boolean;
  v_avance_id uuid;
  -- C30: finalizar exige consumo realmente asentado, no solo un material_id.
  v_consumo_asentado boolean := false;
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0 OR p_horas_reales IS NULL OR p_horas_reales < 0 THEN
    RAISE EXCEPTION 'actualizacion_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_partida FROM public.partidas_orden_produccion p
  WHERE p.id = v_sesion.partida_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation'; END IF;

  PERFORM 1 FROM public.ordenes_produccion o
  WHERE o.id = v_sesion.orden_id AND o.estado IN ('en_proceso', 'pausada') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden_no_reanudable' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_programacion FROM public.programacion_areas p
  WHERE p.id = v_sesion.programacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found'; END IF;

  -- C30: la operación la define la programación; se usa para saber si esta
  -- sesión consume materia prima (primera operación) o piezas previas.
  v_meta_consumo_id := v_programacion.meta_proceso_id;

  PERFORM 1 FROM public.recursos_planeacion r WHERE r.id = v_programacion.recurso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found'; END IF;

  SELECT * INTO v_sesion FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'pausada' OR v_sesion.sesion_invalida THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = 'check_violation';
  END IF;

  -- Orden cronológico: primero las sesiones antiguas.
  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo s
    WHERE s.programacion_id = v_sesion.programacion_id
      AND s.id <> v_sesion.id
      AND (s.creado_en, s.id) < (v_sesion.creado_en, v_sesion.id)
      AND s.estado_sesion = 'pausada'
      AND NOT s.sesion_invalida
      AND s.pendiente_actualizacion_avance
  ) THEN
    RAISE EXCEPTION 'sesion_antigua_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_actualizar_avance' USING ERRCODE = 'check_violation';
  END IF;

  IF p_horas_reales > (
    SELECT extract(epoch FROM (v_sesion.fecha_fin - v_sesion.fecha_inicio)) / 3600
  ) THEN
    RAISE EXCEPTION 'horas_reales_exceden_sesion' USING ERRCODE = 'check_violation';
  END IF;

  v_fecha_fin_real := v_sesion.fecha_inicio + (p_horas_reales || ' hours')::interval;
  SELECT calculo.horas_brutas - calculo.horas_netas INTO v_comida
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin_real) AS calculo;
  v_fecha_fin_real := v_fecha_fin_real + (coalesce(v_comida, 0) || ' hours')::interval;

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin_real) AS calculo;
  v_horas_netas := p_horas_reales;
  v_horas_actuales := coalesce(v_sesion.horas_netas, 0);

  -- C23: lo que la sesión ya tenía declarado; el cambio real es la diferencia.
  v_piezas_anteriores := coalesce(v_sesion.piezas_producidas, 0);
  v_delta_piezas := p_piezas_producidas - v_piezas_anteriores;

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida m WHERE m.partida_id = v_sesion.partida_id;
  IF v_cantidad_metas > 0 THEN
    SELECT m.* INTO v_meta FROM public.metas_proceso_partida m
    WHERE m.partida_id = v_sesion.partida_id AND m.id = v_programacion.meta_proceso_id;
    IF NOT FOUND THEN
      SELECT m.* INTO v_meta FROM public.metas_proceso_partida m
      WHERE m.partida_id = v_sesion.partida_id ORDER BY m.secuencia DESC LIMIT 1;
    END IF;
    v_es_meta_final := v_meta.secuencia = (
      SELECT max(m.secuencia) FROM public.metas_proceso_partida m WHERE m.partida_id = v_sesion.partida_id);
    SELECT coalesce(sum(a.cantidad_producida), 0) INTO v_hecho_meta
    FROM public.registros_avance_partida a WHERE a.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + v_delta_piezas > v_meta.meta_piezas
       OR v_hecho_meta + v_delta_piezas < 0 THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;
    -- Lo disponible del proceso previo solo limita el crecimiento neto: lo ya
    -- declarado por esta misma sesión no se vuelve a consumir.
    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND v_delta_piezas > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_nueva := v_partida.cantidad_producida
      + CASE WHEN v_es_meta_final THEN v_delta_piezas ELSE 0 END;
    IF v_cantidad_nueva < 0 THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    v_completa := v_hecho_meta + v_delta_piezas >= v_meta.meta_piezas;
  ELSE
    v_cantidad_nueva := v_partida.cantidad_producida + v_delta_piezas;
    IF v_cantidad_nueva > v_partida.cantidad_solicitada OR v_cantidad_nueva < 0 THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    v_completa := v_cantidad_nueva >= v_partida.cantidad_solicitada;
  END IF;

  IF p_piezas_producidas > 0 AND v_sesion.corrida_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.corridas c JOIN public.catalogo_procesos pr ON pr.id = c.proceso_id
      WHERE c.id = v_sesion.corrida_id AND pr.requiere_primera_pieza
    ) AND NOT privado.primera_pieza_aprobada(v_sesion.corrida_id) THEN
      RAISE EXCEPTION 'primera_pieza_pendiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Opción 1: registrar consumo aquí para poder finalizar.
  IF p_material_id IS NOT NULL AND (coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0)) > 0 THEN
    PERFORM * FROM public.registrar_consumo_material_operador_op(
      v_sesion.partida_id, p_material_id,
      coalesce(p_cantidad_usada, 0), coalesce(p_cantidad_scrap, 0),
      coalesce(p_motivo_consumo, 'Consumo registrado al actualizar avance'),
      v_sesion.operador_id
    );
    v_consumo_asentado := true;
  END IF;

  UPDATE public.sesiones_trabajo s
  SET fecha_fin = v_fecha_fin_real,
      horas_brutas = v_horas_brutas,
      horas_netas = v_horas_netas,
      piezas_producidas = p_piezas_producidas,
      pendiente_actualizacion_avance = false,
      notas = CASE WHEN p_notas IS NULL THEN s.notas ELSE nullif(btrim(p_notas), '') END,
      estado_sesion = CASE
        WHEN v_completa AND (
          NOT privado.partida_requiere_consumo_material_en_proceso(
            v_sesion.partida_id, v_meta_consumo_id
          )
          OR v_consumo_asentado
        ) THEN 'finalizada'
        ELSE 'pausada'
      END
  WHERE s.id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    SELECT avance.id INTO v_avance_id FROM public.registros_avance_partida avance
    WHERE avance.sesion_trabajo_id = p_sesion_id FOR UPDATE;
    IF v_avance_id IS NOT NULL THEN
      UPDATE public.registros_avance_partida avance
      SET cantidad_producida = p_piezas_producidas, meta_proceso_id = v_meta.id
      WHERE avance.id = v_avance_id;
    ELSE
      INSERT INTO public.registros_avance_partida (
        partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id, meta_proceso_id
      ) VALUES (
        v_sesion.partida_id, v_sesion.operador_id, p_piezas_producidas, 0, p_sesion_id, v_meta.id
      );
    END IF;
  ELSE
    UPDATE public.registros_avance_partida avance
    SET cantidad_producida = 0
    WHERE avance.sesion_trabajo_id = p_sesion_id;
  END IF;

  UPDATE public.partidas_orden_produccion p
  SET cantidad_producida = v_cantidad_nueva
  WHERE p.id = v_sesion.partida_id;

  IF v_completa AND privado.partida_requiere_consumo_material_en_proceso(
       v_sesion.partida_id, v_meta_consumo_id
     )
     AND NOT v_consumo_asentado THEN
    -- Opción 2: dejar el consumo para el cierre normal.
    UPDATE public.programacion_areas p SET estado_planeacion = 'bloqueada'
    WHERE p.id = v_sesion.programacion_id
      AND p.estado_planeacion NOT IN ('completada', 'cancelada');
  ELSIF v_completa THEN
    IF v_cantidad_metas > 0 AND v_meta.id IS NOT NULL THEN
      UPDATE public.programacion_areas p SET estado_planeacion = 'completada'
      WHERE (p.partida_id = v_sesion.partida_id AND p.meta_proceso_id = v_meta.id
             OR p.id = v_sesion.programacion_id)
        AND p.estado_planeacion <> 'cancelada';
    ELSE
      UPDATE public.programacion_areas p SET estado_planeacion = 'completada'
      WHERE p.id = v_sesion.programacion_id
        AND p.estado_planeacion <> 'cancelada';
    END IF;

    -- Las pausas posteriores ya no son necesarias: se marcan inválidas. Sus
    -- horas salen del total por la invariante única al final de la función.
    UPDATE public.sesiones_trabajo s
    SET sesion_invalida = true,
        pendiente_actualizacion_avance = false,
        estado_sesion = 'finalizada'
    WHERE s.programacion_id = v_sesion.programacion_id
      AND s.id <> v_sesion.id
      AND s.estado_sesion = 'pausada'
      AND NOT s.sesion_invalida;
  ELSE
    UPDATE public.programacion_areas p SET estado_planeacion = 'bloqueada'
    WHERE p.id = v_sesion.programacion_id
      AND p.estado_planeacion NOT IN ('completada', 'cancelada');
  END IF;

  PERFORM privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

  v_corrida_id := v_sesion.corrida_id;
  IF v_corrida_id IS NOT NULL THEN
    v_corrida_completa := NOT EXISTS (
      SELECT 1 FROM public.corrida_items i
      WHERE i.corrida_id = v_corrida_id AND NOT privado.partida_produccion_completa(i.partida_id));
    IF v_corrida_completa THEN
      UPDATE public.corridas c SET estado = 'COMPLETADA'
      WHERE c.id = v_corrida_id AND c.estado <> 'CANCELADA';
    END IF;
  END IF;

  IF v_completa AND coalesce(privado.orden_produccion_completa(v_sesion.orden_id), false) THEN
    UPDATE public.ordenes_produccion o SET estado = 'completada', fecha_fin = v_fecha_fin_real
    WHERE o.id = v_sesion.orden_id;

    -- C23: aviso operativo, no bloqueo. La nota de entrega puede registrarse
    -- después; el hecho queda trazado en la bitácora de la partida.
    IF NOT EXISTS (
      SELECT 1 FROM public.notas_entrega n WHERE n.orden_id = v_sesion.orden_id
    ) THEN
      INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
      VALUES (v_sesion.partida_id, p_actor_id, 'fin',
        'Orden completada sin nota de entrega registrada');
    END IF;
  END IF;

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (v_sesion.partida_id, p_actor_id, 'pausa',
    nullif(btrim(coalesce(p_notas, 'Actualización de avance y tiempo real de la pausa')), ''));

  SELECT o.estado INTO v_estado_orden FROM public.ordenes_produccion o WHERE o.id = v_sesion.orden_id;
  SELECT p.estado_planeacion INTO v_estado_programacion FROM public.programacion_areas p WHERE p.id = v_sesion.programacion_id;

  RETURN QUERY
  SELECT s.id, s.estado_sesion, s.fecha_fin, s.horas_netas, s.piezas_producidas,
         v_estado_programacion, s.actualizado_en
  FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text, uuid, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_avance_sesion_pausada(uuid, uuid, numeric, numeric, text, uuid, numeric, numeric, text)
  TO service_role;
