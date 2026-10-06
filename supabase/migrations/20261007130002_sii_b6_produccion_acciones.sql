-- =============================================================================
-- SII-B6.2 — Producción básica ola 1: acciones de piso (corridas, pausas,
-- horas extra, jornada y calidad)
-- Plan: docs/plan-erp-sii/06-produccion.md §6.1–§6.3
--
-- Entrega (todas SECURITY DEFINER, search_path='', solo service_role):
--   * crear/iniciar/completar/cancelar corrida
--   * iniciar_sesion_trabajo_operador recreada (corrida + checklist) y
--     cerrar_sesion_trabajo_operador recreada (pausa por catálogo, primera
--     pieza, horas extra por jornada configurada, estado de corrida)
--   * reclamar_recurso_liberado, cerrar_jornada, autorizar_horas_extra
--   * registrar_inspeccion (primera pieza, referencias de lote, cierre)
--
-- No asume B5: cualquier hook a `estado_sii` va en DO $$ con IF EXISTS.
-- Idempotente y aditiva; remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas de dependencia
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.corridas') IS NULL
     OR to_regclass('public.catalogo_motivos_pausa') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20261007130001_sii_b6_produccion_base.sql antes (faltan tablas B6)';
  END IF;
  IF to_regclass('public.inspecciones_calidad') IS NULL
     OR to_regclass('public.autorizaciones_hora_extra') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20261007130001_sii_b6_produccion_base.sql antes (faltan tablas B6)';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Helpers privados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.verificacion_inicio_completa(p_verificacion jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    p_verificacion IS NOT NULL
    AND jsonb_typeof(p_verificacion) = 'object'
    AND (p_verificacion -> 'material') = 'true'::jsonb
    AND (p_verificacion -> 'espesor') = 'true'::jsonb
    AND (p_verificacion -> 'cantidad') = 'true'::jsonb
    AND (p_verificacion -> 'archivo') = 'true'::jsonb
    AND (p_verificacion -> 'proceso_equipo') = 'true'::jsonb
    AND jsonb_typeof(p_verificacion -> 'observaciones') = 'string',
    false);
$$;

COMMENT ON FUNCTION privado.verificacion_inicio_completa(jsonb) IS
  'SII-B6.2: true si el checklist de eventos críticos está completo (6 claves).';

CREATE OR REPLACE FUNCTION privado.motivo_pausa_legacy(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_codigo
    WHEN 'DUDA' THEN 'falta_informacion'
    WHEN 'MATERIAL' THEN 'material_pendiente'
    WHEN 'FALLA' THEN 'problema_tecnico'
    WHEN 'COMIDA' THEN 'otro'
    WHEN 'FIN_JORNADA' THEN 'otro'
    WHEN 'OTRA' THEN 'otro'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION privado.motivo_pausa_legacy(text) IS
  'SII-B6.2: traduce el código del catálogo al valor legacy de sesiones_trabajo.motivo_pausa (grandfathering).';

CREATE OR REPLACE FUNCTION privado.corrida_siguiente_codigo(p_orden_id uuid, p_prefijo text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_siguiente integer;
BEGIN
  SELECT coalesce(max((regexp_match(corrida.codigo, '^' || p_prefijo || '([0-9]+)$'))[1]::integer), 0) + 1
  INTO v_siguiente
  FROM public.corridas AS corrida
  WHERE corrida.orden_id = p_orden_id;

  -- Dos dígitos mínimos, sin truncar a partir de 100 (LAS01…LAS99, LAS100…).
  RETURN p_prefijo || CASE WHEN v_siguiente < 10
    THEN '0' || v_siguiente::text
    ELSE v_siguiente::text
  END;
END;
$$;

COMMENT ON FUNCTION privado.corrida_siguiente_codigo(uuid, text) IS
  'SII-B6.2: siguiente código <PREFIJO><NN> de la orden (el llamador bloquea la orden).';

CREATE OR REPLACE FUNCTION privado.primera_pieza_aprobada(p_corrida_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inspecciones_calidad AS inspeccion
    WHERE inspeccion.corrida_id = p_corrida_id
      AND inspeccion.tipo = 'PRIMERA_PIEZA'
      AND inspeccion.resultado = 'APROBADA'
  );
$$;

COMMENT ON FUNCTION privado.primera_pieza_aprobada(uuid) IS
  'SII-B6.3: true si la corrida tiene una inspección PRIMERA_PIEZA APROBADA.';

CREATE OR REPLACE FUNCTION privado.iniciar_corrida_interna(p_corrida_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.corridas AS corrida
  SET estado = 'EN_PROCESO'
  WHERE corrida.id = p_corrida_id
    AND corrida.estado IN ('PLANIFICADA', 'PAUSADA');
END;
$$;

COMMENT ON FUNCTION privado.iniciar_corrida_interna(uuid) IS
  'SII-B6.2: transición interna PLANIFICADA/PAUSADA → EN_PROCESO (sin permisos; la validan los llamadores).';

REVOKE ALL ON FUNCTION privado.verificacion_inicio_completa(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.motivo_pausa_legacy(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.corrida_siguiente_codigo(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.primera_pieza_aprobada(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.iniciar_corrida_interna(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. crear_corrida (§6.1): ítems compatibles de una sola orden
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_corrida(
  p_orden_id uuid,
  p_proceso_id uuid,
  p_items jsonb,
  p_actor_id uuid,
  p_corrida_origen_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proceso public.catalogo_procesos%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_item jsonb;
  v_partida_id uuid;
  v_cantidad numeric;
  v_cantidad_acumulada numeric;
  v_ids uuid[] := '{}';
  v_grupo_equipo_id uuid;
  v_grupo_partida_id uuid;
  v_partida record;
  v_codigo text;
  v_cantidad_total numeric := 0;
  v_corrida_id uuid;
  v_codigo_item text;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;
  IF p_orden_id IS NULL OR p_proceso_id IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
  END IF;

  -- Parseo y validación de la entrada (sin locks todavía).
  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR (v_item ->> 'partida_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
    END IF;
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    IF v_partida_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'corrida_item_duplicado' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_partida_id);
    IF v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') <> 'null' THEN
      IF jsonb_typeof(v_item -> 'cantidad') <> 'number'
         OR (v_item ->> 'cantidad')::numeric <= 0
         OR (v_item ->> 'cantidad')::numeric <> round((v_item ->> 'cantidad')::numeric, 2) THEN
        RAISE EXCEPTION 'corrida_items_invalidos' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- Lock order del contrato: partida → orden. Las partidas se bloquean ordenadas.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = ANY (v_ids)
  ORDER BY partida.id
  FOR UPDATE;
  SELECT count(*) INTO v_cantidad_acumulada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = ANY (v_ids);
  IF v_cantidad_acumulada <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'corrida_partida_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'orden_no_creable_corrida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_proceso
  FROM public.catalogo_procesos AS proceso
  WHERE proceso.id = p_proceso_id;
  IF NOT FOUND OR NOT v_proceso.activo THEN
    RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
  END IF;

  -- Compatibilidad: misma orden + mismo proceso + mismo grupo de equipo (§12.1).
  FOR v_partida IN
    SELECT partida.id, partida.orden_id, partida.cantidad_solicitada,
           partida.cantidad_producida, partida.procesos, partida.maquina_asignada
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = ANY (v_ids)
    ORDER BY partida.id
  LOOP
    IF v_partida.orden_id <> p_orden_id THEN
      RAISE EXCEPTION 'corrida_items_otra_orden' USING ERRCODE = '23514';
    END IF;

    -- El proceso pedido debe estar entre los que la partida declara (si declara).
    IF v_partida.procesos IS NOT NULL AND cardinality(v_partida.procesos) > 0
       AND NOT EXISTS (
         SELECT 1 FROM unnest(v_partida.procesos) AS proceso_texto(valor)
         WHERE lower(btrim(proceso_texto.valor)) IN (lower(btrim(v_proceso.nombre)), lower(btrim(v_proceso.codigo)))
       ) THEN
      RAISE EXCEPTION 'corrida_items_incompatibles' USING ERRCODE = '23514';
    END IF;

    IF v_partida.maquina_asignada IS NOT NULL THEN
      SELECT recurso.grupo_equipo_id INTO v_grupo_partida_id
      FROM public.recursos_planeacion AS recurso
      WHERE recurso.codigo = v_partida.maquina_asignada;
      IF v_grupo_partida_id IS NOT NULL THEN
        IF v_grupo_equipo_id IS NULL THEN
          v_grupo_equipo_id := v_grupo_partida_id;
        ELSIF v_grupo_equipo_id <> v_grupo_partida_id THEN
          RAISE EXCEPTION 'corrida_items_incompatibles' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Cantidades: por defecto el pendiente físico; nunca más que el pendiente ni ≤ 0.
  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    SELECT partida.cantidad_solicitada - partida.cantidad_producida INTO v_cantidad_acumulada
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    v_cantidad := CASE
      WHEN v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') = 'number'
        THEN (v_item ->> 'cantidad')::numeric
      ELSE v_cantidad_acumulada
    END;
    IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > v_cantidad_acumulada THEN
      RAISE EXCEPTION 'corrida_cantidad_invalida' USING ERRCODE = '23514';
    END IF;
    v_cantidad_total := v_cantidad_total + v_cantidad;
  END LOOP;

  IF v_cantidad_total <= 0 THEN
    RAISE EXCEPTION 'corrida_cantidad_invalida' USING ERRCODE = '23514';
  END IF;

  v_codigo := privado.corrida_siguiente_codigo(p_orden_id, v_proceso.prefijo_corrida);

  INSERT INTO public.corridas (
    orden_id, codigo, proceso_id, cantidad_planificada, corrida_origen_id, creado_por
  ) VALUES (
    p_orden_id, v_codigo, p_proceso_id, v_cantidad_total, p_corrida_origen_id, p_actor_id
  )
  RETURNING id INTO v_corrida_id;

  FOR v_item IN SELECT entrada.value FROM jsonb_array_elements(p_items) AS entrada(value) LOOP
    v_partida_id := (v_item ->> 'partida_id')::uuid;
    SELECT partida.cantidad_solicitada - partida.cantidad_producida INTO v_cantidad_acumulada
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    v_cantidad := CASE
      WHEN v_item ? 'cantidad' AND jsonb_typeof(v_item -> 'cantidad') = 'number'
        THEN (v_item ->> 'cantidad')::numeric
      ELSE v_cantidad_acumulada
    END;

    SELECT partida.codigo_pieza INTO v_codigo_item
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partidas_orden_produccion'
        AND column_name = 'codigo_item'
    ) THEN
      EXECUTE 'SELECT coalesce(codigo_item, codigo_pieza) FROM public.partidas_orden_produccion WHERE id = $1'
      INTO v_codigo_item USING v_partida_id;
    END IF;

    INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
    VALUES (v_corrida_id, v_partida_id, v_codigo_item, v_cantidad);
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_corrida_id,
    'orden_id', p_orden_id,
    'codigo', v_codigo,
    'proceso_id', p_proceso_id,
    'estado', 'PLANIFICADA',
    'cantidad_planificada', v_cantidad_total,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'partida_id', item.partida_id, 'codigo_item', item.codigo_item, 'cantidad', item.cantidad
      ) ORDER BY item.codigo_item)
      FROM public.corrida_items AS item WHERE item.corrida_id = v_corrida_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) IS
  'SII-B6.1: crea una corrida con ítems compatibles (misma orden+proceso+grupo) y código <PREFIJO><NN>. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_corrida(uuid, uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. iniciar/completar/cancelar corrida
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_corrida(
  p_corrida_id uuid,
  p_verificacion jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_corrida public.corridas%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'produccion_operar')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;
  IF NOT privado.verificacion_inicio_completa(p_verificacion) THEN
    RAISE EXCEPTION 'verificacion_inicio_incompleta' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_corrida
  FROM public.corridas AS corrida
  WHERE corrida.id = p_corrida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_corrida.estado NOT IN ('PLANIFICADA', 'PAUSADA') THEN
    RAISE EXCEPTION 'corrida_no_iniciable' USING ERRCODE = '23514';
  END IF;

  PERFORM privado.iniciar_corrida_interna(p_corrida_id);
  RETURN jsonb_build_object('id', p_corrida_id, 'estado', 'EN_PROCESO');
END;
$$;

COMMENT ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) IS
  'SII-B6.2: inicia una corrida con checklist completo de eventos críticos. Solo service_role.';

REVOKE ALL ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_corrida(uuid, jsonb, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.completar_corrida(
  p_corrida_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_corrida public.corridas%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'produccion_operar')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_corrida
  FROM public.corridas AS corrida
  WHERE corrida.id = p_corrida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_corrida.estado NOT IN ('EN_PROCESO', 'PAUSADA') THEN
    RAISE EXCEPTION 'corrida_no_completable' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.corrida_id = p_corrida_id AND sesion.estado_sesion IN ('activa', 'pausada')
  ) THEN
    RAISE EXCEPTION 'corrida_con_sesiones_abiertas' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.corrida_items AS item
    WHERE item.corrida_id = p_corrida_id
      AND NOT privado.partida_produccion_completa(item.partida_id)
  ) THEN
    RAISE EXCEPTION 'corrida_items_incompletos' USING ERRCODE = '23514';
  END IF;

  UPDATE public.corridas AS corrida
  SET estado = 'COMPLETADA'
  WHERE corrida.id = p_corrida_id;

  -- Hook opcional a B5: sin la columna, no pasa nada.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_produccion'
      AND column_name = 'estado_sii'
  ) AND privado.orden_produccion_completa(v_corrida.orden_id) THEN
    UPDATE public.ordenes_produccion
    SET estado_sii = 'PRODUCCION_COMPLETADA'
    WHERE id = v_corrida.orden_id AND estado_sii = 'EN_PRODUCCION';
  END IF;

  RETURN jsonb_build_object('id', p_corrida_id, 'estado', 'COMPLETADA');
END;
$$;

COMMENT ON FUNCTION public.completar_corrida(uuid, uuid, uuid) IS
  'SII-B6.2: completa la corrida cuando no hay sesiones abiertas y todas las partidas cerraron sus metas. Solo service_role.';

REVOKE ALL ON FUNCTION public.completar_corrida(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.completar_corrida(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancelar_corrida(
  p_corrida_id uuid,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_corrida public.corridas%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_corrida
  FROM public.corridas AS corrida
  WHERE corrida.id = p_corrida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_corrida.estado IN ('COMPLETADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'corrida_no_cancelable' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.corrida_id = p_corrida_id
      AND sesion.estado_sesion = 'finalizada'
      AND sesion.piezas_producidas > 0
  ) THEN
    RAISE EXCEPTION 'corrida_con_avance' USING ERRCODE = '23514';
  END IF;

  UPDATE public.corridas AS corrida
  SET estado = 'CANCELADA'
  WHERE corrida.id = p_corrida_id;

  RETURN jsonb_build_object('id', p_corrida_id, 'estado', 'CANCELADA', 'motivo', v_motivo);
END;
$$;

COMMENT ON FUNCTION public.cancelar_corrida(uuid, text, uuid, uuid) IS
  'SII-B6.2: cancela una corrida sin producción finalizada; exige motivo. Solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_corrida(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_corrida(uuid, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Inicio de sesión: integra corrida (auto para legacy) + checklist
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid);

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

  PERFORM 1
  FROM public.programacion_areas AS previa
  WHERE previa.partida_id = p_partida_id
    AND previa.secuencia < v_programacion.secuencia
    AND previa.estado_planeacion NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'secuencia_previa_pendiente' USING ERRCODE = 'check_violation';
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

  -- Checklist validado antes de resolver la corrida (error determinista).

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.operador_id = p_operador_id AND sesion.estado_sesion = 'activa'
  ) THEN
    RAISE EXCEPTION 'operador_con_sesion_activa' USING ERRCODE = 'unique_violation';
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
  'SII-B6.2: inicia sesión dentro de una corrida (automática para legacy) con checklist de eventos críticos. Solo service_role.';

REVOKE ALL ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid, jsonb, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Cierre de sesión: pausa por catálogo, primera pieza, horas extra y corrida
-- -----------------------------------------------------------------------------
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
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
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

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = (
    SELECT sesion.programacion_id FROM public.sesiones_trabajo AS sesion WHERE sesion.id = p_sesion_id
  )
    AND programacion.partida_id = v_partida_id
    AND programacion.orden_id = v_orden_sesion_id
    AND programacion.estado_planeacion = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
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

  SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.programacion_areas AS posterior
    WHERE posterior.partida_id = v_sesion.partida_id
      AND posterior.secuencia > v_programacion.secuencia
      AND posterior.estado_planeacion <> 'cancelada'
  ) INTO v_es_ultima_secuencia;

  -- Horas extra: solo si se excede la jornada configurada del turno (>0).
  IF p_estado_destino = 'finalizada' THEN
    v_jornada := privado.obtener_capacidad_efectiva_recurso_turno(
      v_programacion.recurso_id, v_programacion.fecha_programada, v_programacion.turno);
    IF coalesce(v_jornada, 0) > 0 AND v_horas_netas > v_jornada THEN
      SELECT autorizacion.id INTO v_autorizacion_id
      FROM public.autorizaciones_hora_extra AS autorizacion
      WHERE autorizacion.estado = 'VIGENTE'
        AND autorizacion.orden_id = v_sesion.orden_id
        AND (autorizacion.sesion_id = p_sesion_id OR autorizacion.sesion_id IS NULL)
        AND autorizacion.horas_autorizadas >= (v_horas_netas - v_jornada)
      ORDER BY (autorizacion.sesion_id = p_sesion_id) DESC, autorizacion.creado_en
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
      SELECT meta.* INTO v_meta
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = v_sesion.partida_id
      ORDER BY meta.secuencia DESC
      LIMIT 1
      FOR UPDATE;
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
    fecha_fin = now(), horas_brutas = v_horas_brutas, horas_netas = v_horas_netas,
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
  SET cantidad_producida = v_cantidad_producida_nueva,
      tiempo_real_minutos = partida.tiempo_real_minutos + (v_horas_netas * 60)
  WHERE partida.id = v_sesion.partida_id;

  v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);

  IF p_estado_destino = 'pausada' THEN
    v_estado_programacion := 'bloqueada';
  ELSIF v_es_ultima_secuencia = false OR v_partida_completa THEN
    v_estado_programacion := 'completada';
  ELSE
    v_estado_programacion := 'programada';
  END IF;
  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = v_estado_programacion
  WHERE programacion.id = v_sesion.programacion_id;
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
    SET estado = 'completada', fecha_fin = now()
    WHERE orden.id = v_sesion.orden_id;
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

COMMENT ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) IS
  'SII-B6.2: cierra o pausa una sesión (motivo de catálogo, primera pieza, horas extra), acumula metas y deriva el estado de la corrida. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_trabajo_operador(uuid, uuid, numeric, text, text, text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Reclamación de recurso liberado (>1 h con motivo liberable)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reclamar_recurso_liberado(
  p_recurso_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_reclamar_recurso' USING ERRCODE = '42501';
  END IF;

  SELECT sesion.* INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
  JOIN public.catalogo_motivos_pausa AS motivo ON motivo.codigo = sesion.motivo_pausa_codigo
  WHERE programacion.recurso_id = p_recurso_id
    AND programacion.estado_planeacion = 'bloqueada'
    AND sesion.estado_sesion = 'pausada'
    AND sesion.recurso_liberado = false
    AND motivo.libera_maquina
    AND sesion.fecha_fin <= now() - interval '60 minutes'
  ORDER BY sesion.fecha_fin ASC
  LIMIT 1
  FOR UPDATE OF sesion;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET recurso_liberado = true
  WHERE sesion.id = v_sesion.id;

  RETURN jsonb_build_object(
    'sesion_id', v_sesion.id,
    'recurso_id', p_recurso_id,
    'orden_id', v_sesion.orden_id,
    'partida_id', v_sesion.partida_id,
    'motivo_pausa_codigo', v_sesion.motivo_pausa_codigo,
    'pausada_desde', v_sesion.fecha_fin
  );
END;
$$;

COMMENT ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid) IS
  'SII-B6.2: marca recurso_liberado en la sesión pausada ≥60 min con motivo liberable (traza de reclamación). Solo service_role.';

REVOKE ALL ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Cierre de jornada: ninguna sesión cruza de fecha (§6.2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_jornada(
  p_fecha date,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Tijuana')::date;
  v_fin_corte timestamptz;
  v_sesion record;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_partida_completa boolean;
  v_estado_programacion text;
  v_cerradas integer := 0;
  v_ids uuid[] := '{}';
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_cerrar_jornada' USING ERRCODE = '42501';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy THEN
    RAISE EXCEPTION 'fecha_jornada_invalida' USING ERRCODE = '22023';
  END IF;

  -- Fin de corte: el menor entre "ahora" y el final del día local de p_fecha.
  v_fin_corte := least(
    now(),
    ((p_fecha + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Tijuana'
  );

  FOR v_sesion IN
    SELECT sesion.id, sesion.partida_id, sesion.programacion_id, sesion.fecha_inicio
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.estado_sesion = 'activa'
      AND sesion.fecha_inicio <= v_fin_corte
      AND (sesion.fecha_inicio AT TIME ZONE 'America/Tijuana')::date <= p_fecha
    ORDER BY sesion.fecha_inicio
  LOOP
    -- Contrato de locks: partida → orden → programación → recurso → sesión.
    PERFORM 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_sesion.partida_id FOR UPDATE;
    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = (SELECT partida.orden_id FROM public.partidas_orden_produccion AS partida
                      WHERE partida.id = v_sesion.partida_id)
    FOR UPDATE;
    PERFORM 1 FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_sesion.programacion_id FOR UPDATE;
    PERFORM 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = v_sesion.id AND sesion.estado_sesion = 'activa' FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT calculo.horas_brutas, calculo.horas_netas INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fin_corte) AS calculo;

    UPDATE public.sesiones_trabajo AS sesion
    SET fecha_fin = v_fin_corte,
        horas_brutas = v_horas_brutas,
        horas_netas = v_horas_netas,
        piezas_producidas = 0,
        motivo_pausa = 'otro',
        motivo_pausa_codigo = 'FIN_JORNADA',
        motivo_pausa_nota = 'Cierre automático de jornada',
        estado_sesion = 'finalizada',
        notas = nullif(concat_ws(' · ', nullif(btrim(sesion.notas), ''), 'Cierre de jornada'), '')
    WHERE sesion.id = v_sesion.id;

    v_partida_completa := privado.partida_produccion_completa(v_sesion.partida_id);
    v_estado_programacion := CASE WHEN v_partida_completa THEN 'completada' ELSE 'programada' END;
    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = v_estado_programacion
    WHERE programacion.id = v_sesion.programacion_id;

    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    SELECT v_sesion.partida_id, sesion.operador_id, 'fin', 'Cierre de jornada'
    FROM public.sesiones_trabajo AS sesion WHERE sesion.id = v_sesion.id;

    v_cerradas := v_cerradas + 1;
    v_ids := array_append(v_ids, v_sesion.id);
  END LOOP;

  RETURN jsonb_build_object(
    'fecha', p_fecha,
    'sesiones_cerradas', v_cerradas,
    'sesiones', to_jsonb(v_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.cerrar_jornada(date, uuid, uuid) IS
  'SII-B6.2: cierra las sesiones activas con FIN_JORNADA sin cruzar de fecha. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_jornada(date, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_jornada(date, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Autorización de horas extra (Management/Admin)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.autorizar_horas_extra(
  p_orden_id uuid,
  p_sesion_id uuid DEFAULT NULL,
  p_horas numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_autorizacion_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'aprobar_ordenes') THEN
    RAISE EXCEPTION 'sin_permiso_horas_extra' USING ERRCODE = '42501';
  END IF;
  IF p_orden_id IS NULL OR p_horas IS NULL OR p_horas <= 0 OR p_horas <> round(p_horas, 2) THEN
    RAISE EXCEPTION 'horas_extra_invalidas' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id AND orden.estado NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_autorizable' USING ERRCODE = '23514';
  END IF;

  IF p_sesion_id IS NOT NULL THEN
    PERFORM 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = p_sesion_id AND sesion.orden_id = p_orden_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sesion_no_corresponde' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.autorizaciones_hora_extra (
    orden_id, sesion_id, horas_autorizadas, motivo, autorizado_por
  ) VALUES (
    p_orden_id, p_sesion_id, p_horas, v_motivo, p_actor_id
  )
  RETURNING id INTO v_autorizacion_id;

  RETURN jsonb_build_object(
    'id', v_autorizacion_id,
    'orden_id', p_orden_id,
    'sesion_id', p_sesion_id,
    'horas_autorizadas', p_horas,
    'estado', 'VIGENTE'
  );
END;
$$;

COMMENT ON FUNCTION public.autorizar_horas_extra(uuid, uuid, numeric, text, uuid, uuid) IS
  'SII-B6.2: registra una autorización VIGENTE de horas extra (Management/Admin). Solo service_role.';

REVOKE ALL ON FUNCTION public.autorizar_horas_extra(uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autorizar_horas_extra(uuid, uuid, numeric, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. Calidad: primera pieza, referencias de lote y cierre (§6.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_inspeccion(
  p_orden_id uuid,
  p_corrida_id uuid,
  p_partida_id uuid,
  p_codigo_item text,
  p_tipo text,
  p_referencia integer,
  p_resultado text,
  p_tolerancias jsonb,
  p_cantidad_inspeccionada numeric,
  p_cantidad_ok numeric,
  p_cantidad_nok numeric,
  p_cantidad_retrabajo numeric,
  p_material_usado jsonb,
  p_observaciones text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_codigo_item text := nullif(btrim(coalesce(p_codigo_item, '')), '');
  v_total numeric;
  v_intervalo integer;
  v_inspeccion_id uuid;
  v_permiso text;
BEGIN
  IF p_tipo NOT IN ('PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE')
     OR p_resultado NOT IN ('APROBADA', 'RECHAZADA') THEN
    RAISE EXCEPTION 'inspeccion_invalida' USING ERRCODE = '22023';
  END IF;

  v_permiso := CASE WHEN p_tipo = 'PRIMERA_PIEZA'
    THEN 'calidad_liberar_primera_pieza' ELSE 'calidad_inspeccionar' END;
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, v_permiso) THEN
    RAISE EXCEPTION 'sin_permiso_calidad' USING ERRCODE = '42501';
  END IF;

  IF p_orden_id IS NULL OR v_codigo_item IS NULL THEN
    RAISE EXCEPTION 'inspeccion_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF p_partida_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = p_partida_id AND partida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'partida_no_corresponde' USING ERRCODE = '23514';
  END IF;
  IF p_corrida_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.corridas AS corrida
    WHERE corrida.id = p_corrida_id AND corrida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'corrida_no_corresponde' USING ERRCODE = '23514';
  END IF;

  -- Referencias de lote: 1/3/5 cuando el lote es ≥5 y cada intervalo (10/20)
  -- para lotes grandes; sin bloquear producción (control estadístico básico).
  IF p_tipo = 'REFERENCIA_LOTE' THEN
    IF p_referencia IS NULL OR p_referencia <= 0 THEN
      RAISE EXCEPTION 'referencia_lote_invalida' USING ERRCODE = '22023';
    END IF;

    IF p_corrida_id IS NOT NULL THEN
      SELECT corrida.cantidad_planificada INTO v_total
      FROM public.corridas AS corrida WHERE corrida.id = p_corrida_id;
    ELSIF p_partida_id IS NOT NULL THEN
      SELECT partida.cantidad_solicitada INTO v_total
      FROM public.partidas_orden_produccion AS partida WHERE partida.id = p_partida_id;
    END IF;

    SELECT proceso.intervalo_inspeccion_lote INTO v_intervalo
    FROM public.corridas AS corrida
    JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
    WHERE corrida.id = p_corrida_id;

    IF coalesce(v_total, 0) >= 5
       AND p_referencia NOT IN (1, 3, 5)
       AND (coalesce(v_intervalo, 0) = 0 OR p_referencia % v_intervalo <> 0) THEN
      RAISE EXCEPTION 'referencia_lote_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.inspecciones_calidad (
    orden_id, corrida_id, partida_id, codigo_item, tipo, referencia, resultado,
    tolerancias, cantidad_inspeccionada, cantidad_ok, cantidad_nok, cantidad_retrabajo,
    material_usado, observaciones, liberado_por
  ) VALUES (
    p_orden_id, p_corrida_id, p_partida_id, v_codigo_item, p_tipo, p_referencia, p_resultado,
    coalesce(p_tolerancias, '{}'::jsonb),
    coalesce(p_cantidad_inspeccionada, 0), coalesce(p_cantidad_ok, 0),
    coalesce(p_cantidad_nok, 0), coalesce(p_cantidad_retrabajo, 0),
    coalesce(p_material_usado, '{}'::jsonb), nullif(btrim(coalesce(p_observaciones, '')), ''), p_actor_id
  )
  RETURNING id INTO v_inspeccion_id;

  RETURN jsonb_build_object(
    'id', v_inspeccion_id,
    'tipo', p_tipo,
    'resultado', p_resultado,
    'codigo_item', v_codigo_item,
    'referencia', p_referencia
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_inspeccion(uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric, numeric, jsonb, text, uuid, uuid) IS
  'SII-B6.3: registra primera pieza, referencia de lote o cierre con permisos de calidad. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_inspeccion(uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric, numeric, jsonb, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_inspeccion(uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric, numeric, jsonb, text, uuid, uuid) TO service_role;
