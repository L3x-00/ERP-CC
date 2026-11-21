-- Reclamo por operación, no por partida (CRIT-2).
--
-- El índice único de reclamos activos ya es (partida_id, meta_proceso_id):
-- dos operadores pueden trabajar operaciones distintas de la misma partida.
-- Sin embargo, reclamar/iniciar/cerrar comparaban operador_asignado_id (un
-- único valor por partida) y bloqueaban a B aunque A estuviera en otra meta.
--
-- Ahora la posesión se comprueba por operación: el responsable de la partida
-- sigue siendo informativo y no se reasigna automáticamente. Se conserva el
-- rechazo estricto para la misma meta y para partidas sin ruteo.
-- Firmas, columnas, locks y permisos intactos (CREATE OR REPLACE).

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


CREATE OR REPLACE FUNCTION public.iniciar_sesion_trabajo_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_programacion_id uuid,
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
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_area_codigo text;
  v_estado_orden text;
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_activo boolean;
  v_piezas_previas numeric;
  v_partida_procesos text[];
  v_cantidad_solicitada_partida numeric;
  v_cantidad_producida_partida numeric;
  v_corrida public.corridas%ROWTYPE;
  v_proceso public.catalogo_procesos%ROWTYPE;
  v_verificacion jsonb := p_verificacion;
  v_corrida_id uuid := p_corrida_id;
  v_codigo_item text;
  v_cantidad_pendiente numeric;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_programacion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'inicio_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id, partida.area_trabajo_codigo,
         partida.cantidad_solicitada, partida.cantidad_producida, partida.procesos, partida.codigo_pieza
  INTO v_orden_id, v_operador_asignado_id, v_area_codigo,
       v_cantidad_solicitada_partida, v_cantidad_producida_partida, v_partida_procesos, v_codigo_item
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_orden_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.reclamos_proceso_operador AS reclamo
       JOIN public.programacion_areas AS programacion ON programacion.id = p_programacion_id
       WHERE reclamo.partida_id = p_partida_id
         AND reclamo.operador_id = p_operador_id
         AND reclamo.estado = 'activo'
         AND reclamo.meta_proceso_id IS NOT DISTINCT FROM programacion.meta_proceso_id
     ) THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND OR v_estado_orden NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_no_iniciable' USING ERRCODE = 'check_violation';
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

  IF NOT privado.operador_habilitado_area(p_operador_id, v_area_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
    AND programacion.orden_id = p_orden_id
    AND programacion.partida_id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.estado_planeacion <> 'en_preparacion' THEN
    RAISE EXCEPTION 'programacion_no_preparada' USING ERRCODE = 'check_violation';
  END IF;

  -- C29: secuencia con disponibilidad parcial. La operación puede arrancar o
  -- reanudarse solo cuando el proceso previo ya terminó piezas que esta
  -- operación todavía no haya consumido. Ya no se exceptúa la pausa: si el
  -- lote está agotado, hay que esperar a que el proceso previo libere más.
  IF v_programacion.meta_proceso_id IS NOT NULL THEN
    v_piezas_previas := privado.piezas_disponibles_proceso(v_programacion.meta_proceso_id);
    IF v_piezas_previas IS NOT NULL AND v_piezas_previas <= 0 THEN
      RAISE EXCEPTION 'proceso_previo_sin_piezas' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT recurso.activo INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND OR v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  -- Checklist: si no llega, se hereda el de la última sesión de la programación
  -- (permite que `reanudar_sesion_trabajo_a20` conserve el verificador original).
  IF v_verificacion IS NULL THEN
    SELECT sesion.verificacion_inicio INTO v_verificacion
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.programacion_id = p_programacion_id
    ORDER BY sesion.fecha_inicio DESC
    LIMIT 1;
  END IF;
  IF NOT privado.verificacion_inicio_completa(v_verificacion) THEN
    RAISE EXCEPTION 'verificacion_inicio_incompleta' USING ERRCODE = '23514';
  END IF;

  -- Corrida: la indicada, la activa del ítem o una legacy automática.
  IF v_corrida_id IS NOT NULL THEN
    SELECT * INTO v_corrida
    FROM public.corridas AS corrida
    WHERE corrida.id = v_corrida_id
    FOR UPDATE;
    IF NOT FOUND OR v_corrida.orden_id <> p_orden_id
       OR v_corrida.estado NOT IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA') THEN
      RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = v_corrida_id AND item.partida_id = p_partida_id
    ) THEN
      RAISE EXCEPTION 'corrida_item_no_incluye_partida' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- Preferencia: la corrida de la última sesión de esta programación (para
    -- que la reanudación conserve su corrida); si no, la única activa del ítem.
    SELECT corrida.* INTO v_corrida
    FROM public.sesiones_trabajo AS sesion
    JOIN public.corridas AS corrida ON corrida.id = sesion.corrida_id
    WHERE sesion.programacion_id = p_programacion_id
      AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA')
    ORDER BY sesion.fecha_inicio DESC
    LIMIT 1
    FOR UPDATE OF corrida;

    IF FOUND THEN
      v_corrida_id := v_corrida.id;
    ELSE
      SELECT count(*) INTO v_cantidad_pendiente
      FROM public.corridas AS corrida
      JOIN public.corrida_items AS item ON item.corrida_id = corrida.id
      WHERE item.partida_id = p_partida_id
        AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA');

      IF v_cantidad_pendiente > 1 THEN
        RAISE EXCEPTION 'corrida_ambigua' USING ERRCODE = '23514';
      END IF;

      SELECT corrida.* INTO v_corrida
      FROM public.corridas AS corrida
      JOIN public.corrida_items AS item ON item.corrida_id = corrida.id
      WHERE item.partida_id = p_partida_id
        AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA')
      ORDER BY corrida.creado_en DESC
      LIMIT 1
      FOR UPDATE OF corrida;
      IF FOUND THEN
        v_corrida_id := v_corrida.id;
      END IF;
    END IF;
  END IF;

  IF v_corrida_id IS NULL THEN
    -- Compatibilidad legacy: corrida automática de un solo ítem.
    SELECT proceso.* INTO v_proceso
    FROM public.catalogo_procesos AS proceso
    WHERE proceso.activo
      AND (
        EXISTS (
          SELECT 1 FROM public.metas_proceso_partida AS meta
          WHERE meta.partida_id = p_partida_id
            AND lower(btrim(meta.nombre)) IN (lower(btrim(proceso.nombre)), lower(btrim(proceso.codigo)))
        )
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(v_partida_procesos, '{}'::text[])) AS proceso_texto(valor)
          WHERE lower(btrim(proceso_texto.valor)) IN (lower(btrim(proceso.nombre)), lower(btrim(proceso.codigo)))
        )
      )
    ORDER BY proceso.orden
    LIMIT 1;

    IF v_proceso.id IS NULL THEN
      -- Fallback técnico de grandfathering: proceso activo genérico que no exija
      -- primera pieza (la partida legacy no declara procesos contra el catálogo;
      -- la ola 2 permitirá elegir la corrida/proceso reales).
      SELECT proceso.* INTO v_proceso
      FROM public.catalogo_procesos AS proceso
      WHERE proceso.activo AND NOT proceso.requiere_primera_pieza
      ORDER BY proceso.orden
      LIMIT 1;
    END IF;
    IF v_proceso.id IS NULL THEN
      SELECT proceso.* INTO v_proceso
      FROM public.catalogo_procesos AS proceso
      WHERE proceso.activo
      ORDER BY proceso.orden
      LIMIT 1;
    END IF;
    IF v_proceso.id IS NULL THEN
      RAISE EXCEPTION 'corrida_sin_proceso_disponible' USING ERRCODE = '23514';
    END IF;

    v_cantidad_pendiente := v_cantidad_solicitada_partida - v_cantidad_producida_partida;
    IF v_cantidad_pendiente IS NULL OR v_cantidad_pendiente <= 0 THEN
      RAISE EXCEPTION 'corrida_sin_pendiente' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partidas_orden_produccion'
        AND column_name = 'codigo_item'
    ) THEN
      EXECUTE 'SELECT coalesce(codigo_item, codigo_pieza) FROM public.partidas_orden_produccion WHERE id = $1'
      INTO v_codigo_item USING p_partida_id;
    END IF;

    INSERT INTO public.corridas (orden_id, codigo, proceso_id, cantidad_planificada, creado_por)
    VALUES (
      p_orden_id,
      privado.corrida_siguiente_codigo(p_orden_id, v_proceso.prefijo_corrida),
      v_proceso.id,
      v_cantidad_pendiente,
      p_operador_id
    )
    RETURNING public.corridas.id INTO v_corrida_id;

    INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
    VALUES (v_corrida_id, p_partida_id, v_codigo_item, v_cantidad_pendiente);
  END IF;
  PERFORM privado.iniciar_corrida_interna(v_corrida_id);

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'en_proceso'
  WHERE programacion.id = p_programacion_id;
  UPDATE public.ordenes_produccion AS orden
  SET estado = 'en_proceso', fecha_inicio = coalesce(orden.fecha_inicio, now())
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  WITH nueva_sesion AS (
    INSERT INTO public.sesiones_trabajo (
      orden_id, partida_id, programacion_id, operador_id, corrida_id, verificacion_inicio
    ) VALUES (
      p_orden_id, p_partida_id, p_programacion_id, p_operador_id, v_corrida_id, v_verificacion
    )
    RETURNING *
  ), marca AS (
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (p_partida_id, p_operador_id, 'inicio', 'Sesión de producción iniciada')
  )
  SELECT
    nueva_sesion.id, nueva_sesion.orden_id, nueva_sesion.partida_id,
    nueva_sesion.programacion_id, nueva_sesion.operador_id, nueva_sesion.fecha_inicio,
    nueva_sesion.estado_sesion, nueva_sesion.creado_en, nueva_sesion.actualizado_en
  FROM nueva_sesion;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'operador_o_programacion_con_sesion_activa' USING ERRCODE = 'unique_violation';
END;
$$;


CREATE OR REPLACE FUNCTION public.cerrar_sesion_trabajo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_estado_destino text,
  p_motivo_pausa text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_meta_proceso_id uuid DEFAULT NULL
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
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_cantidad_metas integer;
  v_es_meta_final boolean := false;
  v_hecho_meta numeric := 0;
  v_piezas_previas numeric;
  v_partida_completa boolean;
  v_es_ultima_secuencia boolean;
  v_orden_completa boolean;
  v_estado_programacion text;
  v_estado_orden text;
  v_codigo_motivo text;
  v_legacy_motivo text;
  v_requiere_nota boolean;
  v_jornada numeric;
  v_autorizacion_id uuid;
  v_corrida_id uuid;
  v_corrida_completa boolean;
  v_fecha_fin timestamptz;
  v_dia date;
  v_horas_dia numeric;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0 OR p_estado_destino NOT IN ('pausada', 'finalizada') THEN
    RAISE EXCEPTION 'cierre_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- Pausa: motivo del catálogo (o legacy) + nota si el catálogo la exige.
  IF p_estado_destino = 'pausada' THEN
    v_codigo_motivo := upper(btrim(coalesce(p_motivo_pausa, '')));
    SELECT motivo.requiere_nota INTO v_requiere_nota
    FROM public.catalogo_motivos_pausa AS motivo
    WHERE motivo.codigo = v_codigo_motivo AND motivo.activo;
    IF NOT FOUND THEN
      v_codigo_motivo := CASE btrim(coalesce(p_motivo_pausa, ''))
        WHEN 'falta_informacion' THEN 'DUDA'
        WHEN 'material_pendiente' THEN 'MATERIAL'
        WHEN 'aprobacion_cliente' THEN 'DUDA'
        WHEN 'problema_tecnico' THEN 'FALLA'
        WHEN 'mantenimiento' THEN 'FALLA'
        WHEN 'otro' THEN 'OTRA'
        ELSE NULL
      END;
      IF v_codigo_motivo IS NULL THEN
        RAISE EXCEPTION 'motivo_pausa_invalido' USING ERRCODE = 'check_violation';
      END IF;
      SELECT motivo.requiere_nota INTO v_requiere_nota
      FROM public.catalogo_motivos_pausa AS motivo
      WHERE motivo.codigo = v_codigo_motivo;
    END IF;
    IF coalesce(v_requiere_nota, false) AND nullif(btrim(coalesce(p_notas, '')), '') IS NULL THEN
      RAISE EXCEPTION 'nota_pausa_requerida' USING ERRCODE = 'check_violation';
    END IF;
    v_legacy_motivo := privado.motivo_pausa_legacy(v_codigo_motivo);
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
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.reclamos_proceso_operador AS reclamo
       JOIN public.sesiones_trabajo AS sesion ON sesion.id = p_sesion_id
       JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
       WHERE reclamo.partida_id = v_partida_id
         AND reclamo.operador_id = p_operador_id
         AND reclamo.estado = 'activo'
         AND reclamo.meta_proceso_id IS NOT DISTINCT FROM programacion.meta_proceso_id
     ) THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
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

  -- C23: la operación pudo quedar completada o bloqueada por otra sesión de la
  -- misma partida. Se bloquea igual y se decide el estado con los hechos, en
  -- vez de rechazar el cierre de una sesión que sí está activa.
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = (
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_programacion.estado_planeacion = 'cancelada' THEN
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

  -- C20: el cierre usa la hora real declarada por el operador cuando llega;
  -- sin declaración, mantiene el reloj del servidor como hasta ahora.
  v_fecha_fin := coalesce(v_sesion.fecha_fin_declarada, now());

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fecha_fin) AS calculo;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.programacion_areas AS posterior
    WHERE posterior.partida_id = v_sesion.partida_id
      AND posterior.secuencia > v_programacion.secuencia
      AND posterior.estado_planeacion <> 'cancelada'
  ) INTO v_es_ultima_secuencia;

  -- C20: la jornada se controla por DÍA laboral del operador, no por sesión.
  -- Reanudar el mismo día no reinicia el contador de horas extra.
  IF p_estado_destino = 'finalizada' THEN
    v_jornada := privado.obtener_jornada_recurso_turno(
      v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);
    v_dia := (v_sesion.fecha_inicio AT TIME ZONE 'America/Tijuana')::date;
    v_horas_dia := v_horas_netas
      + coalesce(privado.horas_netas_operador_dia(v_sesion.operador_id, v_dia), 0);
    IF v_horas_dia > v_jornada THEN
      -- Una justificación del propio operador, atada a ESTA sesión, cubre el
      -- exceso del día; la autorización de un responsable debe cubrir el total.
      SELECT autorizacion.id INTO v_autorizacion_id
      FROM public.autorizaciones_hora_extra AS autorizacion
      WHERE autorizacion.orden_id = v_sesion.orden_id
        AND (
          (autorizacion.estado = 'JUSTIFICADA' AND autorizacion.sesion_id = p_sesion_id)
          OR (
            autorizacion.estado = 'VIGENTE'
            AND (autorizacion.sesion_id = p_sesion_id OR autorizacion.sesion_id IS NULL)
            AND autorizacion.horas_autorizadas >= (v_horas_dia - v_jornada)
          )
        )
      ORDER BY
        CASE WHEN autorizacion.estado = 'JUSTIFICADA' THEN 0 ELSE 1 END,
        (autorizacion.sesion_id = p_sesion_id) DESC,
        autorizacion.creado_en
      LIMIT 1
      FOR UPDATE;
      IF v_autorizacion_id IS NULL THEN
        RAISE EXCEPTION 'horas_extra_sin_autorizacion' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_cantidad_metas
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = v_sesion.partida_id;

  IF v_cantidad_metas > 0 THEN
    IF p_meta_proceso_id IS NOT NULL THEN
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.id = p_meta_proceso_id AND meta.partida_id = v_sesion.partida_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- C9.0/D-3: sin meta explícita, el avance ES de la operación programada
      -- en la fila de la sesión. Solo las filas heredadas (meta NULL) conservan
      -- el respaldo histórico: la última meta de la partida.
      IF v_programacion.meta_proceso_id IS NOT NULL THEN
        SELECT meta.* INTO v_meta
        FROM public.metas_proceso_partida AS meta
        WHERE meta.id = v_programacion.meta_proceso_id
          AND meta.partida_id = v_sesion.partida_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
        END IF;
      ELSE
        SELECT meta.* INTO v_meta
        FROM public.metas_proceso_partida AS meta
        WHERE meta.partida_id = v_sesion.partida_id
        ORDER BY meta.secuencia DESC
        LIMIT 1
        FOR UPDATE;
      END IF;
    END IF;

    v_es_meta_final := v_meta.secuencia = (
      SELECT max(meta.secuencia) FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
    );
    SELECT coalesce(sum(avance.cantidad_producida), 0)
    INTO v_hecho_meta
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_piezas_producidas > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = 'check_violation';
    END IF;

    -- Tope de secuencia: solo se pueden declarar piezas que ya terminó el
    -- proceso inmediato anterior y que este proceso aún no consumió. Así una
    -- orden de 1000 puede doblar las primeras 100 cortadas sin esperar el lote
    -- completo, pero no puede adelantarse a un corte que aún no produce nada.
    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND p_piezas_producidas > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
    END IF;

    v_cantidad_producida_nueva := v_cantidad_producida_actual
      + CASE WHEN v_es_meta_final THEN p_piezas_producidas ELSE 0 END;
  ELSE
    IF v_cantidad_producida_actual + p_piezas_producidas > v_cantidad_solicitada THEN
      RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
    END IF;
    IF p_piezas_producidas > 0 AND v_es_ultima_secuencia = false THEN
      RAISE EXCEPTION 'produccion_solo_ultima_secuencia' USING ERRCODE = 'check_violation';
    END IF;
    v_cantidad_producida_nueva := v_cantidad_producida_actual + p_piezas_producidas;
  END IF;

  -- Primera pieza (§6.3): si el proceso de la corrida la exige, no se pueden
  -- declarar piezas sin una inspección PRIMERA_PIEZA APROBADA.
  v_corrida_id := v_sesion.corrida_id;
  IF p_piezas_producidas > 0 AND v_corrida_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.corridas AS corrida
      JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
      WHERE corrida.id = v_corrida_id AND proceso.requiere_primera_pieza
    ) AND NOT privado.primera_pieza_aprobada(v_corrida_id) THEN
      RAISE EXCEPTION 'primera_pieza_pendiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET
    fecha_fin = v_fecha_fin, horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
    piezas_producidas = p_piezas_producidas,
    motivo_pausa = CASE WHEN p_estado_destino = 'pausada' THEN v_legacy_motivo ELSE NULL END,
    motivo_pausa_codigo = CASE WHEN p_estado_destino = 'pausada' THEN v_codigo_motivo ELSE NULL END,
    motivo_pausa_nota = CASE WHEN p_estado_destino = 'pausada' THEN nullif(btrim(p_notas), '') ELSE NULL END,
    recurso_liberado = CASE WHEN p_estado_destino = 'pausada' THEN false ELSE recurso_liberado END,
    notas = nullif(btrim(p_notas), ''), estado_sesion = p_estado_destino
  WHERE sesion.id = p_sesion_id;

  IF v_autorizacion_id IS NOT NULL THEN
    UPDATE public.autorizaciones_hora_extra AS autorizacion
    SET estado = 'USADA'
    WHERE autorizacion.id = v_autorizacion_id;
  END IF;

  IF p_piezas_producidas > 0 THEN
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id, meta_proceso_id
    ) VALUES (v_sesion.partida_id, p_operador_id, p_piezas_producidas, 0, p_sesion_id, v_meta.id);
  END IF;
  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_producida_nueva
  WHERE partida.id = v_sesion.partida_id;

  -- C23: invariante única; no se acumulan minutos a mano.
  PERFORM privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

  v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);

  IF p_estado_destino = 'pausada' THEN
    -- C23: pausar una sesión no reabre una operación que otra sesión ya cerró.
    v_estado_programacion := CASE
      WHEN v_programacion.estado_planeacion IN ('completada', 'cancelada')
        THEN v_programacion.estado_planeacion
      WHEN EXISTS (
        SELECT 1 FROM public.sesiones_trabajo AS otra
        WHERE otra.programacion_id = v_sesion.programacion_id
          AND otra.id <> v_sesion.id
          AND otra.estado_sesion = 'activa'
      ) THEN 'en_proceso'
      ELSE 'bloqueada'
    END;
  ELSIF v_cantidad_metas > 0 THEN
    -- Con ruteo, cada operación se completa contra su propia meta. Un cierre
    -- con avance parcial vuelve a 'programada' en lugar de 'completada' para
    -- que el mismo proceso pueda retomarse sin esperar al proceso anterior.
    IF v_hecho_meta + p_piezas_producidas >= v_meta.meta_piezas THEN
      v_estado_programacion := 'completada';
    ELSE
      v_estado_programacion := 'programada';
    END IF;
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;

  -- Nunca degradar una operación ya completa cuando la partida sigue completa.
  IF v_programacion.estado_planeacion = 'completada' AND v_partida_completa THEN
    v_estado_programacion := 'completada';
  END IF;

  -- Si la programación de la sesión pertenece a otra operación (planeación con
  -- la secuencia desfasada, o un cambio de proceso a mitad de la sesión), el
  -- estado se aplica a la operación realmente trabajada y la de la sesión vuelve
  -- al pool. Así no se completa una operación en la que no se produjo nada.
  IF p_estado_destino <> 'pausada'
     AND v_programacion.meta_proceso_id IS NOT NULL
     AND v_programacion.meta_proceso_id IS DISTINCT FROM v_meta.id THEN
    UPDATE public.programacion_areas AS trabajada
    SET estado_planeacion = v_estado_programacion
    WHERE trabajada.partida_id = v_sesion.partida_id
      AND trabajada.meta_proceso_id = v_meta.id
      AND trabajada.id <> v_sesion.programacion_id;

    UPDATE public.programacion_areas AS propia
    SET estado_planeacion = 'programada'
    WHERE propia.id = v_sesion.programacion_id
      AND propia.estado_planeacion = 'en_proceso';
  ELSIF v_cantidad_metas > 0 AND v_meta.id IS NOT NULL
        AND v_programacion.meta_proceso_id IS NOT NULL
        AND v_estado_programacion = 'completada' THEN
    -- C16: al completar la operación se completan también sus días adicionales;
    -- la producción siguió usando solo la fila principal.
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'completada'
    WHERE programacion.partida_id = v_sesion.partida_id
      AND programacion.meta_proceso_id = v_meta.id
      AND programacion.estado_planeacion <> 'cancelada';
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = v_estado_programacion
    WHERE programacion.id = v_sesion.programacion_id;
  END IF;
  INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
  VALUES (
    v_sesion.partida_id, p_operador_id,
    CASE WHEN p_estado_destino = 'pausada' THEN 'pausa' ELSE 'fin' END,
    nullif(btrim(p_notas), '')
  );

  -- Estado de la corrida derivado de sus sesiones y metas.
  IF v_corrida_id IS NOT NULL THEN
    v_corrida_completa := NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = v_corrida_id
        AND NOT privado.partida_produccion_completa(item.partida_id)
    );
    IF v_corrida_completa THEN
      UPDATE public.corridas AS corrida SET estado = 'COMPLETADA'
      WHERE corrida.id = v_corrida_id AND corrida.estado <> 'CANCELADA';
    ELSIF EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.corrida_id = v_corrida_id AND sesion.estado_sesion = 'activa'
    ) THEN
      UPDATE public.corridas AS corrida SET estado = 'EN_PROCESO'
      WHERE corrida.id = v_corrida_id AND corrida.estado IN ('PLANIFICADA', 'PAUSADA');
    ELSE
      UPDATE public.corridas AS corrida SET estado = 'PAUSADA'
      WHERE corrida.id = v_corrida_id AND corrida.estado = 'EN_PROCESO';
    END IF;
  END IF;

  v_orden_completa := privado.orden_produccion_completa(v_sesion.orden_id);
  IF coalesce(v_orden_completa, false) THEN
    UPDATE public.ordenes_produccion AS orden
    SET estado = 'completada', fecha_fin = v_fecha_fin
    WHERE orden.id = v_sesion.orden_id;

    -- C23: aviso operativo, no bloqueo; la entrega puede registrarse después.
    IF NOT EXISTS (
      SELECT 1 FROM public.notas_entrega AS nota WHERE nota.orden_id = v_sesion.orden_id
    ) THEN
      INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
      VALUES (v_sesion.partida_id, p_operador_id, 'fin',
        'Orden completada sin nota de entrega registrada');
    END IF;
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


COMMENT ON FUNCTION public.reclamar_proceso_operador(uuid, uuid, uuid, uuid, date, text) IS
  'C18/CRIT-2: reserva de una operación; la exclusividad es por partida y meta, no por partida completa.';
COMMENT ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) IS
  'C10/C29/CRIT-2: inicia sesión si el operador tiene reclamo activo de esa operación, aunque no sea el responsable de la partida.';
COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) IS
  'C20/C23/CRIT-2: cierra la sesión del operador con reclamo activo de esa operación.';
