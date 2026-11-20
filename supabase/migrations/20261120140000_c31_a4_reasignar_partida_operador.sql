-- C31/A4 (2026-11-20): reasignación administrativa de una partida.
--
-- Hallazgo A4: al completar una operación, `operador_asignado_id` seguía
-- apuntando al operador anterior, así que otro operador no podía reclamar la
-- operación siguiente y no había UI para corregirlo.
--
-- Orden de locks: reclamo → partida → orden → programación → sesión(lectura).
-- Aplicar solo en local; el remoto lo controla el PO.
-- =============================================================================

ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS reasignada_por uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS reasignada_en timestamptz,
  ADD COLUMN IF NOT EXISTS reasignada_correlation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ux_partidas_reasignada_correlation
  ON public.partidas_orden_produccion (reasignada_correlation_id)
  WHERE reasignada_correlation_id IS NOT NULL;

COMMENT ON COLUMN public.partidas_orden_produccion.reasignada_por IS
  'C31/A4: actor (admin o gerente) que reasignó la partida a otro operador.';
COMMENT ON COLUMN public.partidas_orden_produccion.reasignada_en IS
  'C31/A4: instante de la reasignación.';
COMMENT ON COLUMN public.partidas_orden_produccion.reasignada_correlation_id IS
  'C31/A4: idempotencia de la reasignación.';

DROP FUNCTION IF EXISTS public.reasignar_partida_operador(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reasignar_partida_operador(
  p_partida_id uuid,
  p_operador_nuevo uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_reclamo record;
  v_operador_nombre text;
  v_actor_nombre text;
  v_operador_rol text;
  v_operador_activo boolean;
  v_reasignada_en timestamptz;
  v_ya_aplicado boolean := false;
  v_reclamos_count integer := 0;
  v_hoy date := (now() AT TIME ZONE 'America/Tijuana')::date;
  v_horas_ocupadas numeric;
BEGIN
  IF p_partida_id IS NULL OR p_operador_nuevo IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reasignacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_reasignar' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(usuario.nombre_completo, usuario.email)
  INTO v_actor_nombre
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id;

  IF p_correlation_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.partidas_orden_produccion AS otra
      WHERE otra.reasignada_correlation_id = p_correlation_id
        AND otra.id <> p_partida_id
    ) THEN
      RAISE EXCEPTION 'conflicto_idempotencia'
        USING ERRCODE = '22023', DETAIL = 'La petición pertenece a otra partida.';
    END IF;
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;

  FOR v_reclamo IN
    SELECT reclamo.id
    FROM public.reclamos_proceso_operador AS reclamo
    WHERE reclamo.partida_id = p_partida_id
      AND reclamo.estado = 'activo'
    ORDER BY reclamo.id
    FOR UPDATE
  LOOP
    NULL;
  END LOOP;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF p_correlation_id IS NOT NULL
     AND v_partida.reasignada_correlation_id = p_correlation_id THEN
    IF v_partida.operador_asignado_id IS DISTINCT FROM p_operador_nuevo THEN
      RAISE EXCEPTION 'operador_asignado_distinto' USING ERRCODE = '23514';
    END IF;
    v_ya_aplicado := true;
    IF v_partida.reasignada_por IS NOT NULL THEN
      SELECT coalesce(usuario.nombre_completo, usuario.email)
      INTO v_actor_nombre
      FROM public.usuarios AS usuario
      WHERE usuario.id = v_partida.reasignada_por;
    END IF;
  END IF;

  IF NOT v_ya_aplicado THEN
    SELECT coalesce(usuario.nombre_completo, usuario.email), usuario.rol, usuario.activo
    INTO v_operador_nombre, v_operador_rol, v_operador_activo
    FROM public.usuarios AS usuario
    WHERE usuario.id = p_operador_nuevo;
    IF v_operador_nombre IS NULL OR v_operador_rol <> 'operador'
       OR coalesce(v_operador_activo, false) = false THEN
      RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = '23514';
    END IF;

    IF NOT privado.operador_habilitado_area(p_operador_nuevo, v_partida.area_trabajo_codigo) THEN
      RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.partida_id = p_partida_id
        AND sesion.estado_sesion IN ('activa', 'pausada')
        AND NOT sesion.sesion_invalida
        AND NOT sesion.recurso_liberado
    ) THEN
      RAISE EXCEPTION 'partida_con_sesion_activa' USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(reclamo.horas_estimadas), 0)
    INTO v_horas_ocupadas
    FROM public.reclamos_proceso_operador AS reclamo
    WHERE reclamo.operador_id = p_operador_nuevo
      AND reclamo.fecha = v_hoy
      AND reclamo.estado = 'activo';
    IF v_horas_ocupadas >= 8 THEN
      RAISE EXCEPTION 'capacidad_diaria_insuficiente' USING ERRCODE = '23514';
    END IF;

    FOR v_reclamo IN
      SELECT reclamo.id
      FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.partida_id = p_partida_id
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

    v_reasignada_en := now();
    UPDATE public.partidas_orden_produccion AS partida
    SET operador_asignado_id = p_operador_nuevo,
        reasignada_por = p_actor_id,
        reasignada_en = v_reasignada_en,
        reasignada_correlation_id = p_correlation_id,
        actualizado_en = now()
    WHERE partida.id = p_partida_id;

    v_partida.operador_asignado_id := p_operador_nuevo;
    v_partida.reasignada_por := p_actor_id;
    v_partida.reasignada_en := v_reasignada_en;

    INSERT INTO public.orden_eventos_cambio (
      orden_id, tipo, detalle, motivo, actor_id, correlation_id
    ) VALUES (
      v_partida.orden_id,
      'reasignacion_operador_partida',
      jsonb_build_object(
        'partida_id', p_partida_id,
        'operador_nuevo', p_operador_nuevo,
        'operador_nombre', v_operador_nombre,
        'reclamos_cerrados', v_reclamos_count
      ),
      'Reasignación administrativa de responsable de partida',
      p_actor_id,
      p_correlation_id
    );
  END IF;

  SELECT coalesce(usuario.nombre_completo, usuario.email)
  INTO v_actor_nombre
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id;

  RETURN jsonb_build_object(
    'partida_id', p_partida_id,
    'orden_id', v_partida.orden_id,
    'operador_asignado_id', v_partida.operador_asignado_id,
    'operador_nombre', v_operador_nombre,
    'ya_aplicado', v_ya_aplicado,
    'reclamos_liberados', v_reclamos_count,
    'reasignada_por', v_partida.reasignada_por,
    'reasignada_por_nombre', v_actor_nombre,
    'reasignada_en', v_partida.reasignada_en
  );
END;
$$;

COMMENT ON FUNCTION public.reasignar_partida_operador(uuid, uuid, uuid, uuid) IS
  'C31/A4: reasigna el responsable de una partida sin sesión activa, valida área y capacidad, cierra reclamos y audita con actor y correlation. Solo service_role.';

REVOKE ALL ON FUNCTION public.reasignar_partida_operador(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reasignar_partida_operador(uuid, uuid, uuid, uuid)
  TO service_role;
