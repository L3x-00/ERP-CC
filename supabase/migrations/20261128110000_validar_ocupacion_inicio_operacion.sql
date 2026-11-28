-- Corrección 2026-11-28: el aviso de equipo ocupado solo funcionaba cuando ya
-- existía un reclamo. El inicio directo crea el reclamo dentro de la acción,
-- así que IT02 «Sin programar» abría el checklist y el error llegaba al final.
-- Esta RPC de solo lectura replica la elección/ocupación sin escribir datos,
-- con los mismos helpers y el mismo texto que `preparar_reclamo_operador`.

CREATE OR REPLACE FUNCTION public.validar_ocupacion_inicio_operacion(
  p_orden_id uuid,
  p_partida_id uuid,
  p_meta_proceso_id uuid,
  p_operador_id uuid,
  p_fecha date,
  p_turno text DEFAULT 'matutino'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_area_macro text;
  v_grupo_id uuid;
  v_programacion_id uuid;
  v_recurso record;
  v_detalle_ocupados text := '';
  v_hay_libre boolean := false;
  v_sesion_ajena_activa boolean := false;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_operador_id IS NULL OR p_fecha IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id AND partida.orden_id = p_orden_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);
  v_grupo_id := privado.grupo_equipo_requerido_operacion(p_meta_proceso_id);

  SELECT programacion.id INTO v_programacion_id
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = p_partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM p_meta_proceso_id
    AND programacion.estado_planeacion <> 'cancelada'
  ORDER BY programacion.creado_en DESC
  LIMIT 1;

  IF v_programacion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_programacion_id
      AND programacion.estado_planeacion = 'en_preparacion'
  ) THEN RETURN NULL; END IF;

  FOR v_recurso IN
    SELECT recurso.id,
           privado.obtener_capacidad_efectiva_recurso_turno(
             recurso.id, p_fecha, p_turno
           ) AS capacidad,
           EXISTS (
             SELECT 1 FROM public.programacion_areas AS ocupada
             WHERE ocupada.recurso_id = recurso.id
               AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
               AND ocupada.id IS DISTINCT FROM v_programacion_id
           ) AS ocupado
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.activo = true
      AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
      AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
    ORDER BY recurso.codigo
  LOOP
    IF v_recurso.capacidad <= 0 THEN CONTINUE; END IF;
    IF NOT v_recurso.ocupado THEN
      v_hay_libre := true;
      EXIT;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.programacion_areas AS ocupada
      JOIN public.sesiones_trabajo AS sesion
        ON sesion.programacion_id = ocupada.id
       AND sesion.estado_sesion = 'activa'
      WHERE ocupada.recurso_id = v_recurso.id
        AND sesion.operador_id IS DISTINCT FROM p_operador_id
    ) THEN
      v_sesion_ajena_activa := true;
    END IF;
    v_detalle_ocupados := concat_ws(
      '; ',
      nullif(v_detalle_ocupados, ''),
      privado.detalle_ocupacion_recurso(v_recurso.id, p_fecha, p_operador_id, v_programacion_id)
    );
  END LOOP;

  IF v_hay_libre THEN RETURN NULL; END IF;
  IF NOT v_sesion_ajena_activa THEN RETURN NULL; END IF;
  IF v_detalle_ocupados IS NULL OR v_detalle_ocupados = '' THEN RETURN NULL; END IF;
  RETURN v_detalle_ocupados
    || '. No puedes cancelar el trabajo en curso de otro operador desde aquí:'
    || ' pide que lo cierren o lo pausen, o reprograma esta operación.';
END;
$$;

REVOKE ALL ON FUNCTION public.validar_ocupacion_inicio_operacion(uuid, uuid, uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_ocupacion_inicio_operacion(uuid, uuid, uuid, uuid, date, text)
  TO service_role;

COMMENT ON FUNCTION public.validar_ocupacion_inicio_operacion(uuid, uuid, uuid, uuid, date, text) IS
  'Aviso de solo lectura antes del checklist: ocupación del equipo sin necesidad de reclamo previo.';
