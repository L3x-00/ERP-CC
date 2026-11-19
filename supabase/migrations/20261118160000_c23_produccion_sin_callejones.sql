-- =============================================================================
-- C23.1 (2026-11-18): Producción sin callejones sin salida.
--
-- Hallazgos que corrige esta migración:
--   1. `actualizar_avance_sesion_pausada` contaba DOS VECES el avance: escribía
--      el total declarado en la sesión y sumaba ese total a la partida. Al
--      corregir una pausa (por ejemplo 5 piezas sobre 3 ya declaradas) la
--      partida saltaba a 5 en lugar de 2. Además no topaba contra la meta ni
--      contra la cantidad solicitada.
--   2. Al completar producción desde una pausa se restaban las horas de TODAS
--      las sesiones inválidas de la programación, incluidas las que ya se
--      habían descontado en una corrección anterior.
--   3. Una pausa sobre una operación ya `completada` la devolvía a `bloqueada`.
--   4. El cierre/pausa de una sesión activa exigía `programacion.en_proceso`;
--      si otra sesión de la misma operación la había completado o bloqueado,
--      la sesión quedaba atrapada.
--   5. El trigger B2 exigía consumo de material incluso cuando la sesión se
--      cerraba con 0 piezas, impidiendo descartar una sesión vacía.
--   6. Una orden completada dejaba sus pausas pendientes sin forma de cerrarse
--      (`orden_no_en_proceso`) y la programación quedaba `bloqueada` para
--      siempre. Se agrega una RPC administrativa explícita.
--   7. Las horas reales de la partida se acumulaban a mano en varios caminos.
--      Se centraliza la invariante en `privado.recalcular_tiempo_real_partida`:
--      `partida.tiempo_real_minutos = suma(horas_netas de sesiones no inválidas)`.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Invariante única de horas reales por partida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.recalcular_tiempo_real_partida(p_partida_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH total AS (
    SELECT coalesce(sum(sesion.horas_netas * 60), 0)::numeric AS minutos
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = p_partida_id
      AND NOT sesion.sesion_invalida
  )
  UPDATE public.partidas_orden_produccion AS partida
  SET tiempo_real_minutos = round(total.minutos, 2)
  FROM total
  WHERE partida.id = p_partida_id
  RETURNING partida.tiempo_real_minutos;
$$;

COMMENT ON FUNCTION privado.recalcular_tiempo_real_partida(uuid) IS
  'C23: única fuente de verdad del tiempo real de una partida; suma las horas netas de las sesiones no inválidas.';

REVOKE ALL ON FUNCTION privado.recalcular_tiempo_real_partida(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Saneamiento idempotente: el histórico pudo quedar desincronizado por los
-- dobles conteos anteriores. Solo se derivan minutos; no se tocan piezas.
UPDATE public.partidas_orden_produccion AS partida
SET tiempo_real_minutos = round(coalesce((
  SELECT sum(sesion.horas_netas * 60)
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = partida.id
    AND NOT sesion.sesion_invalida
), 0), 2)
WHERE partida.tiempo_real_minutos IS DISTINCT FROM round(coalesce((
  SELECT sum(sesion.horas_netas * 60)
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = partida.id
    AND NOT sesion.sesion_invalida
), 0), 2);

-- -----------------------------------------------------------------------------
-- 2. Una sesión sin piezas no consume material.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.validar_consumo_cierre_b2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado_sesion = 'finalizada'
     AND OLD.estado_sesion IS DISTINCT FROM 'finalizada'
     -- C23: descartar una sesión vacía no consume material. El requisito de
     -- consumo aplica solo cuando la sesión declaró piezas producidas.
     AND coalesce(NEW.piezas_producidas, 0) > 0
     AND privado.partida_requiere_consumo_material(NEW.partida_id) THEN
    RAISE EXCEPTION 'consumo_material_requerido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.validar_consumo_cierre_b2() IS
  'B2/C23: exige consumo de material al cerrar una sesión con piezas producidas; una sesión vacía puede descartarse.';

REVOKE ALL ON FUNCTION privado.validar_consumo_cierre_b2()
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Avance de una pausa: delta, topes y horas derivadas.
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
          NOT privado.partida_requiere_consumo_material(v_sesion.partida_id)
          OR p_material_id IS NOT NULL
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

  IF v_completa AND privado.partida_requiere_consumo_material(v_sesion.partida_id)
     AND p_material_id IS NULL THEN
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

-- -----------------------------------------------------------------------------
-- 4. Cierre de una pausa huérfana en una orden ya terminada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_pausa_huerfana_administrativa(
  p_sesion_id uuid,
  p_actor_id uuid,
  p_conservar_tiempo boolean DEFAULT true,
  p_horas_reales numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  horas_netas numeric,
  estado_planeacion text,
  tiempo_real_minutos numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_fecha_fin timestamptz;
  v_horas_netas numeric;
  v_horas_brutas numeric;
  v_comida numeric;
  v_estado_planeacion text;
  v_minutos numeric;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL OR p_conservar_tiempo IS NULL THEN
    RAISE EXCEPTION 'cierre_pausa_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_cierre_pausa' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NOT NULL AND char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_cierre_invalido' USING ERRCODE = '22023';
  END IF;

  -- Lectura sin lock solo para descubrir las entidades y validar el estado de
  -- la orden; después se bloquea en el orden del contrato.
  SELECT * INTO v_sesion FROM public.sesiones_trabajo s WHERE s.id = p_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_partida FROM public.partidas_orden_produccion p
  WHERE p.id = v_sesion.partida_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion o
  WHERE o.id = v_sesion.orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_orden_inconsistente' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    v_orden.estado IN ('completada', 'cerrada')
    OR v_orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')
  ) THEN
    RAISE EXCEPTION 'orden_no_terminada' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_programacion FROM public.programacion_areas p
  WHERE p.id = v_sesion.programacion_id FOR UPDATE;
  IF NOT FOUND OR v_programacion.partida_id <> v_sesion.partida_id
     OR v_programacion.orden_id <> v_sesion.orden_id THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.recursos_planeacion r
  WHERE r.id = v_programacion.recurso_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_trabajo s
  WHERE s.id = p_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'pausada' OR v_sesion.sesion_invalida THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.fecha_fin IS NULL THEN
    RAISE EXCEPTION 'pausa_sin_corte' USING ERRCODE = '23514';
  END IF;

  IF NOT p_conservar_tiempo AND p_horas_reales IS NOT NULL THEN
    RAISE EXCEPTION 'pausa_huerfana_invalida' USING ERRCODE = '22023';
  END IF;

  v_fecha_fin := v_sesion.fecha_fin;
  v_horas_netas := coalesce(v_sesion.horas_netas, 0);
  v_horas_brutas := coalesce(v_sesion.horas_brutas, v_horas_netas);

  IF NOT p_conservar_tiempo THEN
    -- Descartar el bloque: no altera piezas, solo deja de sumar horas.
    v_horas_netas := 0;
    v_horas_brutas := 0;
  ELSIF p_horas_reales IS NOT NULL THEN
    IF p_horas_reales <= 0 OR p_horas_reales > (
      SELECT extract(epoch FROM (v_sesion.fecha_fin - v_sesion.fecha_inicio)) / 3600
    ) THEN
      RAISE EXCEPTION 'horas_reales_exceden_sesion' USING ERRCODE = '23514';
    END IF;
    v_fecha_fin := v_sesion.fecha_inicio + (p_horas_reales || ' hours')::interval;
    SELECT calculo.horas_brutas - calculo.horas_netas INTO v_comida
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin) AS calculo;
    v_fecha_fin := v_fecha_fin + (coalesce(v_comida, 0) || ' hours')::interval;
    SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin) AS calculo;
    v_horas_netas := p_horas_reales;
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET fecha_fin = v_fecha_fin,
      horas_brutas = v_horas_brutas,
      horas_netas = v_horas_netas,
      pendiente_actualizacion_avance = false,
      recurso_liberado = true,
      sesion_invalida = NOT p_conservar_tiempo,
      estado_sesion = 'finalizada'
  WHERE sesion.id = v_sesion.id;

  v_estado_planeacion := CASE
    WHEN privado.partida_produccion_completa(v_sesion.partida_id) THEN 'completada'
    WHEN v_programacion.estado_planeacion = 'bloqueada' THEN 'programada'
    ELSE v_programacion.estado_planeacion
  END;

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = v_estado_planeacion
  WHERE programacion.id = v_programacion.id;

  v_minutos := privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (
    v_sesion.partida_id, p_actor_id, 'fin',
    left(concat_ws(' · ', 'Cierre administrativo de pausa huérfana',
      CASE WHEN p_conservar_tiempo THEN 'tiempo conservado' ELSE 'tiempo descartado' END,
      v_motivo), 500)
  );

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_sesion.orden_id,
    'cierre_pausa_huerfana',
    jsonb_build_object(
      'sesion_id', v_sesion.id,
      'partida_id', v_sesion.partida_id,
      'programacion_id', v_sesion.programacion_id,
      'horas_anteriores', v_sesion.horas_netas,
      'horas_nuevas', v_horas_netas,
      'conservar_tiempo', p_conservar_tiempo,
      'estado_planeacion', v_estado_planeacion
    ),
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT sesion.id, sesion.estado_sesion, sesion.horas_netas,
         v_estado_planeacion, v_minutos, sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = v_sesion.id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_pausa_huerfana_administrativa(uuid, uuid, boolean, numeric, text, uuid) IS
  'C23: cierra una pausa que quedó atrapada cuando la orden terminó. Permite conservar el tiempo (con horas reales opcionales) o descartarlo; no toca piezas y deja evento de auditoría. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_pausa_huerfana_administrativa(uuid, uuid, boolean, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_pausa_huerfana_administrativa(uuid, uuid, boolean, numeric, text, uuid)
  TO service_role;
