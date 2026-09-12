-- =============================================================================
-- Auditoría 2026-09-11 — Correcciones de máquinas de estado, autoridad de
-- PostgreSQL y orden de locks en Órdenes, Planeación y Producción.
--
-- Hallazgos corregidos:
--   A) `cambiar_estado_orden` completaba una OP con partidas pendientes.
--   B) `registrar_avance_partida_op` (piso) nunca auto-completaba la OP; el
--      cierre de sesión sí lo hacía, pero el avance directo dejaba la OP en
--      `en_proceso` y `abrir_cuenta_por_cobrar` la rechazaba.
--   C) `programar_partida_recurso` aceptaba órdenes terminales y tomaba los
--      locks en orden recurso→partida (ABBA con iniciar/cerrar sesión).
--   D) `reprogramar_partida_recurso` permitía mover una programación
--      `en_proceso` (sesión abierta) a otro recurso/fecha.
--   E) `asignar_operador_a_partida_op` permitía reasignar una partida con
--      sesión activa, dejando un bloqueo mutuo de cierre.
--   F) `cerrar_sesion_trabajo_operador` bloqueaba sesión→partida (inverso al
--      resto del motor); ahora partida→…→sesión con revalidación.
--
-- Contrato de locks unificado: partida → orden → operador → programación →
-- recurso → sesión.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Completar una orden exige TODAS las partidas producidas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_orden(
  p_orden_id uuid,
  p_estado_actual text,
  p_estado_nuevo text,
  p_motivo_cancelacion text DEFAULT NULL
)
RETURNS TABLE (id uuid, estado text, fecha_inicio timestamptz, fecha_fin timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo_cancelacion, '')), '');
BEGIN
  SELECT ordenes_produccion.estado
  INTO v_estado
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_estado <> p_estado_actual THEN
    RAISE EXCEPTION 'estado_conflicto' USING ERRCODE = 'serialization_failure';
  END IF;

  IF NOT (
    (v_estado = 'borrador' AND p_estado_nuevo IN ('programada', 'cancelada'))
    OR (v_estado = 'programada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
    OR (v_estado = 'en_proceso' AND p_estado_nuevo IN ('pausada', 'completada', 'cancelada'))
    OR (v_estado = 'pausada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
  ) THEN
    RAISE EXCEPTION 'transicion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_estado_nuevo = 'cancelada' AND (v_motivo IS NULL OR char_length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'motivo_cancelacion_requerido' USING ERRCODE = 'check_violation';
  END IF;

  -- `completada` implica que no queda ninguna partida pendiente: es la misma
  -- condición que exige `abrir_cuenta_por_cobrar` antes de facturar.
  IF p_estado_nuevo = 'completada' AND EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_con_partidas_pendientes' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.ordenes_produccion
  SET
    estado = p_estado_nuevo,
    fecha_inicio = CASE
      WHEN p_estado_nuevo = 'en_proceso' THEN coalesce(ordenes_produccion.fecha_inicio, clock_timestamp())
      ELSE ordenes_produccion.fecha_inicio
    END,
    fecha_fin = CASE
      WHEN p_estado_nuevo = 'completada' THEN coalesce(ordenes_produccion.fecha_fin, clock_timestamp())
      ELSE ordenes_produccion.fecha_fin
    END,
    motivo_cancelacion = CASE
      WHEN p_estado_nuevo = 'cancelada' THEN v_motivo
      ELSE ordenes_produccion.motivo_cancelacion
    END
  WHERE ordenes_produccion.id = p_orden_id
  RETURNING
    ordenes_produccion.id,
    ordenes_produccion.estado,
    ordenes_produccion.fecha_inicio,
    ordenes_produccion.fecha_fin;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) IS
  'Cambia estado con bloqueo y compare-and-set; completar exige todas las partidas producidas; cancelar exige motivo. Solo service_role.';

-- -----------------------------------------------------------------------------
-- B) El avance de piso auto-completa la OP cuando todas sus partidas llegan.
-- -----------------------------------------------------------------------------
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

  -- Misma regla que el cierre de sesión: la OP se completa en cuanto TODAS sus
  -- partidas alcanzan lo solicitado, sin intervención de otra pantalla.
  IF NOT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = v_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = coalesce(orden.fecha_fin, now())
    WHERE orden.id = v_orden_id
      AND orden.estado = 'en_proceso';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- C) Programación: la partida primero, luego la orden (no terminal) y al final
--    el recurso. Se valida que la OP siga viva antes de comprometer capacidad.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.programar_partida_recurso(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recurso_activo boolean;
  v_orden_partida_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
BEGIN
  IF p_orden_id IS NULL
     OR p_partida_id IS NULL
     OR p_recurso_id IS NULL
     OR p_secuencia IS NULL
     OR p_secuencia <= 0
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida → orden → recurso (igual que el motor de sesiones).
  SELECT partida.orden_id
  INTO v_orden_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden_partida_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_programable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT recurso.activo
  INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    p_recurso_id,
    p_fecha_programada,
    p_turno
  );
  IF v_capacidad <= 0 THEN
    RAISE EXCEPTION 'capacidad_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.fecha_programada = p_fecha_programada
    AND programacion.turno = p_turno
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.programacion_areas (
    orden_id,
    partida_id,
    recurso_id,
    secuencia,
    fecha_programada,
    turno,
    horas_estimadas,
    orden_prioridad,
    estado_planeacion
  ) VALUES (
    p_orden_id,
    p_partida_id,
    p_recurso_id,
    p_secuencia,
    p_fecha_programada,
    p_turno,
    p_horas_estimadas,
    p_orden_prioridad,
    'programada'
  )
  RETURNING
    programacion_areas.id,
    programacion_areas.estado_planeacion,
    programacion_areas.actualizado_en;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'programacion_duplicada' USING ERRCODE = 'unique_violation';
END;
$$;

-- -----------------------------------------------------------------------------
-- D) Reprogramar solo antes de tomar el recurso (programada/bloqueada).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reprogramar_partida_recurso(
  p_programacion_id uuid,
  p_recurso_id uuid,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
  p_actualizado_en_esperado timestamptz
)
RETURNS TABLE (
  id uuid,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_nuevo_activo boolean;
  v_capacidad numeric;
  v_horas_programadas numeric;
BEGIN
  IF p_programacion_id IS NULL
     OR p_recurso_id IS NULL
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999
     OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'reprogramacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'programacion_conflicto' USING ERRCODE = 'check_violation';
  END IF;
  -- Una programación en preparación/ejecución ya tiene recurso y sesión
  -- comprometidos: moverla dejaría el histórico de capacidad inconsistente.
  IF v_programacion.estado_planeacion NOT IN ('programada', 'bloqueada') THEN
    RAISE EXCEPTION 'programacion_no_reprogramable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id IN (v_programacion.recurso_id, p_recurso_id)
  ORDER BY recurso.id
  FOR UPDATE;

  SELECT recurso.activo
  INTO v_recurso_nuevo_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_recurso_nuevo_activo = false THEN
    RAISE EXCEPTION 'recurso_inactivo' USING ERRCODE = 'check_violation';
  END IF;

  v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
    p_recurso_id,
    p_fecha_programada,
    p_turno
  );
  IF v_capacidad <= 0 THEN
    RAISE EXCEPTION 'capacidad_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(programacion.horas_estimadas), 0::numeric)
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.fecha_programada = p_fecha_programada
    AND programacion.turno = p_turno
    AND programacion.id <> p_programacion_id
    AND programacion.estado_planeacion NOT IN ('cancelada', 'completada');

  IF v_horas_programadas + p_horas_estimadas > v_capacidad THEN
    RAISE EXCEPTION 'capacidad_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.programacion_areas AS programacion
  SET
    recurso_id = p_recurso_id,
    fecha_programada = p_fecha_programada,
    turno = p_turno,
    horas_estimadas = p_horas_estimadas,
    orden_prioridad = p_orden_prioridad
  WHERE programacion.id = p_programacion_id
  RETURNING
    programacion.id,
    programacion.estado_planeacion,
    programacion.actualizado_en;
END;
$$;

-- -----------------------------------------------------------------------------
-- E) Reasignar operador con sesión activa rompía el cierre (bloqueo mutuo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_operador_a_partida_op(
  p_partida_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  operador_asignado_id uuid,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  SELECT partida.orden_id
  INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_asignable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = p_partida_id
    AND sesion.estado_sesion = 'activa'
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'partida_con_sesion_activa' USING ERRCODE = 'check_violation';
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

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET operador_asignado_id = p_operador_id
  WHERE partida.id = p_partida_id
  RETURNING partida.id, partida.operador_asignado_id, partida.actualizado_en;
END;
$$;

-- -----------------------------------------------------------------------------
-- F) Cierre de sesión con orden de locks partida → … → sesión.
--    Se lee la sesión sin lock para conocer la partida, se bloquea la partida y
--    después la sesión, revalidando que la fila no cambió entre lecturas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_sesion_trabajo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_estado_destino text,
  p_motivo_pausa text DEFAULT NULL,
  p_notas text DEFAULT NULL
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
  IF v_cantidad_producida_actual + p_piezas_producidas > v_cantidad_solicitada THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
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
  IF p_piezas_producidas > 0 AND v_es_ultima_secuencia = false THEN
    RAISE EXCEPTION 'produccion_solo_ultima_secuencia' USING ERRCODE = 'check_violation';
  END IF;

  v_cantidad_producida_nueva := v_cantidad_producida_actual + p_piezas_producidas;
  v_partida_completa := v_cantidad_producida_nueva >= v_cantidad_solicitada;
  UPDATE public.sesiones_trabajo AS sesion
  SET
    fecha_fin = now(), horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
    piezas_producidas = p_piezas_producidas,
    motivo_pausa = CASE WHEN p_estado_destino = 'pausada' THEN nullif(btrim(p_motivo_pausa), '') ELSE NULL END,
    notas = nullif(btrim(p_notas), ''), estado_sesion = p_estado_destino
  WHERE sesion.id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id
    ) VALUES (v_sesion.partida_id, p_operador_id, p_piezas_producidas, 0, p_sesion_id);
  END IF;
  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_producida_nueva,
      tiempo_real_minutos = partida.tiempo_real_minutos + (v_horas_netas * 60)
  WHERE partida.id = v_sesion.partida_id;

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

  SELECT bool_and(partida.cantidad_producida >= partida.cantidad_solicitada)
  INTO v_orden_completa
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_sesion.orden_id;
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

-- -----------------------------------------------------------------------------
-- Reafirmar privilegios mínimos (idempotente).
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text) TO service_role;
