-- =============================================================================
-- Fase 7.2: motor transaccional de sesiones, recursos y notas de entrega.
--
-- Orden de locks de las operaciones de taller: partida → orden → operador →
-- programación → recurso. La sesión se toma desde una programación previamente
-- puesta en preparación por Planeación; las cantidades y folios se resuelven
-- dentro de PostgreSQL.
-- =============================================================================

ALTER TABLE public.registros_avance_partida
  ADD COLUMN IF NOT EXISTS sesion_trabajo_id uuid
    REFERENCES public.sesiones_trabajo (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_avance_partida_sesion_unica
  ON public.registros_avance_partida (sesion_trabajo_id)
  WHERE sesion_trabajo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION privado.calcular_horas_sesion_trabajo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS TABLE (horas_brutas numeric, horas_netas numeric)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_inicio_local timestamp;
  v_fin_local timestamp;
  v_descuento_comida numeric;
  v_horas_brutas numeric;
BEGIN
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'rango_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_inicio_local := p_fecha_inicio AT TIME ZONE 'America/Tijuana';
  v_fin_local := p_fecha_fin AT TIME ZONE 'America/Tijuana';
  v_horas_brutas := extract(epoch FROM (v_fin_local - v_inicio_local)) / 3600::numeric;

  -- El descuento se limita al traslape efectivo con cada intervalo local
  -- [12:00, 13:00). Así una sesión 12:30–12:45 descuenta 0.25 horas, no 1.
  WITH dias AS (
    SELECT generate_series(
      v_inicio_local::date,
      v_fin_local::date,
      interval '1 day'
    )::date AS fecha
  )
  SELECT coalesce(sum(
    extract(epoch FROM (
      least(v_fin_local, dias.fecha + time '13:00')
      - greatest(v_inicio_local, dias.fecha + time '12:00')
    )) / 3600::numeric
  ), 0::numeric)
  INTO v_descuento_comida
  FROM dias
  WHERE least(v_fin_local, dias.fecha + time '13:00')
    > greatest(v_inicio_local, dias.fecha + time '12:00');

  RETURN QUERY SELECT
    round(v_horas_brutas, 2),
    round(greatest(v_horas_brutas - v_descuento_comida, 0::numeric), 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION privado.calcular_horas_sesion_trabajo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iniciar_sesion_trabajo_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_programacion_id uuid,
  p_operador_id uuid
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
  v_estado_orden text;
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_activo boolean;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_programacion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'inicio_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id
  INTO v_orden_id, v_operador_asignado_id
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

  SELECT *
  INTO v_programacion
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

  PERFORM 1
  FROM public.programacion_areas AS previa
  WHERE previa.partida_id = p_partida_id
    AND previa.secuencia < v_programacion.secuencia
    AND previa.estado_planeacion NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'secuencia_previa_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT recurso.activo
  INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND OR v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo
    WHERE operador_id = p_operador_id AND estado_sesion = 'activa'
  ) THEN
    RAISE EXCEPTION 'operador_con_sesion_activa' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.programacion_areas
  SET estado_planeacion = 'en_proceso'
  WHERE id = p_programacion_id;

  UPDATE public.ordenes_produccion
  SET estado = 'en_proceso', fecha_inicio = coalesce(fecha_inicio, now())
  WHERE id = p_orden_id;

  RETURN QUERY
  WITH nueva_sesion AS (
    INSERT INTO public.sesiones_trabajo (
      orden_id, partida_id, programacion_id, operador_id
    ) VALUES (
      p_orden_id, p_partida_id, p_programacion_id, p_operador_id
    )
    RETURNING *
  ), marca AS (
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (p_partida_id, p_operador_id, 'inicio', 'Sesión de producción iniciada')
  )
  SELECT
    nueva_sesion.id,
    nueva_sesion.orden_id,
    nueva_sesion.partida_id,
    nueva_sesion.programacion_id,
    nueva_sesion.operador_id,
    nueva_sesion.fecha_inicio,
    nueva_sesion.estado_sesion,
    nueva_sesion.creado_en,
    nueva_sesion.actualizado_en
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
  p_notas text DEFAULT NULL
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
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
  v_programacion public.programacion_areas%ROWTYPE;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_cantidad_producida_nueva numeric;
  v_partida_completa boolean;
  v_es_ultima_secuencia boolean;
  v_orden_completa boolean;
  v_estado_programacion text;
  v_estado_orden text;
BEGIN
  IF p_sesion_id IS NULL
     OR p_operador_id IS NULL
     OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0
     OR p_estado_destino NOT IN ('pausada', 'finalizada') THEN
    RAISE EXCEPTION 'cierre_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_estado_destino = 'pausada'
     AND coalesce(nullif(btrim(p_motivo_pausa), ''), '') NOT IN (
       'falta_informacion', 'material_pendiente', 'aprobacion_cliente',
       'problema_tecnico', 'mantenimiento', 'otro'
     ) THEN
    RAISE EXCEPTION 'motivo_pausa_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.operador_id <> p_operador_id OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    partida.orden_id,
    partida.operador_asignado_id,
    partida.cantidad_producida,
    partida.cantidad_solicitada
  INTO
    v_orden_id,
    v_operador_asignado_id,
    v_cantidad_producida_actual,
    v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_sesion.partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_orden_id <> v_sesion.orden_id THEN
    RAISE EXCEPTION 'sesion_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cantidad_producida_actual + p_piezas_producidas > v_cantidad_solicitada THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
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

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id
    AND programacion.partida_id = v_sesion.partida_id
    AND programacion.orden_id = v_sesion.orden_id
    AND programacion.estado_planeacion = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT calculo.horas_brutas, calculo.horas_netas
  INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.programacion_areas AS posterior
    WHERE posterior.partida_id = v_sesion.partida_id
      AND posterior.secuencia > v_programacion.secuencia
      AND posterior.estado_planeacion <> 'cancelada'
  ) INTO v_es_ultima_secuencia;

  IF p_piezas_producidas > 0 AND v_es_ultima_secuencia = false THEN
    RAISE EXCEPTION 'produccion_solo_ultima_secuencia' USING ERRCODE = 'check_violation';
  END IF;

  v_cantidad_producida_nueva := v_cantidad_producida_actual + p_piezas_producidas;
  v_partida_completa := v_cantidad_producida_nueva >= v_cantidad_solicitada;

  UPDATE public.sesiones_trabajo
  SET
    fecha_fin = now(),
    horas_brutas = v_horas_brutas,
    horas_netas = v_horas_netas,
    piezas_producidas = p_piezas_producidas,
    motivo_pausa = CASE
      WHEN p_estado_destino = 'pausada' THEN nullif(btrim(p_motivo_pausa), '')
      ELSE NULL
    END,
    notas = nullif(btrim(p_notas), ''),
    estado_sesion = p_estado_destino
  WHERE id = p_sesion_id;

  IF p_piezas_producidas > 0 THEN
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap, sesion_trabajo_id
    ) VALUES (
      v_sesion.partida_id, p_operador_id, p_piezas_producidas, 0, p_sesion_id
    );
  END IF;

  UPDATE public.partidas_orden_produccion
  SET
    cantidad_producida = v_cantidad_producida_nueva,
    tiempo_real_minutos = tiempo_real_minutos + (v_horas_netas * 60)
  WHERE id = v_sesion.partida_id;

  IF p_estado_destino = 'pausada' THEN
    v_estado_programacion := 'bloqueada';
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;

  UPDATE public.programacion_areas
  SET estado_planeacion = v_estado_programacion
  WHERE id = v_sesion.programacion_id;

  IF p_estado_destino = 'pausada' THEN
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (v_sesion.partida_id, p_operador_id, 'pausa', nullif(btrim(p_notas), ''));
  ELSE
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (v_sesion.partida_id, p_operador_id, 'fin', nullif(btrim(p_notas), ''));
  END IF;

  SELECT bool_and(partida.cantidad_producida >= partida.cantidad_solicitada)
  INTO v_orden_completa
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_sesion.orden_id;

  IF coalesce(v_orden_completa, false) THEN
    UPDATE public.ordenes_produccion
    SET estado = 'completada', fecha_fin = now()
    WHERE id = v_sesion.orden_id;
  END IF;

  SELECT orden.estado INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id;

  RETURN QUERY
  SELECT
    sesion.id,
    sesion.estado_sesion,
    sesion.horas_brutas,
    sesion.horas_netas,
    sesion.piezas_producidas,
    v_cantidad_producida_nueva,
    v_estado_orden,
    v_estado_programacion,
    sesion.actualizado_en
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_nota_entrega(
  p_orden_id uuid,
  p_recibido_por text,
  p_firma_cliente_url text,
  p_creado_por uuid,
  p_partidas jsonb
)
RETURNS TABLE (
  id uuid,
  folio text,
  es_parcial boolean,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nota_id uuid;
  v_folio text;
  v_es_parcial boolean;
  v_cantidad_partidas integer;
BEGIN
  IF p_orden_id IS NULL
     OR p_creado_por IS NULL
     OR char_length(btrim(coalesce(p_recibido_por, ''))) < 3
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0
     OR jsonb_array_length(p_partidas) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_cantidad_partidas
  FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_partidas <> jsonb_array_length(p_partidas) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    WHERE entrada.partida_id IS NULL OR entrada.cantidad_entregada IS NULL OR entrada.cantidad_entregada <= 0
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT entrada.partida_id
      FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      GROUP BY entrada.partida_id
      HAVING count(*) > 1
    ) AS duplicada
  ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
    AND orden.estado IN ('en_proceso', 'completada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS creador
  WHERE creador.id = p_creado_por
    AND creador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- Los UUID se bloquean en orden para que dos entregas parciales concurrentes
  -- no puedan aceptar las mismas piezas ni formar un ciclo de espera.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_partidas THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_producida, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_producida
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = 'check_violation';
  END IF;

  v_folio := public.generar_folio_nota_entrega('NE');

  -- La parcialidad se deriva después de aplicar esta entrega, nunca se acepta
  -- desde el navegador como una etiqueta capaz de desinformar el documento.
  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, firma_cliente_url, recibido_por, creado_por
  ) VALUES (
    v_folio,
    p_orden_id,
    v_es_parcial,
    nullif(btrim(p_firma_cliente_url), ''),
    btrim(p_recibido_por),
    p_creado_por
  ) RETURNING notas_entrega.id INTO v_nota_id;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada
  )
  SELECT
    v_nota_id,
    partida.id,
    partida.cantidad_solicitada,
    entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;

  RETURN QUERY
  SELECT nota.id, nota.folio, nota.es_parcial, nota.creado_en
  FROM public.notas_entrega AS nota
  WHERE nota.id = v_nota_id;
END;
$$;

COMMENT ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid) IS
  'Toma un recurso preparado y abre una sesión de producción; solo service_role.';
COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text) IS
  'Cierra o pausa una sesión, calcula horas locales, registra avance y libera recurso; solo service_role.';
COMMENT ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) IS
  'Genera una entrega parcial o total con folio atómico y cantidades bloqueadas; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) TO service_role;
