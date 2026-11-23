-- Corrección observación 6: permite que el operador inicie una operación
-- reclamada aunque la orden siga en borrador (no liberada a Bandeja).
-- Reutiliza el cuerpo vigente de iniciar_sesion_trabajo_operador y solo amplía
-- la lista de estados iniciables. Sin cambios en reclamar ni en cerrar.

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
  -- Corrección obs 6: el operador inicia desde su reclamo con el día/turno que
  -- ya tiene, sin esperar a que Planeación programe ni a que un admin libere
  -- la orden a Bandeja. Se conservan el resto de validaciones y el cambio a
  -- 'en_proceso' que hace esta misma RPC al abrir la sesión.
  IF NOT FOUND OR v_estado_orden NOT IN ('borrador', 'programada', 'pausada', 'en_proceso') THEN
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
COMMENT ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) IS
  'C10/C29/CRIT-2/obs6: inicia la sesión del operador con reclamo activo; admite orden en borrador para no depender de la liberación administrativa.';
