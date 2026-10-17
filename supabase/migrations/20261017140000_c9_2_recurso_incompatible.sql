-- =============================================================================
-- C9.2 / P-04 (respuesta del cliente 2026-10-15) — impedir programar fuera del
-- grupo de equipo que pide el ruteo de la partida.
--
-- La respuesta a P-04 fue «impedir» (no solo advertir): las dos RPC de
-- programación rechazan con `recurso_incompatible` cuando el grupo del recurso
-- elegido y los grupos que exige el ruteo se conocen y no coinciden. Espeja la
-- utilidad del panel `src/modulos/planeacion/utilidades/compatibilidad.ts`:
--   · Grupos requeridos = grupos de los procesos del ruteo (código o nombre,
--     normalizados) y, si el ruteo no resuelve ninguno, el grupo de la estación
--     «Equipo / estación» del desglose (partidas.maquina_asignada).
--   · «Sin dato» en cualquier lado nunca bloquea.
--   · Varias máquinas del mismo grupo sí pueden programarse y activarse en
--     simultáneo: el candado del índice parcial sigue siendo por recurso.
--
-- Aditiva: no cambia firmas ni columnas (los GRANT vigentes siguen aplicando).
-- Solo local hasta que el PO la aplique en remoto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Candado interno de compatibilidad (espejo de la utilidad del panel).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.recurso_compatible_con_partida(
  p_partida_id uuid,
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
  v_grupos_requeridos uuid[];
BEGIN
  SELECT recurso.grupo_equipo_id
  INTO v_grupo_recurso
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  -- Sin grupo en el recurso: «sin dato», nunca bloquea.
  IF v_grupo_recurso IS NULL THEN
    RETURN true;
  END IF;

  -- Grupos de los procesos del ruteo (por código o nombre, normalizados).
  SELECT array_agg(DISTINCT proceso.grupo_equipo_id)
  INTO v_grupos_requeridos
  FROM public.partidas_orden_produccion AS partida
  CROSS JOIN LATERAL unnest(coalesce(partida.procesos, ARRAY[]::text[])) AS ruteo(valor)
  JOIN public.catalogo_procesos AS proceso
    ON lower(regexp_replace(btrim(proceso.codigo), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(ruteo.valor), '[[:space:]]+', ' ', 'g'))
    OR lower(regexp_replace(btrim(proceso.nombre), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(ruteo.valor), '[[:space:]]+', ' ', 'g'))
  WHERE partida.id = p_partida_id
    AND proceso.grupo_equipo_id IS NOT NULL;

  -- Respaldo: sin grupos del ruteo, la estación del desglose (maquina_asignada).
  IF v_grupos_requeridos IS NULL THEN
    SELECT array_agg(DISTINCT respaldo.grupo_equipo_id)
    INTO v_grupos_requeridos
    FROM public.partidas_orden_produccion AS partida
    JOIN public.recursos_planeacion AS respaldo
      ON lower(regexp_replace(btrim(respaldo.codigo), '[[:space:]]+', ' ', 'g'))
         = lower(regexp_replace(btrim(partida.maquina_asignada), '[[:space:]]+', ' ', 'g'))
    WHERE partida.id = p_partida_id
      AND partida.maquina_asignada IS NOT NULL
      AND btrim(partida.maquina_asignada) <> ''
      AND respaldo.grupo_equipo_id IS NOT NULL;
  END IF;

  -- Sin grupos requeridos resueltos: «sin dato», nunca bloquea.
  IF v_grupos_requeridos IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_grupo_recurso = ANY (v_grupos_requeridos);
END;
$$;

COMMENT ON FUNCTION privado.recurso_compatible_con_partida(uuid, uuid) IS
  'C9.2/P-04: true cuando el recurso puede programarse para la partida (compatible o sin dato); solo false cuando ambos lados se conocen y difieren.';

-- -----------------------------------------------------------------------------
-- 2. Programar: rechaza el recurso de otro grupo (misma firma; GRANT intacto).
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

  -- C9.0: con operación la secuencia se deriva de la meta (el formulario la
  -- deja de capturar); sin operación la secuencia manual sigue siendo obligatoria.
  IF p_meta_proceso_id IS NULL THEN
    IF p_secuencia IS NULL OR p_secuencia <= 0 THEN
      RAISE EXCEPTION 'programacion_invalida' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_secuencia IS NOT NULL THEN
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

  -- La operación debe pertenecer a la partida; bajo el lock de la partida.
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
  IF NOT privado.recurso_compatible_con_partida(p_partida_id, p_recurso_id) THEN
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
-- 3. Reprogramar: el mismo candado sobre la partida de la fila (misma firma).
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

  -- C9.2/P-04 (respuesta del cliente 2026-10-15): se impide reprogramar hacia
  -- un recurso fuera del grupo de equipo que pide el ruteo de la partida.
  IF NOT privado.recurso_compatible_con_partida(v_programacion.partida_id, p_recurso_id) THEN
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
