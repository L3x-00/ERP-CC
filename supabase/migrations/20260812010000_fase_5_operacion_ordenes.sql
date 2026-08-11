-- =============================================================================
-- Migración: operación transaccional de Órdenes — Sub-fase 5.2 (ORCA MFG ERP).
--
-- Las mutaciones de una orden no se encadenan desde TypeScript: estas funciones
-- concentran bloqueo, folio, cabecera y partidas en una transacción Postgres.
-- Todas son internas para Server Actions con service_role.
-- =============================================================================

-- Motivo persistente y obligatorio para toda cancelación controlada.
ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

COMMENT ON COLUMN public.ordenes_produccion.motivo_cancelacion IS
  'Motivo obligatorio al cancelar una orden de producción.';

-- Una cotización de Pipeline puede originar solo una orden. El índice parcial
-- no limita órdenes manuales, que tienen cotizacion_id nulo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_produccion_cotizacion_unica
  ON public.ordenes_produccion (cotizacion_id)
  WHERE cotizacion_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 1. Crea una orden manual completa. JSONB permite insertar cabecera y partidas
-- en la misma transacción; ante cualquier constraint inválido no se guarda nada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_produccion(
  p_cliente_id uuid,
  p_cotizacion_id uuid,
  p_fecha_compromiso timestamptz,
  p_prioridad text,
  p_partidas jsonb
)
RETURNS TABLE (id uuid, folio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_folio text;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_prioridad IS NULL OR p_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_partidas IS NULL
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0 THEN
    RAISE EXCEPTION 'partidas_requeridas' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_partidas) AS elemento(partida)
    WHERE jsonb_typeof(elemento.partida) <> 'object'
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS partida(
      codigo_pieza text,
      cantidad_solicitada numeric,
      unidad_medida text,
      tiempo_estimado_minutos numeric
    )
    WHERE nullif(btrim(partida.codigo_pieza), '') IS NULL
       OR partida.cantidad_solicitada IS NULL
       OR partida.cantidad_solicitada <= 0
       OR nullif(btrim(partida.unidad_medida), '') IS NULL
       OR coalesce(partida.tiempo_estimado_minutos, 0) < 0
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.ordenes_produccion (
    folio,
    cliente_id,
    cotizacion_id,
    estado,
    prioridad,
    fecha_compromiso
  )
  VALUES (
    public.generar_folio_orden('OP'),
    p_cliente_id,
    p_cotizacion_id,
    'borrador',
    p_prioridad,
    p_fecha_compromiso
  )
  RETURNING ordenes_produccion.id, ordenes_produccion.folio INTO v_orden_id, v_folio;

  INSERT INTO public.partidas_orden_produccion (
    orden_id,
    codigo_pieza,
    descripcion,
    cantidad_solicitada,
    unidad_medida,
    material_id,
    tiempo_estimado_minutos,
    maquina_asignada
  )
  SELECT
    v_orden_id,
    partida.codigo_pieza,
    partida.descripcion,
    partida.cantidad_solicitada,
    partida.unidad_medida,
    partida.material_id,
    coalesce(partida.tiempo_estimado_minutos, 0),
    partida.maquina_asignada
  FROM jsonb_to_recordset(p_partidas) AS partida(
    codigo_pieza text,
    descripcion text,
    cantidad_solicitada numeric,
    unidad_medida text,
    material_id uuid,
    tiempo_estimado_minutos numeric,
    maquina_asignada text
  );

  RETURN QUERY SELECT v_orden_id, v_folio;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb) IS
  'Crea cabecera y partidas de una orden en una única transacción. Solo service_role.';

-- Wrapper tipado para órdenes manuales: no expone cotizacion_id al contrato de
-- aplicación y deja explícito que una orden manual no pertenece a Pipeline.
CREATE OR REPLACE FUNCTION public.crear_orden_manual(
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz,
  p_prioridad text,
  p_partidas jsonb
)
RETURNS TABLE (id uuid, folio text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT creada.id, creada.folio
  FROM public.crear_orden_produccion(
    p_cliente_id,
    NULL,
    p_fecha_compromiso,
    p_prioridad,
    p_partidas
  ) AS creada;
$$;

COMMENT ON FUNCTION public.crear_orden_manual(uuid, timestamptz, text, jsonb) IS
  'Crea una orden manual sin cotización asociada. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. Convierte Pipeline negociación → ganada y crea la orden de forma atómica.
-- El FOR UPDATE serializa dobles clics o solicitudes concurrentes; el índice
-- único de cotización es la segunda línea de defensa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_oportunidad_y_crear_orden(
  p_pipeline_id uuid,
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_etapa text;
  v_prioridad text;
  v_orden_id uuid;
  v_folio text;
  v_partidas jsonb;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad
  INTO v_etapa, v_prioridad
  FROM public.pipeline
  WHERE pipeline.id = p_pipeline_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'oportunidad_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ordenes_produccion.id, ordenes_produccion.folio
  INTO v_orden_id, v_folio
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.cotizacion_id = p_pipeline_id;

  IF FOUND THEN
    RETURN QUERY SELECT v_orden_id, v_folio, true;
    RETURN;
  END IF;

  IF v_etapa <> 'negociacion' THEN
    RAISE EXCEPTION 'etapa_pipeline_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'codigo_pieza', 'COT-' || lpad((linea.orden + 1)::text, 3, '0'),
      'descripcion', CASE
        WHEN nullif(btrim(linea.material), '') IS NULL THEN linea.descripcion
        ELSE linea.descripcion || ' — Material cotizado: ' || linea.material
      END,
      'cantidad_solicitada', linea.cantidad,
      'unidad_medida', 'unidad',
      'material_id', NULL,
      'tiempo_estimado_minutos', 0,
      'maquina_asignada', NULL
    )
    ORDER BY linea.orden, linea.id
  )
  INTO v_partidas
  FROM public.cotizacion_lineas AS linea
  WHERE linea.pipeline_id = p_pipeline_id;

  IF v_partidas IS NULL OR jsonb_array_length(v_partidas) = 0 THEN
    RAISE EXCEPTION 'cotizacion_sin_lineas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    p_cliente_id,
    p_pipeline_id,
    p_fecha_compromiso,
    coalesce(v_prioridad, 'normal'),
    v_partidas
  ) AS creada;

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera una orden desde sus líneas y marca ganada en una transacción. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. Cambia estado con compare-and-set y bloqueo. El estado esperado evita que
-- una pantalla obsoleta sobrescriba la transición de otro usuario.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_orden(
  p_orden_id uuid,
  p_estado_actual text,
  p_estado_nuevo text,
  p_motivo_cancelacion text DEFAULT NULL
)
RETURNS TABLE (id uuid, estado text, fecha_inicio timestamptz, fecha_fin timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo_cancelacion, '')), '');
BEGIN
  SELECT ordenes_produccion.estado
  INTO v_estado
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_estado <> p_estado_actual THEN
    RAISE EXCEPTION 'estado_conflicto' USING ERRCODE = 'serialization_failure';
  END IF;

  IF NOT (
    (v_estado = 'borrador' AND p_estado_nuevo IN ('programada', 'cancelada'))
    OR (v_estado = 'programada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
    OR (v_estado = 'en_proceso' AND p_estado_nuevo IN ('pausada', 'completada', 'cancelada'))
    OR (v_estado = 'pausada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
  ) THEN
    RAISE EXCEPTION 'transicion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_estado_nuevo = 'cancelada' AND (v_motivo IS NULL OR char_length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'motivo_cancelacion_requerido' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.ordenes_produccion
  SET
    estado = p_estado_nuevo,
    fecha_inicio = CASE
      WHEN p_estado_nuevo = 'en_proceso' THEN coalesce(ordenes_produccion.fecha_inicio, clock_timestamp())
      ELSE ordenes_produccion.fecha_inicio
    END,
    fecha_fin = CASE
      WHEN p_estado_nuevo = 'completada' THEN coalesce(ordenes_produccion.fecha_fin, clock_timestamp())
      ELSE ordenes_produccion.fecha_fin
    END,
    motivo_cancelacion = CASE
      WHEN p_estado_nuevo = 'cancelada' THEN v_motivo
      ELSE ordenes_produccion.motivo_cancelacion
    END
  WHERE ordenes_produccion.id = p_orden_id
  RETURNING
    ordenes_produccion.id,
    ordenes_produccion.estado,
    ordenes_produccion.fecha_inicio,
    ordenes_produccion.fecha_fin;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) IS
  'Cambia estado con bloqueo y estado esperado; cancela con motivo obligatorio. Solo service_role.';

-- Conserva la protección de Fase 2. La llamada transaccional anterior se
-- ejecuta bajo el propietario (`postgres`) de la función SECURITY DEFINER; no
-- se usa una GUC configurable por sesión como mecanismo de autorización.
CREATE OR REPLACE FUNCTION public.pipeline_proteger_columnas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role')
     OR coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.etapa IS DISTINCT FROM OLD.etapa
     OR NEW.folio_op IS DISTINCT FROM OLD.folio_op
     OR NEW.folio_cnc IS DISTINCT FROM OLD.folio_cnc
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'etapa/folio/cliente_id solo se modifican vía las acciones del servidor';
  END IF;

  RETURN NEW;
END;
$$;

-- Las funciones SECURITY DEFINER no son endpoints públicos: solo Server Actions
-- con cliente admin pueden invocarlas tras autenticar y verificar permisos.
REVOKE EXECUTE ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crear_orden_manual(uuid, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_orden_manual(uuid, timestamptz, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text)
  TO service_role;
