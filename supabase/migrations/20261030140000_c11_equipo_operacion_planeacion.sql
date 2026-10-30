-- =============================================================================
-- C11 - Equipo/área correcto por operación del ruteo en Planeación.
--
-- Problema: la compatibilidad de máquina se evaluaba contra TODOS los grupos de
-- la partida. Una partida con láser y doblez aceptaba una CNC para la operación
-- de láser, y la tarjeta solo mostraba el código de la máquina.
--
-- Regla:
--   1. El grupo que exige una operación sale del ruteo de la propuesta
--      (propuesta_item_ruteo.grupo_equipo_id) para esa secuencia.
--   2. Si el ruteo no lo capturó, se resuelve por el catálogo del proceso
--      (nombre o código) y, como respaldo, por la estación de la partida.
--   3. La máquina debe pertenecer a ese grupo. Sin grupo en la operación o en
--      la máquina, «sin dato» y no se bloquea (compatibilidad histórica).
--
-- Aditiva: no cambia firmas ni columnas. Solo local hasta que el PO aplique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Grupo de equipo que exige una operación concreta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.grupo_equipo_requerido_operacion(
  p_meta_proceso_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partida_id uuid;
  v_secuencia smallint;
  v_nombre text;
  v_item_id uuid;
  v_maquina text;
  v_grupo uuid;
BEGIN
  IF p_meta_proceso_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT meta.partida_id, meta.secuencia, meta.nombre
  INTO v_partida_id, v_secuencia, v_nombre
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT partida.propuesta_item_id, partida.maquina_asignada
  INTO v_item_id, v_maquina
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_partida_id;

  -- 1. Grupo capturado explícitamente en la ficha de ruteo de la propuesta.
  IF v_item_id IS NOT NULL THEN
    SELECT ruteo.grupo_equipo_id
    INTO v_grupo
    FROM public.propuesta_item_ruteo AS ruteo
    WHERE ruteo.item_id = v_item_id
      AND ruteo.secuencia = v_secuencia;

    IF v_grupo IS NOT NULL THEN
      RETURN v_grupo;
    END IF;
  END IF;

  -- 2. Grupo configurado en el catálogo del proceso (nombre o código).
  SELECT proceso.grupo_equipo_id
  INTO v_grupo
  FROM public.catalogo_procesos AS proceso
  WHERE proceso.grupo_equipo_id IS NOT NULL
    AND (
      lower(regexp_replace(btrim(proceso.nombre), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_nombre), '[[:space:]]+', ' ', 'g'))
      OR lower(regexp_replace(btrim(proceso.codigo), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_nombre), '[[:space:]]+', ' ', 'g'))
    )
  ORDER BY proceso.orden
  LIMIT 1;

  IF v_grupo IS NOT NULL THEN
    RETURN v_grupo;
  END IF;

  -- 3. Respaldo: estación anotada en la partida.
  IF v_maquina IS NOT NULL AND btrim(v_maquina) <> '' THEN
    SELECT recurso.grupo_equipo_id
    INTO v_grupo
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.grupo_equipo_id IS NOT NULL
      AND lower(regexp_replace(btrim(recurso.codigo), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_maquina), '[[:space:]]+', ' ', 'g'))
    LIMIT 1;
  END IF;

  RETURN v_grupo;
END;
$$;

COMMENT ON FUNCTION privado.grupo_equipo_requerido_operacion(uuid) IS
  'C11: grupo de equipo que pide una operación del ruteo (propuesta → catálogo → estación de la partida); NULL = sin dato.';

REVOKE ALL ON FUNCTION privado.grupo_equipo_requerido_operacion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Compatibilidad de la máquina contra la operación, no contra la partida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.recurso_compatible_con_operacion(
  p_partida_id uuid,
  p_meta_proceso_id uuid,
  p_recurso_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grupo_recurso uuid;
  v_grupo_requerido uuid;
BEGIN
  SELECT recurso.grupo_equipo_id
  INTO v_grupo_recurso
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  -- Sin grupo en la máquina: «sin dato», nunca bloquea.
  IF v_grupo_recurso IS NULL THEN
    RETURN true;
  END IF;

  -- Fila heredada sin operación: conserva la validación histórica por partida.
  IF p_meta_proceso_id IS NULL THEN
    RETURN privado.recurso_compatible_con_partida(p_partida_id, p_recurso_id);
  END IF;

  v_grupo_requerido := privado.grupo_equipo_requerido_operacion(p_meta_proceso_id);

  -- Sin grupo resuelto para la operación: «sin dato», no se inventa.
  IF v_grupo_requerido IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_grupo_recurso = v_grupo_requerido;
END;
$$;

COMMENT ON FUNCTION privado.recurso_compatible_con_operacion(uuid, uuid, uuid) IS
  'C11: true cuando la máquina pertenece al grupo de equipo de la operación indicada (o falta el dato); false solo si ambos grupos se conocen y difieren.';

REVOKE ALL ON FUNCTION privado.recurso_compatible_con_operacion(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Programar: rechaza el recurso de otro grupo (misma firma; GRANT intacto).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.programar_partida_recurso(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer DEFAULT 1,
  p_meta_proceso_id uuid DEFAULT NULL
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
  v_secuencia smallint;
BEGIN
  IF p_orden_id IS NULL
     OR p_partida_id IS NULL
     OR p_recurso_id IS NULL
     OR p_fecha_programada IS NULL
     OR p_turno NOT IN ('matutino', 'vespertino', 'nocturno')
     OR p_horas_estimadas IS NULL
     OR p_horas_estimadas <= 0
     OR p_horas_estimadas > 24
     OR p_orden_prioridad IS NULL
     OR p_orden_prioridad NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- C9.0: con operaciÃ³n la secuencia se deriva de la meta (el formulario la
  -- deja de capturar); sin operaciÃ³n la secuencia manual sigue siendo obligatoria.
  IF p_meta_proceso_id IS NULL THEN
    IF p_secuencia IS NULL OR p_secuencia <= 0 THEN
      RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_secuencia IS NOT NULL THEN
    RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Contrato de locks: partida â†’ orden â†’ recurso (igual que el motor de sesiones).
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

  -- La operaciÃ³n debe pertenecer a la partida; bajo el lock de la partida.
  IF p_meta_proceso_id IS NOT NULL THEN
    SELECT meta.secuencia
    INTO v_secuencia
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = p_meta_proceso_id
      AND meta.partida_id = p_partida_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_secuencia := p_secuencia;
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

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide programar el
  -- recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_operacion(p_partida_id, p_meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
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
    estado_planeacion,
    meta_proceso_id
  ) VALUES (
    p_orden_id,
    p_partida_id,
    p_recurso_id,
    v_secuencia,
    p_fecha_programada,
    p_turno,
    p_horas_estimadas,
    p_orden_prioridad,
    'programada',
    p_meta_proceso_id
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
-- 4. Reprogramar: el mismo candado sobre la operación de la fila (misma firma).
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
  -- Una programaciÃ³n en preparaciÃ³n/ejecuciÃ³n ya tiene recurso y sesiÃ³n
  -- comprometidos: moverla dejarÃ­a el histÃ³rico de capacidad inconsistente.
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

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide reprogramar hacia
  -- un recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_operacion(v_programacion.partida_id, v_programacion.meta_proceso_id, p_recurso_id) THEN
    RAISE EXCEPTION 'recurso_incompatible' USING ERRCODE = 'check_violation';
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
