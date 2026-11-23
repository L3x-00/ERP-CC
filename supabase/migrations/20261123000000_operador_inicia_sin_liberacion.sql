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

-- El inicio pasa primero por preparar_reclamo_operador: sin este cambio la
-- petición fallaba con orden_pendiente_liberacion antes de llegar a iniciar.
CREATE OR REPLACE FUNCTION public.preparar_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_area_macro text;
  v_grupo_id uuid;
  v_grupo_nombre text;
  v_recurso record;
  v_recurso_preferido uuid;
  v_recurso_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
  v_libre numeric;
  v_prioridad integer;
  v_programacion_id uuid;
  v_secuencia smallint := 1;
  v_total_metas integer;
  v_reutiliza_programacion boolean := false;
  v_total_equipos integer := 0;
  v_equipos_con_capacidad integer := 0;
  v_sin_capacidad text;
  v_detalle_ocupados text;
  v_mejor_recurso text;
  v_mejor_libre numeric;
  v_mejor_capacidad numeric;
  v_mejor_cargado numeric;
  v_mensaje text;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> v_reclamo.orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- Corrección obs 6 (segunda parte): el inicio del operador pasa primero por
  -- esta función, que todavía exigía la liberación a Bandeja. Se admite también
  -- 'borrador' para que la reserva se cree con el día/turno ya capturados.
  IF v_orden.estado NOT IN ('borrador', 'programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_pendiente_liberacion' USING ERRCODE = 'check_violation';
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

  IF v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT * INTO v_meta
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = v_reclamo.meta_proceso_id
      AND meta.partida_id = v_reclamo.partida_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    v_secuencia := v_meta.secuencia;
  END IF;

  v_prioridad := CASE v_orden.prioridad
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'normal' THEN 3
    ELSE 4
  END;

  -- ¿Ya existe la fila de programación de esta operación?
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = v_reclamo.partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM v_reclamo.meta_proceso_id
  FOR UPDATE;
  v_reutiliza_programacion := FOUND;

  -- Compatibilidad C9.0: Planeación pudo preparar la partida completa (fila
  -- heredada sin operación). Si la partida tiene una sola operación, el reclamo
  -- adopta esa fila en lugar de crear otra que competiría por el mismo recurso.
  IF NOT v_reutiliza_programacion AND v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT count(*) INTO v_total_metas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = v_reclamo.partida_id;

    IF v_total_metas = 1 THEN
      SELECT * INTO v_programacion
      FROM public.programacion_areas AS programacion
      WHERE programacion.partida_id = v_reclamo.partida_id
        AND programacion.meta_proceso_id IS NULL
        AND programacion.estado_planeacion IN ('programada', 'en_preparacion')
      ORDER BY programacion.creado_en DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.programacion_areas AS programacion
        SET meta_proceso_id = v_reclamo.meta_proceso_id,
            actualizado_en = now()
        WHERE programacion.id = v_programacion.id;
        v_reutiliza_programacion := true;
      END IF;
    END IF;
  END IF;

  IF v_reutiliza_programacion THEN
    IF v_programacion.estado_planeacion = 'completada' THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_proceso' THEN
      RAISE EXCEPTION 'programacion_ya_en_proceso' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'bloqueada' THEN
      RAISE EXCEPTION 'proceso_pausado_reanudar' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_preparacion' THEN
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET programacion_id = v_programacion.id,
          actualizado_en = now()
      WHERE reclamo.id = p_reclamo_id;
      RETURN v_programacion.id;
    END IF;
    -- `programada` o `cancelada`: se revalida recurso y capacidad para el día
    -- del reclamo antes de reactivarla.
    v_programacion_id := v_programacion.id;
    v_recurso_preferido := v_programacion.recurso_id;
  END IF;

  v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);

  -- C18/A3: el respaldo exige el grupo de equipo que pide la operación y, si el
  -- ruteo no lo capturó, el grupo del equipo ya programado. Nunca se cambia a
  -- una máquina de otra familia.
  v_grupo_id := privado.grupo_equipo_requerido_operacion(v_reclamo.meta_proceso_id);

  IF v_grupo_id IS NULL AND v_recurso_preferido IS NOT NULL THEN
    SELECT recurso.grupo_equipo_id INTO v_grupo_id
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.id = v_recurso_preferido;
  END IF;

  IF v_grupo_id IS NOT NULL THEN
    SELECT grupo.nombre INTO v_grupo_nombre
    FROM public.grupos_equipo AS grupo
    WHERE grupo.id = v_grupo_id;
  END IF;

  -- El día cerrado se explica antes de hablar de equipos.
  IF privado.jornada_laboral_dia(v_reclamo.fecha) <= 0 THEN
    RAISE EXCEPTION 'jornada_cerrada: el % no tiene jornada laboral; elige de lunes a sábado', v_reclamo.fecha
      USING ERRCODE = 'check_violation';
  END IF;

  -- Locks deterministas: todos los candidatos del grupo, por código, antes de
  -- evaluar. Así dos arranques simultáneos no se bloquean en orden inverso.
  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.activo = true
    AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
    AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
  ORDER BY recurso.codigo
  FOR UPDATE;

  v_recurso_id := NULL;

  FOR v_recurso IN
    SELECT recurso.id,
           recurso.codigo,
           privado.obtener_capacidad_efectiva_recurso_turno(
             recurso.id, v_reclamo.fecha, v_reclamo.turno
           ) AS capacidad,
           coalesce((
             SELECT sum(programacion.horas_estimadas)
             FROM public.programacion_areas AS programacion
             WHERE programacion.recurso_id = recurso.id
               AND programacion.fecha_programada = v_reclamo.fecha
               AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
               AND programacion.id IS DISTINCT FROM v_programacion_id
           ), 0) AS horas_programadas,
           EXISTS (
             SELECT 1
             FROM public.programacion_areas AS ocupada
             WHERE ocupada.recurso_id = recurso.id
               AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
               AND ocupada.id IS DISTINCT FROM v_programacion_id
           ) AS ocupado
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.activo = true
      AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
      AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
    ORDER BY ((recurso.id = v_recurso_preferido) IS TRUE) DESC, recurso.codigo
  LOOP
    v_total_equipos := v_total_equipos + 1;

    IF v_recurso.capacidad <= 0 THEN
      v_sin_capacidad := concat_ws(', ', nullif(v_sin_capacidad, ''), v_recurso.codigo);
      CONTINUE;
    END IF;
    v_equipos_con_capacidad := v_equipos_con_capacidad + 1;

    IF v_recurso.ocupado THEN
      v_detalle_ocupados := concat_ws(
        '; ',
        nullif(v_detalle_ocupados, ''),
        privado.detalle_ocupacion_recurso(
          v_recurso.id, v_reclamo.fecha, p_operador_id, v_programacion_id
        )
      );
      CONTINUE;
    END IF;

    v_libre := v_recurso.capacidad - v_recurso.horas_programadas;

    IF v_libre >= v_reclamo.horas_estimadas THEN
      v_recurso_id := v_recurso.id;
      EXIT;
    END IF;

    IF v_mejor_libre IS NULL OR v_libre > v_mejor_libre THEN
      v_mejor_libre := v_libre;
      v_mejor_recurso := v_recurso.codigo;
      v_mejor_capacidad := v_recurso.capacidad;
      v_mejor_cargado := v_recurso.horas_programadas;
    END IF;
  END LOOP;

  IF v_recurso_id IS NULL THEN
    IF v_total_equipos = 0 THEN
      v_mensaje := format(
        'no hay equipos activos del grupo %s %s; configura un equipo activo o corrige el grupo del proceso',
        coalesce(v_grupo_nombre, 'requerido'),
        CASE WHEN v_area_macro IS NOT NULL
          THEN 'en el área ' || v_area_macro
          ELSE 'en la planta'
        END
      );
      RAISE EXCEPTION 'recurso_sin_equipos: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    IF v_equipos_con_capacidad = 0 THEN
      v_mensaje := format(
        'el %s no hay disponibilidad: %s sin capacidad configurada (jornada cerrada o excepción de capacidad); elige otro día',
        v_reclamo.fecha,
        coalesce(v_sin_capacidad, 'los equipos del grupo')
      );
      RAISE EXCEPTION 'recurso_sin_capacidad: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    IF v_detalle_ocupados IS NOT NULL THEN
      v_mensaje := v_detalle_ocupados || '.';
      IF v_mejor_recurso IS NOT NULL THEN
        v_mensaje := v_mensaje || format(
          ' El equipo libre con más hueco es %s: %s h libres de %s h (%s h ya programadas) el %s.',
          v_mejor_recurso,
          round(greatest(v_mejor_libre, 0), 2),
          round(v_mejor_capacidad, 2),
          round(v_mejor_cargado, 2),
          v_reclamo.fecha
        );
      END IF;
      v_mensaje := v_mensaje
        || ' No puedes cancelar el trabajo en curso de otro operador desde aquí:'
        || ' pide que lo cierren o lo pausen, o reprograma esta operación.';
      RAISE EXCEPTION 'recurso_ocupado: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    v_mensaje := format(
      'el proceso requiere %s h y %s solo tiene %s h libres el %s (capacidad %s h, ya programadas %s h); elige otro día o libera capacidad',
      v_reclamo.horas_estimadas,
      coalesce(v_mejor_recurso, 'el equipo'),
      round(greatest(coalesce(v_mejor_libre, 0), 0), 2),
      v_reclamo.fecha,
      round(coalesce(v_mejor_capacidad, 0), 2),
      round(coalesce(v_mejor_cargado, 0), 2)
    );
    RAISE EXCEPTION 'recurso_capacidad_excedida: %', v_mensaje USING ERRCODE = 'check_violation';
  END IF;

  IF v_programacion_id IS NULL THEN
    INSERT INTO public.programacion_areas (
      orden_id, partida_id, recurso_id, secuencia, fecha_programada, turno,
      horas_estimadas, orden_prioridad, estado_planeacion, meta_proceso_id
    ) VALUES (
      v_reclamo.orden_id, v_reclamo.partida_id, v_recurso_id,
      v_secuencia, v_reclamo.fecha, v_reclamo.turno,
      v_reclamo.horas_estimadas, v_prioridad, 'en_preparacion',
      v_reclamo.meta_proceso_id
    )
    RETURNING id INTO v_programacion_id;
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET recurso_id = v_recurso_id,
        fecha_programada = v_reclamo.fecha,
        turno = v_reclamo.turno,
        horas_estimadas = v_reclamo.horas_estimadas,
        orden_prioridad = v_prioridad,
        estado_planeacion = 'en_preparacion',
        actualizado_en = now()
    WHERE programacion.id = v_programacion_id;
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET programacion_id = v_programacion_id,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN v_programacion_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'recurso_ocupado: otro proceso tomó el equipo en el mismo instante; actualiza y vuelve a intentar' USING ERRCODE = 'unique_violation';
END;
COMMENT ON FUNCTION public.preparar_reclamo_operador(uuid, uuid) IS
  'C10/C18/C24/C25/obs6: prepara la reserva del reclamo; admite orden en borrador para no depender de la liberación administrativa.';
