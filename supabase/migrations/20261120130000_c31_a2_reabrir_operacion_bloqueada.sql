-- C31/A2 (2026-11-20): salida para una operación bloqueada sin sesión.
--
-- Hallazgo A2: una programación en `bloqueada` sin sesión activa ni pausada
-- válida mostraba «Continuar sesión» que no podía ejecutarse. Solo Planeación
-- podía desbloquearla. La operación vuelve a `programada`, se cierran sus
-- reclamos y se deja traza del actor para que el operador vea qué pasó.
--
-- No se reutiliza `liberar_preparacion_planeacion_auditada`: esa RPC no cierra
-- reclamos, no es idempotente y su auditoría dice «liberación de preparación».
--
-- Orden de locks: reclamo → partida → orden → programación → sesión(lectura).
-- Coincide con A1 y con `liberar_reclamo_operador` (C10).
--
-- Aplicar solo en local; el remoto lo controla el PO.
-- =============================================================================

ALTER TABLE public.programacion_areas
  ADD COLUMN IF NOT EXISTS reabierta_por uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS reabierta_en timestamptz,
  ADD COLUMN IF NOT EXISTS reabierta_correlation_id uuid,
  ADD COLUMN IF NOT EXISTS reabierta_reclamos_count integer;

CREATE UNIQUE INDEX IF NOT EXISTS ux_programacion_reabierta_correlation
  ON public.programacion_areas (reabierta_correlation_id)
  WHERE reabierta_correlation_id IS NOT NULL;

COMMENT ON COLUMN public.programacion_areas.reabierta_por IS
  'C31/A2: actor (admin o gerente con gestionar_planeacion) que reabrió la operación bloqueada.';
COMMENT ON COLUMN public.programacion_areas.reabierta_en IS
  'C31/A2: instante exacto de la reapertura.';
COMMENT ON COLUMN public.programacion_areas.reabierta_correlation_id IS
  'C31/A2: idempotencia de la reapertura; ligado a programación y actor.';
COMMENT ON COLUMN public.programacion_areas.reabierta_reclamos_count IS
  'C31/A2: cuántos reclamos se cerraron al reabrir la operación.';

DROP FUNCTION IF EXISTS public.reabrir_operacion_bloqueada(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reabrir_operacion_bloqueada(
  p_programacion_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_programacion public.programacion_areas%ROWTYPE;
  v_reclamo record;
  v_partida_id uuid;
  v_orden_id uuid;
  v_actor_nombre text;
  v_reabierta_en timestamptz;
  v_ya_aplicado boolean := false;
  v_reclamos_count integer := 0;
BEGIN
  IF p_programacion_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reclamacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_reabrir_operacion' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(usuario.nombre_completo, usuario.email)
  INTO v_actor_nombre
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id;

  -- Un correlation no puede reutilizarse para otra programación ni otro actor.
  IF p_correlation_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.programacion_areas AS otra
      WHERE otra.reabierta_correlation_id = p_correlation_id
        AND otra.id <> p_programacion_id
    ) THEN
      RAISE EXCEPTION 'conflicto_idempotencia'
        USING ERRCODE = '22023',
              DETAIL = 'La petición pertenece a otra operación.';
    END IF;
  END IF;

  -- Lectura sin lock para conocer partida y orden antes de tomar los locks.
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'P0002';
  END IF;
  v_partida_id := v_programacion.partida_id;
  v_orden_id := v_programacion.orden_id;

  FOR v_reclamo IN
    SELECT reclamo.id
    FROM public.reclamos_proceso_operador AS reclamo
    WHERE reclamo.partida_id = v_partida_id
      AND reclamo.estado = 'activo'
    ORDER BY reclamo.id
    FOR UPDATE
  LOOP
    NULL;
  END LOOP;

  PERFORM 1 FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id
  FOR UPDATE;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
  FOR UPDATE;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- Replay de la misma petición: no repetir UPDATEs ni evento de auditoría.
  IF p_correlation_id IS NOT NULL
     AND v_programacion.reabierta_correlation_id = p_correlation_id THEN
    IF v_programacion.estado_planeacion <> 'programada' THEN
      RAISE EXCEPTION 'operacion_no_bloqueada' USING ERRCODE = '23514';
    END IF;
    IF v_programacion.reabierta_por IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'conflicto_idempotencia'
        USING ERRCODE = '22023',
              DETAIL = 'La petición pertenece a otro actor.';
    END IF;
    v_ya_aplicado := true;
    v_reclamos_count := coalesce(v_programacion.reabierta_reclamos_count, 0);
    IF v_programacion.reabierta_por IS NOT NULL THEN
      SELECT coalesce(usuario.nombre_completo, usuario.email)
      INTO v_actor_nombre
      FROM public.usuarios AS usuario
      WHERE usuario.id = v_programacion.reabierta_por;
    END IF;
  END IF;

  IF NOT v_ya_aplicado THEN
    IF v_programacion.estado_planeacion <> 'bloqueada' THEN
      RAISE EXCEPTION 'operacion_no_bloqueada' USING ERRCODE = '23514';
    END IF;

    -- Misma definición de "sin sesión" que el diagnóstico C23: se ignoran
    -- sesiones inválidas y pausas ya liberadas por administración.
    IF EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.programacion_id = p_programacion_id
        AND sesion.estado_sesion IN ('activa', 'pausada')
        AND NOT sesion.sesion_invalida
        AND NOT sesion.recurso_liberado
    ) THEN
      RAISE EXCEPTION 'sesion_pendiente' USING ERRCODE = '23514';
    END IF;

    FOR v_reclamo IN
      SELECT reclamo.id
      FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.programacion_id = p_programacion_id
        AND reclamo.estado = 'activo'
      ORDER BY reclamo.id
      FOR UPDATE
    LOOP
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET estado = 'liberado',
          actualizado_en = now()
      WHERE reclamo.id = v_reclamo.id;
      v_reclamos_count := v_reclamos_count + 1;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.partida_id = v_partida_id
        AND reclamo.estado = 'activo'
    ) THEN
      UPDATE public.partidas_orden_produccion AS partida
      SET operador_asignado_id = NULL
      WHERE partida.id = v_partida_id;
    END IF;

    v_reabierta_en := now();
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'programada',
        reabierta_por = p_actor_id,
        reabierta_en = v_reabierta_en,
        reabierta_correlation_id = p_correlation_id,
        reabierta_reclamos_count = v_reclamos_count
    WHERE programacion.id = p_programacion_id;

    v_programacion.estado_planeacion := 'programada';
    v_programacion.reabierta_por := p_actor_id;
    v_programacion.reabierta_en := v_reabierta_en;

    INSERT INTO public.orden_eventos_cambio (
      orden_id, tipo, detalle, motivo, actor_id, correlation_id
    ) VALUES (
      v_programacion.orden_id,
      'reapertura_operacion_bloqueada',
      jsonb_build_object(
        'programacion_id', p_programacion_id,
        'partida_id', v_partida_id,
        'estado_anterior', 'bloqueada',
        'estado_nuevo', 'programada',
        'reclamos_cerrados', v_reclamos_count
      ),
      'Reapertura de operación bloqueada sin sesión',
      p_actor_id,
      p_correlation_id
    );
  END IF;

  RETURN jsonb_build_object(
    'programacion_id', p_programacion_id,
    'orden_id', v_programacion.orden_id,
    'partida_id', v_programacion.partida_id,
    'estado_planeacion', v_programacion.estado_planeacion,
    'ya_aplicado', v_ya_aplicado,
    'reclamos_liberados', v_reclamos_count,
    'reabierta_por', v_programacion.reabierta_por,
    'reabierta_por_nombre', v_actor_nombre,
    'reabierta_en', v_programacion.reabierta_en
  );
END;
$$;

COMMENT ON FUNCTION public.reabrir_operacion_bloqueada(uuid, uuid, uuid) IS
  'C31/A2: reabre una operación bloqueada sin sesión válida, cierra reclamos, limpia asignaciones huérfanas y deja auditoría con actor y correlation. Solo service_role.';

REVOKE ALL ON FUNCTION public.reabrir_operacion_bloqueada(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_operacion_bloqueada(uuid, uuid, uuid)
  TO service_role;
