-- Corrección obs: aviso de equipo ocupado ANTES de abrir el checklist.
--
-- `preparar_reclamo_operador` elige la máquina en el momento del inicio, así que
-- el cliente no conoce el recurso destino y no puede detectar la ocupación por
-- su cuenta. Esta RPC de solo lectura replica únicamente la parte de elección y
-- ocupación (sin la adopción C9.0 ni los writes finales) para devolver el mismo
-- texto que produces la RPC real. No modifica datos; la RPC sigue siendo la
-- autoridad definitiva ante cambios concurrentes.
CREATE OR REPLACE FUNCTION public.validar_ocupacion_inicio_reclamo(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_area_macro text;
  v_grupo_id uuid;
  v_programacion_id uuid;
  v_recurso record;
  v_detalle_ocupados text := '';
  v_hay_libre boolean := false;
BEGIN
  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id AND reclamo.estado = 'activo';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);
  v_grupo_id := privado.grupo_equipo_requerido_operacion(v_reclamo.meta_proceso_id);

  SELECT programacion.id INTO v_programacion_id
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = v_reclamo.partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM v_reclamo.meta_proceso_id
    AND programacion.estado_planeacion <> 'cancelada'
  ORDER BY programacion.creado_en DESC
  LIMIT 1;

  -- La RPC real retorna antes de revisar ocupación si ya está en preparación.
  IF v_programacion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_programacion_id
      AND programacion.estado_planeacion = 'en_preparacion'
  ) THEN RETURN NULL; END IF;

  FOR v_recurso IN
    SELECT recurso.id,
           privado.obtener_capacidad_efectiva_recurso_turno(
             recurso.id, v_reclamo.fecha, v_reclamo.turno
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
    v_detalle_ocupados := concat_ws(
      '; ',
      nullif(v_detalle_ocupados, ''),
      privado.detalle_ocupacion_recurso(
        v_recurso.id, v_reclamo.fecha, p_operador_id, v_programacion_id
      )
    );
  END LOOP;

  IF v_hay_libre THEN RETURN NULL; END IF;
  IF v_detalle_ocupados IS NULL OR v_detalle_ocupados = '' THEN RETURN NULL; END IF;
  RETURN v_detalle_ocupados
    || '. No puedes cancelar el trabajo en curso de otro operador desde aquí:'
    || ' pide que lo cierren o lo pausen, o reprograma esta operación.';
END;
$$;

REVOKE ALL ON FUNCTION public.validar_ocupacion_inicio_reclamo(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_ocupacion_inicio_reclamo(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.validar_ocupacion_inicio_reclamo(uuid, uuid) IS
  'Aviso de solo lectura: devuelve el detalle de ocupación de los equipos candidatos antes de abrir el checklist de inicio.';
