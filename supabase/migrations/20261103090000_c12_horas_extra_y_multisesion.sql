-- =============================================================================
-- C12 - Horas extra por solicitud y procesos simultáneos por operador.
--
-- Observaciones del cliente:
-- 1. El operador no llena solicitudes: al cerrar una sesión que excede la
--    jornada, el sistema deja la solicitud pendiente para que Admin/Management
--    solo la apruebe o la rechace (sin capturar horas ni motivo a mano).
-- 2. Un operador puede trabajar varias operaciones a la vez cuando la anterior
--    ya dejó piezas disponibles (p. ej. doblar 10 de 24 ya cortadas). Se retira
--    la exclusividad de una sola sesión activa por operador; la exclusividad del
--    recurso de planeación y la disponibilidad de piezas se conservan.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- 1. Varias sesiones activas por operador --------------------------------
DROP INDEX IF EXISTS public.idx_sesiones_trabajo_operador_activa_unica;

-- 2. Estados de solicitud de horas extra ---------------------------------
ALTER TABLE public.autorizaciones_hora_extra
  DROP CONSTRAINT IF EXISTS autorizaciones_hora_extra_estado_valido;

ALTER TABLE public.autorizaciones_hora_extra
  ADD CONSTRAINT autorizaciones_hora_extra_estado_valido CHECK (
    estado IN ('SOLICITADA','VIGENTE','USADA','RECHAZADA','REVOCADA'));

COMMENT ON COLUMN public.autorizaciones_hora_extra.estado IS
  'SOLICITADA (pendiente de decisión) -> VIGENTE (aprobada y consumible) -> USADA; RECHAZADA/REVOCADA no se consumen.';

-- 3. Inicio de sesión sin exclusividad por operador -----------------------

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
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
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

  -- Secuencia con disponibilidad parcial: la operación puede arrancar aunque la
  -- anterior siga en curso, pero solo cuando ya hay piezas terminadas de la
  -- operación previa que esta todavía no haya consumido. Una sesión pausada se
  -- reanuda sin esta validación: pudo haber consumido todo el lote disponible.
  IF v_programacion.meta_proceso_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.sesiones_trabajo AS pausada
       WHERE pausada.programacion_id = p_programacion_id
         AND pausada.estado_sesion = 'pausada'
     ) THEN
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

-- 4. Solicitud automática de horas extra ---------------------------------
-- La crea el sistema cuando el cierre del operador excede la jornada del turno.
-- El operador no captura horas ni motivo: solo recibe el aviso de que su
-- solicitud quedó pendiente de aprobación.
CREATE OR REPLACE FUNCTION public.solicitar_horas_extra_operador(
  p_sesion_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  sesion_id uuid,
  horas_autorizadas numeric,
  motivo text,
  estado text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_horas_netas numeric;
  v_jornada numeric;
  v_exceso numeric;
  v_existente public.autorizaciones_hora_extra%ROWTYPE;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'solicitud_horas_extra_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.operador_id <> p_operador_id OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  v_jornada := privado.obtener_jornada_recurso_turno(
    v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);
  SELECT calculo.horas_netas INTO v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;
  v_exceso := round(greatest(coalesce(v_horas_netas, 0) - v_jornada, 0), 2);

  IF v_exceso <= 0 THEN
    RAISE EXCEPTION 'horas_extra_no_requeridas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existente
  FROM public.autorizaciones_hora_extra AS autorizacion
  WHERE autorizacion.sesion_id = p_sesion_id
    AND autorizacion.estado = 'SOLICITADA'
  ORDER BY autorizacion.creado_en DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY
    SELECT v_existente.id, v_existente.orden_id, v_existente.sesion_id,
      v_existente.horas_autorizadas, v_existente.motivo, v_existente.estado,
      v_existente.creado_en;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.autorizaciones_hora_extra (
    orden_id, sesion_id, horas_autorizadas, motivo, autorizado_por, estado
  ) VALUES (
    v_sesion.orden_id,
    p_sesion_id,
    greatest(v_exceso, 0.25),
    'Solicitud automática: la sesión excede la jornada del turno.',
    p_operador_id,
    'SOLICITADA'
  )
  RETURNING
    autorizaciones_hora_extra.id,
    autorizaciones_hora_extra.orden_id,
    autorizaciones_hora_extra.sesion_id,
    autorizaciones_hora_extra.horas_autorizadas,
    autorizaciones_hora_extra.motivo,
    autorizaciones_hora_extra.estado,
    autorizaciones_hora_extra.creado_en;
END;
$$;

COMMENT ON FUNCTION public.solicitar_horas_extra_operador(uuid, uuid) IS
  'C12: crea (o reutiliza) la solicitud pendiente de horas extra al excederse la jornada. Solo service_role.';

REVOKE ALL ON FUNCTION public.solicitar_horas_extra_operador(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_horas_extra_operador(uuid, uuid) TO service_role;

-- 5. Aprobar o rechazar la solicitud --------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_solicitud_horas_extra(
  p_id uuid,
  p_aprobar boolean,
  p_autorizador_id uuid
)
RETURNS TABLE (
  id uuid,
  estado text,
  horas_autorizadas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_solicitud public.autorizaciones_hora_extra%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_autorizador_id IS NULL THEN
    RAISE EXCEPTION 'solicitud_horas_extra_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_solicitud
  FROM public.autorizaciones_hora_extra AS autorizacion
  WHERE autorizacion.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_solicitud.estado <> 'SOLICITADA' THEN
    RAISE EXCEPTION 'solicitud_no_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.autorizaciones_hora_extra AS autorizacion
  SET estado = CASE WHEN p_aprobar THEN 'VIGENTE' ELSE 'RECHAZADA' END,
      autorizado_por = CASE WHEN p_aprobar THEN p_autorizador_id ELSE autorizacion.autorizado_por END
  WHERE autorizacion.id = p_id;

  RETURN QUERY
  SELECT autorizacion.id, autorizacion.estado, autorizacion.horas_autorizadas
  FROM public.autorizaciones_hora_extra AS autorizacion
  WHERE autorizacion.id = p_id;
END;
$$;

COMMENT ON FUNCTION public.resolver_solicitud_horas_extra(uuid, boolean, uuid) IS
  'C12: Admin/Management aprueba (VIGENTE) o rechaza (RECHAZADA) una solicitud de horas extra. Solo service_role.';

REVOKE ALL ON FUNCTION public.resolver_solicitud_horas_extra(uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_horas_extra(uuid, boolean, uuid) TO service_role;
