-- =============================================================================
-- SII-B5.3/B5.4 — Estados derivados, liberación, cierre administrativo y ajustes
-- Plan: docs/plan-erp-sii/05-orden-trabajo.md §5.3, §5.4
--
-- Entrega ola 1:
--   * `liberar_orden` (PLANIFICADA→LISTA) con validación de programación,
--     ruteo y archivos vivos.
--   * `cerrar_orden_administrativa` (PRODUCCION_COMPLETADA→CERRADA) al 100 %
--     entregado, independiente del cobro.
--   * `ajustar_orden_post_aceptacion` (solo pre-producción, motivo, CAS).
--   * Derivaciones: programación→PLANIFICADA; primera sesión→EN_PRODUCCION;
--     metas cumplidas→PRODUCCION_COMPLETADA.
--
-- No existe RPC de "iniciar orden": el estado deriva del avance.
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- Requiere 20261007120001_sii_b5_orden_base.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'estado_sii'
  ) THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007120001_sii_b5_orden_base antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. liberar_orden: PLANIFICADA → LISTA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liberar_orden(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_sii text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_archivos_ids uuid[];
  v_archivos_vivos integer;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_liberar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado_sii = 'CERRADA' OR v_orden.estado_sii = 'CANCELADA' THEN
    RAISE EXCEPTION 'transicion_invalida' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;
  IF v_orden.estado_sii <> 'PLANIFICADA' THEN
    RAISE EXCEPTION 'transicion_invalida' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;
  IF p_actualizado_en IS NULL OR v_orden.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = '23514';
  END IF;

  -- Programación completa: toda partida tiene al menos una programación vigente.
  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND NOT EXISTS (
        SELECT 1 FROM public.programacion_areas AS programacion
        WHERE programacion.partida_id = partida.id
          AND programacion.estado_planeacion <> 'cancelada'
      )
  ) THEN
    RAISE EXCEPTION 'orden_no_lista_para_liberar' USING ERRCODE = '23514', DETAIL = 'programacion';
  END IF;

  -- Ruteo listo: procesos capturados o ruteo/operaciones en el snapshot.
  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND coalesce(array_length(partida.procesos, 1), 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(v_orden.snapshot_json -> 'items', '[]'::jsonb)) AS elemento(item)
        WHERE coalesce(elemento.item ->> 'codigo', elemento.item ->> 'codigo_item') = partida.codigo_item
          AND (
            jsonb_array_length(coalesce(elemento.item -> 'ruteo', '[]'::jsonb)) > 0
            OR jsonb_array_length(coalesce(elemento.item -> 'operaciones', '[]'::jsonb)) > 0
          )
      )
  ) THEN
    RAISE EXCEPTION 'orden_no_lista_para_liberar' USING ERRCODE = '23514', DETAIL = 'ruteo';
  END IF;

  -- Archivos congelados: todos los ids referenciados siguen existiendo y vigentes.
  SELECT array_agg(DISTINCT archivo_ids.id)
  INTO v_archivos_ids
  FROM (
    SELECT (elemento.archivo ->> 'archivo_id')::uuid AS id
    FROM jsonb_array_elements(coalesce(v_orden.snapshot_json -> 'archivos', '[]'::jsonb)) AS elemento(archivo)
    UNION
    SELECT (archivo.archivo ->> 'archivo_id')::uuid AS id
    FROM jsonb_array_elements(coalesce(v_orden.snapshot_json -> 'items', '[]'::jsonb)) AS item(elemento)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(item.elemento -> 'archivos', '[]'::jsonb)) AS archivo(archivo)
  ) AS archivo_ids
  WHERE archivo_ids.id IS NOT NULL;

  IF v_archivos_ids IS NOT NULL THEN
    SELECT count(*)::integer INTO v_archivos_vivos
    FROM public.archivos AS archivo
    WHERE archivo.id = ANY (v_archivos_ids) AND archivo.vigente;
    IF v_archivos_vivos <> array_length(v_archivos_ids, 1) THEN
      RAISE EXCEPTION 'orden_no_lista_para_liberar' USING ERRCODE = '23514', DETAIL = 'archivos';
    END IF;
  END IF;

  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'LISTA'
  WHERE orden.id = p_orden_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'orden_liberada',
    jsonb_build_object('estado_anterior', 'PLANIFICADA', 'estado_nuevo', 'LISTA'),
    NULL, p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT orden.id, orden.estado_sii, orden.actualizado_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.liberar_orden(uuid, timestamptz, uuid, uuid) IS
  'SII-B5.3: libera la orden a producción (PLANIFICADA→LISTA) validando programación, ruteo y archivos vivos. Solo service_role.';

REVOKE ALL ON FUNCTION public.liberar_orden(uuid, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_orden(uuid, timestamptz, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 2. cerrar_orden_administrativa: PRODUCCION_COMPLETADA → CERRADA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_orden_administrativa(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_sii text, cerrada_admin_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_cerrar_admin') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado_sii = 'CERRADA' THEN
    RAISE EXCEPTION 'orden_ya_cerrada' USING ERRCODE = '23514';
  END IF;
  IF v_orden.estado_sii NOT IN ('PRODUCCION_COMPLETADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'transicion_invalida' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;
  IF v_orden.estado_sii = 'CANCELADA' THEN
    RAISE EXCEPTION 'transicion_invalida' USING ERRCODE = '23514', DETAIL = 'CANCELADA';
  END IF;
  IF p_actualizado_en IS NULL OR v_orden.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'orden_sin_partidas' USING ERRCODE = '23514';
  END IF;

  -- Cierre administrativo = 100 % de las cantidades entregadas; el cobro no
  -- participa (puede cerrarse con AR pendiente).
  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND coalesce((
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        WHERE renglon.partida_id = partida.id
      ), 0) < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_no_entregada_completa' USING ERRCODE = '23514';
  END IF;

  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'CERRADA',
      cerrada_admin_en = now(),
      cerrada_admin_por = p_actor_id
  WHERE orden.id = p_orden_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'cierre_administrativo',
    jsonb_build_object('estado_anterior', v_orden.estado_sii, 'estado_nuevo', 'CERRADA'),
    NULL, p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT orden.id, orden.estado_sii, orden.cerrada_admin_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid) IS
  'SII-B5.3: cierra administrativamente al 100 % entregado, separado del cobro y del cierre de producción. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. ajustar_orden_post_aceptacion (solo pre-producción, motivo y CAS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_orden_post_aceptacion(
  p_orden_id uuid,
  p_cambios jsonb,
  p_motivo text,
  p_actualizado_en timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_sii text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_motivo text;
  v_prioridad text;
  v_notas text;
  v_fecha timestamptz;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_editar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'cambios_requeridos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_cambios) AS clave(nombre)
    WHERE clave.nombre NOT IN ('fecha_compromiso', 'prioridad', 'notas', 'partidas')
  ) THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  -- Solo antes de entrar a producción: en piso el alcance se congela.
  IF v_orden.estado_sii NOT IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA') THEN
    RAISE EXCEPTION 'orden_en_produccion' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;
  IF p_actualizado_en IS NULL OR v_orden.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = '23514';
  END IF;

  IF p_cambios ? 'prioridad' THEN
    v_prioridad := privado.json_texto(p_cambios, 'prioridad');
    IF v_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
      RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_cambios ? 'notas' THEN
    v_notas := privado.json_texto(p_cambios, 'notas');
    IF char_length(coalesce(v_notas, '')) > 2000 THEN
      RAISE EXCEPTION 'notas_invalidas' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_cambios ? 'fecha_compromiso' THEN
    v_fecha := (privado.json_texto(p_cambios, 'fecha_compromiso'))::timestamptz;
    IF v_fecha IS NULL THEN
      RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_cambios ? 'partidas' THEN
    IF jsonb_typeof(p_cambios -> 'partidas') <> 'array' THEN
      RAISE EXCEPTION 'partidas_invalidas' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_cambios -> 'partidas') AS elemento(partida)
      WHERE jsonb_typeof(elemento.partida) <> 'object'
         OR NOT (elemento.partida ? 'partida_id')
         OR coalesce(elemento.partida ->> 'partida_id', '') !~* '^[0-9a-f-]{36}$'
         OR NOT EXISTS (
           SELECT 1 FROM public.partidas_orden_produccion AS partida
           WHERE partida.id = (elemento.partida ->> 'partida_id')::uuid
             AND partida.orden_id = p_orden_id
         )
         OR (
           elemento.partida ? 'cantidad_solicitada'
           AND (
             jsonb_typeof(elemento.partida -> 'cantidad_solicitada') <> 'number'
             OR (elemento.partida ->> 'cantidad_solicitada')::numeric <= 0
             OR (elemento.partida ->> 'cantidad_solicitada')::numeric < (
               SELECT partida.cantidad_producida FROM public.partidas_orden_produccion AS partida
               WHERE partida.id = (elemento.partida ->> 'partida_id')::uuid
             )
           )
         )
    ) THEN
      RAISE EXCEPTION 'partida_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_cambios ? 'fecha_compromiso' THEN
    UPDATE public.ordenes_produccion
    SET fecha_compromiso = v_fecha
    WHERE ordenes_produccion.id = p_orden_id;
  END IF;
  IF p_cambios ? 'prioridad' THEN
    UPDATE public.ordenes_produccion SET prioridad = v_prioridad WHERE ordenes_produccion.id = p_orden_id;
  END IF;
  IF p_cambios ? 'notas' THEN
    UPDATE public.ordenes_produccion SET notas = nullif(btrim(coalesce(v_notas, '')), '') WHERE ordenes_produccion.id = p_orden_id;
  END IF;

  IF p_cambios ? 'partidas' THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET cantidad_solicitada = (cambio.partida ->> 'cantidad_solicitada')::numeric,
        actualizado_en = now()
    FROM jsonb_array_elements(p_cambios -> 'partidas') AS cambio(partida)
    WHERE partida.id = (cambio.partida ->> 'partida_id')::uuid
      AND partida.orden_id = p_orden_id
      AND cambio.partida ? 'cantidad_solicitada';

    UPDATE public.partidas_orden_produccion AS partida
    SET descripcion = nullif(btrim(privado.json_texto(cambio.partida, 'descripcion')), ''),
        actualizado_en = now()
    FROM jsonb_array_elements(p_cambios -> 'partidas') AS cambio(partida)
    WHERE partida.id = (cambio.partida ->> 'partida_id')::uuid
      AND partida.orden_id = p_orden_id
      AND cambio.partida ? 'descripcion';
  END IF;

  -- Toca la fila para renovar el CAS aunque solo cambien partidas.
  UPDATE public.ordenes_produccion SET actualizado_en = now() WHERE ordenes_produccion.id = p_orden_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'ajuste_post_aceptacion',
    p_cambios,
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT orden.id, orden.estado_sii, orden.actualizado_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid) IS
  'SII-B5.4: ajusta fecha/prioridad/notas/cantidades antes de producción con motivo obligatorio, CAS y evento trazable. Solo service_role.';

REVOKE ALL ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Derivaciones automáticas (ADR-SII-07)
-- -----------------------------------------------------------------------------
-- CONFIRMADA → PLANIFICADA: todas las partidas tienen programación vigente.
CREATE OR REPLACE FUNCTION privado.derivar_orden_planificada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  IF NEW.estado_planeacion = 'cancelada' THEN
    RETURN NEW;
  END IF;

  SELECT partida.orden_id INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = NEW.partida_id;

  IF v_orden_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = v_orden_id
      AND NOT EXISTS (
        SELECT 1 FROM public.programacion_areas AS programacion
        WHERE programacion.partida_id = partida.id
          AND programacion.estado_planeacion <> 'cancelada'
      )
  ) THEN
    UPDATE public.ordenes_produccion
    SET estado_sii = 'PLANIFICADA'
    WHERE id = v_orden_id AND estado_sii = 'CONFIRMADA';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.derivar_orden_planificada() IS
  'SII-B5.3: CONFIRMADA→PLANIFICADA cuando todas las partidas tienen programación vigente.';

REVOKE ALL ON FUNCTION privado.derivar_orden_planificada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_programacion_derivar_orden_planificada ON public.programacion_areas;
CREATE TRIGGER trigger_programacion_derivar_orden_planificada
  AFTER INSERT OR UPDATE OF estado_planeacion ON public.programacion_areas
  FOR EACH ROW EXECUTE FUNCTION privado.derivar_orden_planificada();

-- LISTA (o antes) → EN_PRODUCCION con la primera sesión de trabajo.
CREATE OR REPLACE FUNCTION privado.derivar_orden_en_produccion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ordenes_produccion
  SET estado_sii = 'EN_PRODUCCION'
  WHERE id = NEW.orden_id
    AND estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.derivar_orden_en_produccion() IS
  'SII-B5.3: la primera sesión de trabajo pone la orden EN_PRODUCCION (sin acción manual de inicio).';

REVOKE ALL ON FUNCTION privado.derivar_orden_en_produccion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_sesiones_derivar_orden_en_produccion ON public.sesiones_trabajo;
CREATE TRIGGER trigger_sesiones_derivar_orden_en_produccion
  AFTER INSERT ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION privado.derivar_orden_en_produccion();

-- Todas las metas cumplidas → PRODUCCION_COMPLETADA.
CREATE OR REPLACE FUNCTION privado.derivar_orden_completada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  SELECT partida.orden_id INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = NEW.partida_id;

  IF v_orden_id IS NOT NULL AND privado.orden_produccion_completa(v_orden_id) THEN
    UPDATE public.ordenes_produccion
    SET estado_sii = 'PRODUCCION_COMPLETADA'
    WHERE id = v_orden_id
      AND estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.derivar_orden_completada() IS
  'SII-B5.3: PRODUCCION_COMPLETADA cuando todas las metas de todas las partidas se cumplen.';

REVOKE ALL ON FUNCTION privado.derivar_orden_completada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_avance_derivar_orden_completada ON public.registros_avance_partida;
CREATE TRIGGER trigger_avance_derivar_orden_completada
  AFTER INSERT ON public.registros_avance_partida
  FOR EACH ROW EXECUTE FUNCTION privado.derivar_orden_completada();

-- -----------------------------------------------------------------------------
-- 5. Deprecación documentada del camino antiguo de aprobación
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz, boolean, uuid) IS
  'DEPRECADO (B5 ola 1): se conserva para histórico; las órdenes nuevas se crean con crear_orden_desde_revision.';
