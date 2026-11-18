-- =============================================================================
-- C22 (2026-11-18): reclamar una máquina liberada de verdad.
--
-- Observación del cliente: en Producción > "Máquinas liberadas", pulsar
-- "Reclamar" respondía "No se pudo registrar la sesión de producción" y la
-- operación no aparecía para el operador.
--
-- Causa: `reclamar_recurso_liberado` solo marcaba `recurso_liberado = true`:
--   * La lista mostraba la sesión pausada aunque su programación ya no estuviera
--     `bloqueada`; la RPC exigía `bloqueada` y lanzaba `sin_sesion_liberable`,
--     que la UI no traducía y caía en el mensaje genérico.
--   * No cerraba la sesión pausada ni devolvía la programación al pool, así que
--     la operación seguía bloqueada y el operador no la veía.
--   * Elegía siempre la pausa más antigua de la máquina, sin distinguir la fila
--     concreta que el supervisor pulsó.
--
-- Corrección:
--   * La RPC acepta `p_sesion_id` (opcional) para reclamar exactamente la fila
--     mostrada; sin él conserva el comportamiento anterior (la más antigua).
--   * Finaliza la pausa (estado_sesion = 'finalizada'), marca `recurso_liberado`
--     y devuelve la programación a `programada`, liberando la operación.
--   * Valida permisos, motivo liberable, espera mínima de 60 min y que la pausa
--     sea la última de la operación, con códigos de error específicos.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- La firma cambia (nuevo parámetro opcional al final): se elimina la anterior
-- para no dejar dos sobrecargas que confundan a PostgREST.
DROP FUNCTION IF EXISTS public.reclamar_recurso_liberado(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reclamar_recurso_liberado(
  p_recurso_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_sesion_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_sesion_id uuid;
  v_partida_id uuid;
  v_orden_id uuid;
  v_estado_planeacion text;
BEGIN
  IF p_recurso_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reclamacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_reclamar_recurso' USING ERRCODE = '42501';
  END IF;

  -- Primera lectura sin lock solo para localizar la pausa y su programación.
  IF p_sesion_id IS NOT NULL THEN
    SELECT sesion.* INTO v_sesion
    FROM public.sesiones_trabajo AS sesion
    JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
    WHERE sesion.id = p_sesion_id
      AND programacion.recurso_id = p_recurso_id;
  ELSE
    SELECT sesion.* INTO v_sesion
    FROM public.sesiones_trabajo AS sesion
    JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
    JOIN public.catalogo_motivos_pausa AS motivo ON motivo.codigo = sesion.motivo_pausa_codigo
    WHERE programacion.recurso_id = p_recurso_id
      AND programacion.estado_planeacion IN ('bloqueada', 'programada')
      AND sesion.estado_sesion = 'pausada'
      AND sesion.recurso_liberado = false
      AND motivo.libera_maquina
      AND sesion.fecha_fin <= now() - interval '60 minutes'
    ORDER BY sesion.fecha_fin ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
  END IF;

  v_partida_id := v_sesion.partida_id;
  v_orden_id := v_sesion.orden_id;
  v_sesion_id := v_sesion.id;

  -- Contrato de locks: partida → orden → programación → recurso → sesión.
  PERFORM 1 FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id
  FOR UPDATE;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
  FOR UPDATE;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id
    AND programacion.recurso_id = p_recurso_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id
  FOR UPDATE;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = v_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.programacion_id <> v_programacion.id THEN
    RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.recurso_liberado THEN
    RAISE EXCEPTION 'recurso_ya_reclamado' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.estado_sesion <> 'pausada' THEN
    RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.motivo_pausa_codigo IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalogo_motivos_pausa AS motivo
    WHERE motivo.codigo = v_sesion.motivo_pausa_codigo
      AND motivo.libera_maquina
  ) THEN
    RAISE EXCEPTION 'motivo_no_liberable' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.fecha_fin IS NULL OR v_sesion.fecha_fin > now() - interval '60 minutes' THEN
    RAISE EXCEPTION 'pausa_reciente' USING ERRCODE = '23514';
  END IF;
  IF v_programacion.estado_planeacion NOT IN ('bloqueada', 'programada', 'en_preparacion') THEN
    RAISE EXCEPTION 'programacion_no_liberable' USING ERRCODE = '23514';
  END IF;

  -- Reclamar una pausa histórica ya retomada liberaría una máquina que hoy
  -- trabaja en otra sesión: solo vale la última pausa de la operación.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_trabajo AS posterior
    WHERE posterior.programacion_id = v_sesion.programacion_id
      AND posterior.id <> v_sesion.id
      AND (posterior.creado_en, posterior.id) > (v_sesion.creado_en, v_sesion.id)
  ) THEN
    RAISE EXCEPTION 'pausa_ya_superada' USING ERRCODE = '23514';
  END IF;

  -- La pausa ya fijó su corte de horas al pausarse; aquí solo se cierra.
  UPDATE public.sesiones_trabajo AS sesion
  SET estado_sesion = 'finalizada',
      recurso_liberado = true
  WHERE sesion.id = v_sesion.id;

  v_estado_planeacion := CASE
    WHEN v_programacion.estado_planeacion = 'bloqueada' THEN 'programada'
    ELSE v_programacion.estado_planeacion
  END;

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = v_estado_planeacion
  WHERE programacion.id = v_programacion.id;

  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (v_sesion.partida_id, p_actor_id, 'fin', 'Recurso liberado por supervisión');

  RETURN jsonb_build_object(
    'sesion_id', v_sesion.id,
    'recurso_id', p_recurso_id,
    'orden_id', v_sesion.orden_id,
    'partida_id', v_sesion.partida_id,
    'motivo_pausa_codigo', v_sesion.motivo_pausa_codigo,
    'pausada_desde', v_sesion.fecha_fin,
    'estado_planeacion', v_estado_planeacion
  );
END;
$$;

COMMENT ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid) IS
  'C22: finaliza la pausa liberable reclamada, marca recurso_liberado y devuelve la programación a programada para que la operación vuelva al pool. Solo service_role.';

REVOKE ALL ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid)
  TO service_role;
