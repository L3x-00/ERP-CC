-- =============================================================================
-- C10 — Espacio de operador en piso
-- =============================================================================
-- El operador de piso necesita un tablero propio (Kanban, calendario y vista
-- por área) donde pueda tomar procesos aprobados, reservarlos para un día de
-- su jornada de 8 h y arrancar la sesión sin pasar por Planeación.
--
-- Diseño:
--   1. `reclamos_proceso_operador`: un reclamo activo por operación
--      (partida × meta_proceso). Las partidas históricas sin ruteo se reclaman
--      a nivel partida (meta_proceso_id NULL).
--   2. Capacidad diaria del operador: 8 h por fecha, serializada con
--      `pg_advisory_xact_lock` para que dos reclamos simultáneos no rebasen el
--      límite.
--   3. `preparar_reclamo_operador`: crea o reactiva la fila de
--      `programacion_areas` de la operación, elige un recurso compatible con el
--      área macro de la partida y la deja en `en_preparacion`.
--   4. `iniciar_proceso_reclamado_operador`: prepara y arranca en una sola
--      transacción; si el inicio falla, la preparación se revierte y el recurso
--      no queda apartado.
--   5. Un trigger sincroniza el reclamo cuando la programación se completa o
--      se cancela.
--
-- Locks: partida → orden → recurso (mismo contrato que el motor de sesiones y
-- `programar_partida_recurso`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de reclamos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reclamos_proceso_operador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE CASCADE,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE CASCADE,
  meta_proceso_id uuid REFERENCES public.metas_proceso_partida (id) ON DELETE CASCADE,
  programacion_id uuid REFERENCES public.programacion_areas (id) ON DELETE SET NULL,
  operador_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  fecha date NOT NULL,
  turno text NOT NULL DEFAULT 'matutino',
  horas_estimadas numeric(5, 2) NOT NULL,
  estado text NOT NULL DEFAULT 'activo',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reclamos_proceso_operador_turno_check
    CHECK (turno IN ('matutino', 'vespertino', 'nocturno')),
  CONSTRAINT reclamos_proceso_operador_horas_check
    CHECK (horas_estimadas > 0 AND horas_estimadas <= 8),
  CONSTRAINT reclamos_proceso_operador_estado_check
    CHECK (estado IN ('activo', 'completado', 'liberado'))
);

COMMENT ON TABLE public.reclamos_proceso_operador IS
  'C10: reserva de una operación (partida × proceso) por un operador para un día de su jornada. Un solo reclamo activo por operación.';

-- Una operación solo puede estar reclamada por un operador a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reclamos_proceso_operador_operacion_unica
  ON public.reclamos_proceso_operador (partida_id, meta_proceso_id)
  WHERE estado = 'activo' AND meta_proceso_id IS NOT NULL;

-- Las partidas históricas sin ruteo se reclaman a nivel partida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reclamos_proceso_operador_legacy_unico
  ON public.reclamos_proceso_operador (partida_id)
  WHERE estado = 'activo' AND meta_proceso_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reclamos_proceso_operador_dia
  ON public.reclamos_proceso_operador (operador_id, fecha)
  WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_reclamos_proceso_operador_programacion
  ON public.reclamos_proceso_operador (programacion_id);

CREATE INDEX IF NOT EXISTS idx_reclamos_proceso_operador_orden
  ON public.reclamos_proceso_operador (orden_id, estado);

ALTER TABLE public.reclamos_proceso_operador ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reclamos_proceso_operador FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reclamos_proceso_operador TO service_role;

-- Las terminales de piso reciben una senal vacia por SSE cuando cambia un
-- reclamo; el relay filtra por sesion y nunca transporta filas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reclamos_proceso_operador'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reclamos_proceso_operador;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Horas estimadas de una operación
-- -----------------------------------------------------------------------------
-- Preferencia: horas ya programadas por Planeación para la operación. Si no
-- existen, se reparte el tiempo estimado de la partida entre sus operaciones
-- (mínimo 0.25 h). El resultado NO se recorta a 8 h: el reclamo rechaza los
-- procesos que no caben en una jornada.
CREATE OR REPLACE FUNCTION privado.horas_estimadas_proceso(
  p_partida_id uuid,
  p_meta_proceso_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_horas_programadas numeric;
  v_tiempo_estimado numeric;
  v_total_metas integer;
  v_horas numeric;
BEGIN
  IF p_partida_id IS NULL THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT programacion.horas_estimadas
  INTO v_horas_programadas
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = p_partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM p_meta_proceso_id
    AND programacion.estado_planeacion <> 'cancelada'
  ORDER BY programacion.creado_en DESC
  LIMIT 1;

  IF v_horas_programadas IS NOT NULL AND v_horas_programadas > 0 THEN
    RETURN round(v_horas_programadas, 2);
  END IF;

  SELECT coalesce(partida.tiempo_estimado_minutos, 0) / 60.0
  INTO v_tiempo_estimado
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_meta_proceso_id IS NULL THEN
    v_horas := v_tiempo_estimado;
  ELSE
    SELECT count(*)
    INTO v_total_metas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = p_partida_id;

    IF v_total_metas = 0 THEN
      v_horas := v_tiempo_estimado;
    ELSE
      v_horas := v_tiempo_estimado / v_total_metas;
    END IF;
  END IF;

  RETURN greatest(round(coalesce(v_horas, 0), 2), 0.25);
END;
$$;

COMMENT ON FUNCTION privado.horas_estimadas_proceso(uuid, uuid) IS
  'C10: horas de una operación; usa la programación existente o reparte el tiempo estimado de la partida entre sus procesos (mínimo 0.25 h).';

REVOKE ALL ON FUNCTION privado.horas_estimadas_proceso(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Reclamar una operación
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reclamar_proceso_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_meta_proceso_id uuid,
  p_operador_id uuid,
  p_fecha date,
  p_turno text DEFAULT 'matutino'
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  meta_proceso_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha date,
  turno text,
  horas_estimadas numeric,
  estado text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_estado_orden text;
  v_horas numeric;
  v_ocupadas numeric;
  v_meta_piezas numeric;
  v_hecho numeric;
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_operador_id IS NULL
     OR p_fecha IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno') THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida → orden.
  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_estado_orden IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_reclamable' USING ERRCODE = 'check_violation';
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

  IF NOT privado.operador_habilitado_area(p_operador_id, v_partida.area_trabajo_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_meta_proceso_id IS NOT NULL THEN
    SELECT meta.meta_piezas
    INTO v_meta_piezas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = p_meta_proceso_id
      AND meta.partida_id = p_partida_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(avance.cantidad_producida), 0)
    INTO v_hecho
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = p_meta_proceso_id;

    IF v_hecho >= v_meta_piezas THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_horas := privado.horas_estimadas_proceso(p_partida_id, p_meta_proceso_id);

  IF v_horas > 8 THEN
    RAISE EXCEPTION 'proceso_excede_jornada' USING ERRCODE = 'check_violation';
  END IF;

  -- La partida admite un solo operador responsable; el reclamo lo asigna si
  -- estaba libre y rechaza si ya pertenece a otro operador.
  IF v_partida.operador_asignado_id IS NULL THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET operador_asignado_id = p_operador_id
    WHERE partida.id = p_partida_id;
  ELSIF v_partida.operador_asignado_id <> p_operador_id THEN
    RAISE EXCEPTION 'partida_asignada_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  -- Serializa la jornada del operador para no rebasar 8 h con reclamos
  -- simultáneos desde dos terminales.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_operador_id::text || ':' || p_fecha::text, 0)
  );

  SELECT coalesce(sum(reclamo.horas_estimadas), 0)
  INTO v_ocupadas
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.operador_id = p_operador_id
    AND reclamo.fecha = p_fecha
    AND reclamo.estado = 'activo';

  IF v_ocupadas + v_horas > 8 THEN
    RAISE EXCEPTION 'capacidad_diaria_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.reclamos_proceso_operador (
    orden_id, partida_id, meta_proceso_id, operador_id, fecha, turno,
    horas_estimadas, estado
  ) VALUES (
    p_orden_id, p_partida_id, p_meta_proceso_id, p_operador_id, p_fecha, p_turno,
    v_horas, 'activo'
  )
  RETURNING * INTO v_reclamo;

  RETURN QUERY
  SELECT reclamo.id, reclamo.orden_id, reclamo.partida_id, reclamo.meta_proceso_id,
    reclamo.programacion_id, reclamo.operador_id, reclamo.fecha, reclamo.turno,
    reclamo.horas_estimadas, reclamo.estado, reclamo.creado_en, reclamo.actualizado_en
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = v_reclamo.id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'proceso_ya_reclamado' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text) IS
  'C10: reserva una operación para el día del operador, asigna la partida si estaba libre y valida la jornada de 8 h. Solo service_role.';

REVOKE ALL ON FUNCTION public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Mover un reclamo a otro día
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mover_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid,
  p_fecha date,
  p_turno text DEFAULT 'matutino'
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  meta_proceso_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha date,
  turno text,
  horas_estimadas numeric,
  estado text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_estado_orden text;
  v_ocupadas numeric;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL OR p_fecha IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno') THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.programacion_id IS NOT NULL THEN
    RAISE EXCEPTION 'reclamo_ya_preparado' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo orden de locks que el resto del motor.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_estado_orden IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_reclamable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_operador_id::text || ':' || p_fecha::text, 0)
  );

  SELECT coalesce(sum(reclamo.horas_estimadas), 0)
  INTO v_ocupadas
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.operador_id = p_operador_id
    AND reclamo.fecha = p_fecha
    AND reclamo.estado = 'activo'
    AND reclamo.id <> p_reclamo_id;

  IF v_ocupadas + v_reclamo.horas_estimadas > 8 THEN
    RAISE EXCEPTION 'capacidad_diaria_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET fecha = p_fecha,
      turno = p_turno,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN QUERY
  SELECT reclamo.id, reclamo.orden_id, reclamo.partida_id, reclamo.meta_proceso_id,
    reclamo.programacion_id, reclamo.operador_id, reclamo.fecha, reclamo.turno,
    reclamo.horas_estimadas, reclamo.estado, reclamo.creado_en, reclamo.actualizado_en
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id;
END;
$$;

COMMENT ON FUNCTION public.mover_reclamo_operador(uuid, uuid, date, text) IS
  'C10: mueve un reclamo activo a otro día validando la jornada de 8 h. Solo service_role.';

REVOKE ALL ON FUNCTION public.mover_reclamo_operador(uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_reclamo_operador(uuid, uuid, date, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Liberar un reclamo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liberar_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_otros_reclamos integer;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  IF v_reclamo.programacion_id IS NOT NULL THEN
    SELECT * INTO v_programacion
    FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_reclamo.programacion_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_programacion.estado_planeacion = 'completada' THEN
        RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
      END IF;
      IF v_programacion.estado_planeacion = 'en_proceso' THEN
        RAISE EXCEPTION 'proceso_en_proceso_no_liberable' USING ERRCODE = 'check_violation';
      END IF;
      IF v_programacion.estado_planeacion = 'bloqueada' THEN
        RAISE EXCEPTION 'proceso_pausado_no_liberable' USING ERRCODE = 'check_violation';
      END IF;
      -- Liberar antes de arrancar devuelve el recurso a Planeación.
      UPDATE public.programacion_areas AS programacion
      SET estado_planeacion = 'cancelada',
          actualizado_en = now()
      WHERE programacion.id = v_programacion.id;
    END IF;
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET estado = 'liberado',
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  -- Si el operador ya no tiene reclamos activos en la partida, se libera la
  -- asignación para que otro operador pueda tomarla.
  SELECT count(*)
  INTO v_otros_reclamos
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.partida_id = v_reclamo.partida_id
    AND reclamo.operador_id = p_operador_id
    AND reclamo.estado = 'activo';

  IF v_otros_reclamos = 0 THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET operador_asignado_id = NULL
    WHERE partida.id = v_reclamo.partida_id
      AND partida.operador_asignado_id = p_operador_id;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.liberar_reclamo_operador(uuid, uuid) IS
  'C10: libera un reclamo activo sin sesión abierta y devuelve el recurso preparado a Planeación. Solo service_role.';

REVOKE ALL ON FUNCTION public.liberar_reclamo_operador(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reclamo_operador(uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Preparar el recurso de un reclamo
-- -----------------------------------------------------------------------------
-- Deja la operación en `en_preparacion` para que el motor de sesiones pueda
-- arrancarla. Reutiliza la fila de programación si ya existe (incluidas las
-- canceladas) para respetar el único (partida_id, meta_proceso_id).
CREATE OR REPLACE FUNCTION public.preparar_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_area_macro text;
  v_recurso record;
  v_recurso_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
  v_prioridad integer;
  v_programacion_id uuid;
  v_secuencia smallint := 1;
  v_total_metas integer;
  v_reutiliza_programacion boolean := false;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> v_reclamo.orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden.estado NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_pendiente_liberacion' USING ERRCODE = 'check_violation';
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

  IF NOT privado.operador_habilitado_area(p_operador_id, v_partida.area_trabajo_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT * INTO v_meta
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = v_reclamo.meta_proceso_id
      AND meta.partida_id = v_reclamo.partida_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    v_secuencia := v_meta.secuencia;
  END IF;

  v_prioridad := CASE v_orden.prioridad
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'normal' THEN 3
    ELSE 4
  END;

  -- ¿Ya existe la fila de programación de esta operación?
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = v_reclamo.partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM v_reclamo.meta_proceso_id
  FOR UPDATE;
  v_reutiliza_programacion := FOUND;

  -- Compatibilidad C9.0: Planeación pudo preparar la partida completa (fila
  -- heredada sin operación). Si la partida tiene una sola operación, el reclamo
  -- adopta esa fila en lugar de crear otra que competiría por el mismo recurso.
  IF NOT v_reutiliza_programacion AND v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT count(*) INTO v_total_metas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = v_reclamo.partida_id;

    IF v_total_metas = 1 THEN
      SELECT * INTO v_programacion
      FROM public.programacion_areas AS programacion
      WHERE programacion.partida_id = v_reclamo.partida_id
        AND programacion.meta_proceso_id IS NULL
        AND programacion.estado_planeacion IN ('programada', 'en_preparacion')
      ORDER BY programacion.creado_en DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.programacion_areas AS programacion
        SET meta_proceso_id = v_reclamo.meta_proceso_id,
            actualizado_en = now()
        WHERE programacion.id = v_programacion.id;
        v_reutiliza_programacion := true;
      END IF;
    END IF;
  END IF;

  IF v_reutiliza_programacion THEN
    IF v_programacion.estado_planeacion = 'completada' THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_proceso' THEN
      RAISE EXCEPTION 'programacion_ya_en_proceso' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'bloqueada' THEN
      RAISE EXCEPTION 'proceso_pausado_reanudar' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_preparacion' THEN
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET programacion_id = v_programacion.id,
          actualizado_en = now()
      WHERE reclamo.id = p_reclamo_id;
      RETURN v_programacion.id;
    END IF;
    -- `programada` o `cancelada`: se revalida recurso y capacidad para el día
    -- del reclamo antes de reactivarla.
    v_programacion_id := v_programacion.id;
    v_recurso_id := v_programacion.recurso_id;
  END IF;

  IF v_recurso_id IS NOT NULL THEN
    PERFORM 1
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.id = v_recurso_id
      AND recurso.activo = true
    FOR UPDATE;

    IF NOT FOUND THEN
      v_recurso_id := NULL;
    ELSE
      v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
        v_recurso_id, v_reclamo.fecha, v_reclamo.turno
      );

      SELECT coalesce(sum(programacion.horas_estimadas), 0)
      INTO v_horas_programadas
      FROM public.programacion_areas AS programacion
      WHERE programacion.recurso_id = v_recurso_id
        AND programacion.fecha_programada = v_reclamo.fecha
        AND programacion.turno = v_reclamo.turno
        AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
        AND programacion.id IS DISTINCT FROM v_programacion_id;

      IF v_capacidad <= 0
         OR v_horas_programadas + v_reclamo.horas_estimadas > v_capacidad
         OR EXISTS (
           SELECT 1
           FROM public.programacion_areas AS ocupada
           WHERE ocupada.recurso_id = v_recurso_id
             AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
             AND ocupada.id IS DISTINCT FROM v_programacion_id
         ) THEN
        v_recurso_id := NULL;
      END IF;
    END IF;
  END IF;

  IF v_recurso_id IS NULL THEN
    v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);

    FOR v_recurso IN
      SELECT recurso.id
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.activo = true
        AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
      ORDER BY recurso.codigo
      FOR UPDATE
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.programacion_areas AS ocupada
        WHERE ocupada.recurso_id = v_recurso.id
          AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
          AND ocupada.id IS DISTINCT FROM v_programacion_id
      ) THEN
        CONTINUE;
      END IF;

      v_capacidad := privado.obtener_capacidad_efectiva_recurso_turno(
        v_recurso.id, v_reclamo.fecha, v_reclamo.turno
      );
      IF v_capacidad <= 0 THEN
        CONTINUE;
      END IF;

      SELECT coalesce(sum(programacion.horas_estimadas), 0)
      INTO v_horas_programadas
      FROM public.programacion_areas AS programacion
      WHERE programacion.recurso_id = v_recurso.id
        AND programacion.fecha_programada = v_reclamo.fecha
        AND programacion.turno = v_reclamo.turno
        AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
        AND programacion.id IS DISTINCT FROM v_programacion_id;

      IF v_horas_programadas + v_reclamo.horas_estimadas > v_capacidad THEN
        CONTINUE;
      END IF;

      v_recurso_id := v_recurso.id;
      EXIT;
    END LOOP;

    IF v_recurso_id IS NULL THEN
      RAISE EXCEPTION 'sin_recurso_disponible' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_programacion_id IS NULL THEN
    INSERT INTO public.programacion_areas (
      orden_id, partida_id, recurso_id, secuencia, fecha_programada, turno,
      horas_estimadas, orden_prioridad, estado_planeacion, meta_proceso_id
    ) VALUES (
      v_reclamo.orden_id, v_reclamo.partida_id, v_recurso_id,
      v_secuencia, v_reclamo.fecha, v_reclamo.turno,
      v_reclamo.horas_estimadas, v_prioridad, 'en_preparacion',
      v_reclamo.meta_proceso_id
    )
    RETURNING id INTO v_programacion_id;
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET recurso_id = v_recurso_id,
        fecha_programada = v_reclamo.fecha,
        turno = v_reclamo.turno,
        horas_estimadas = v_reclamo.horas_estimadas,
        orden_prioridad = v_prioridad,
        estado_planeacion = 'en_preparacion',
        actualizado_en = now()
    WHERE programacion.id = v_programacion_id;
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET programacion_id = v_programacion_id,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN v_programacion_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'recurso_ocupado' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.preparar_reclamo_operador(uuid, uuid) IS
  'C10: crea o reactiva la programación de una operación reclamada, elige un recurso compatible con el área macro y la deja en en_preparacion. Solo service_role.';

REVOKE ALL ON FUNCTION public.preparar_reclamo_operador(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_reclamo_operador(uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Iniciar una operación reclamada (preparar + arrancar en una transacción)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_proceso_reclamado_operador(
  p_reclamo_id uuid,
  p_operador_id uuid,
  p_verificacion jsonb DEFAULT NULL,
  p_corrida_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha_inicio timestamptz,
  estado_sesion text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_programacion_id uuid;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_programacion_id := public.preparar_reclamo_operador(p_reclamo_id, p_operador_id);

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id;

  RETURN QUERY
  SELECT sesion.id, sesion.orden_id, sesion.partida_id, sesion.programacion_id,
    sesion.operador_id, sesion.fecha_inicio, sesion.estado_sesion,
    sesion.creado_en, sesion.actualizado_en
  FROM public.iniciar_sesion_trabajo_operador(
    v_reclamo.orden_id,
    v_reclamo.partida_id,
    v_programacion_id,
    p_operador_id,
    p_verificacion,
    p_corrida_id
  ) AS sesion;
END;
$$;

COMMENT ON FUNCTION public.iniciar_proceso_reclamado_operador(uuid, uuid, jsonb, uuid) IS
  'C10: prepara y arranca una operación reclamada en una sola transacción; si el inicio falla no queda recurso apartado. Solo service_role.';

REVOKE ALL ON FUNCTION public.iniciar_proceso_reclamado_operador(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_proceso_reclamado_operador(uuid, uuid, jsonb, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Sincronización reclamo ↔ programación
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.sincronizar_reclamo_con_programacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado_planeacion = 'completada'
     AND OLD.estado_planeacion IS DISTINCT FROM 'completada' THEN
    UPDATE public.reclamos_proceso_operador AS reclamo
    SET estado = 'completado',
        actualizado_en = now()
    WHERE reclamo.programacion_id = NEW.id
      AND reclamo.estado = 'activo';
  ELSIF NEW.estado_planeacion = 'cancelada'
        AND OLD.estado_planeacion IS DISTINCT FROM 'cancelada' THEN
    UPDATE public.reclamos_proceso_operador AS reclamo
    SET estado = 'liberado',
        actualizado_en = now()
    WHERE reclamo.programacion_id = NEW.id
      AND reclamo.estado = 'activo';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.sincronizar_reclamo_con_programacion()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sincronizar_reclamo_con_programacion ON public.programacion_areas;
CREATE TRIGGER trg_sincronizar_reclamo_con_programacion
  AFTER UPDATE OF estado_planeacion ON public.programacion_areas
  FOR EACH ROW
  EXECUTE FUNCTION privado.sincronizar_reclamo_con_programacion();
