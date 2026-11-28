-- Bug 2026-11-28: el tablero mostraba «Reservado por ti» pero «Iniciar proceso»
-- creaba otro reclamo y el índice único devolvía `proceso_ya_reclamado`, que se
-- traducía como «Otro operador acaba de tomar este proceso».
--
-- Si ya existe un reclamo ACTIVO del MISMO operador para la misma operación,
-- se reutiliza y se actualiza su fecha/turno/horas. El rechazo a otros
-- operadores y todas las validaciones (jornada, área, meta, stock previo,
-- locks y permisos) quedan intactos. Firma y grants sin cambios.

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

  IF v_horas > privado.jornada_laboral_dia(p_fecha) THEN
    RAISE EXCEPTION 'proceso_excede_jornada' USING ERRCODE = 'check_violation';
  END IF;

  -- Reutilización del reclamo propio: el inicio directo es idempotente.
  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.partida_id = p_partida_id
    AND reclamo.meta_proceso_id IS NOT DISTINCT FROM p_meta_proceso_id
    AND reclamo.estado = 'activo'
  ORDER BY reclamo.creado_en DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_reclamo.operador_id <> p_operador_id THEN
      RAISE EXCEPTION 'partida_asignada_otro_operador' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.reclamos_proceso_operador AS reclamo
       SET fecha = p_fecha,
           turno = p_turno,
           horas_estimadas = v_horas,
           actualizado_en = now()
     WHERE reclamo.id = v_reclamo.id
    RETURNING * INTO v_reclamo;

    RETURN QUERY
    SELECT reclamo.id, reclamo.orden_id, reclamo.partida_id, reclamo.meta_proceso_id,
      reclamo.programacion_id, reclamo.operador_id, reclamo.fecha, reclamo.turno,
      reclamo.horas_estimadas, reclamo.estado, reclamo.creado_en, reclamo.actualizado_en
    FROM public.reclamos_proceso_operador AS reclamo
    WHERE reclamo.id = v_reclamo.id;
    RETURN;
  END IF;

  -- La partida admite un solo operador responsable; el reclamo lo asigna si
  -- estaba libre y rechaza si ya pertenece a otro operador.
  IF v_partida.operador_asignado_id IS NULL THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET operador_asignado_id = p_operador_id
    WHERE partida.id = p_partida_id;
  ELSIF v_partida.operador_asignado_id <> p_operador_id
    AND NOT (
      p_meta_proceso_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.reclamos_proceso_operador AS reclamo
        WHERE reclamo.partida_id = p_partida_id
          AND reclamo.operador_id = v_partida.operador_asignado_id
          AND reclamo.estado = 'activo'
          AND reclamo.meta_proceso_id IS NOT DISTINCT FROM p_meta_proceso_id
      )
    ) THEN
    RAISE EXCEPTION 'partida_asignada_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  -- Serializa la jornada del operador para no rebasar la jornada del día con
  -- reclamos simultáneos desde dos terminales.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_operador_id::text || ':' || p_fecha::text, 0)
  );

  SELECT coalesce(sum(reclamo.horas_estimadas), 0)
  INTO v_ocupadas
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.operador_id = p_operador_id
    AND reclamo.fecha = p_fecha
    AND reclamo.estado = 'activo';

  IF v_ocupadas + v_horas > privado.jornada_laboral_dia(p_fecha) THEN
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
  'CRIT-2 + fix 2026-11-28: posesión por operación; reutiliza el reclamo activo del mismo operador para el inicio directo.';
