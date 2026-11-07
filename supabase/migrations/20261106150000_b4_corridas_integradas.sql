-- =============================================================================
-- B4 - Corridas integradas, avances y materiales compartidos
-- Hallazgos: AUD-09 (avance del ítem extra a la meta equivocada y referencia
-- inválida en obtener_items_corrida), AUD-10 (tiempo/costo compartido) y
-- AUD-11 (duplicados de material del cliente por reintentos/concurrencia).
--
-- Decisiones del cliente (06/11/2026):
--   * Una corrida compartida registra una sola vez su tiempo y consumo total.
--   * No se exige repartir minutos entre ítems para cerrar.
--   * El avance de cada ítem corresponde a la operación realmente ejecutada.
--   * El material del cliente no es compra propia ni toca inventario.
--
-- No modifica B5. No crea inventario físico. No cambia la regla de negocio de
-- las órdenes ni la estructura de entregas.
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUD-10 - El tiempo individual por ítem es opcional.
--    El tiempo total real vive en sesiones_trabajo.horas_netas; los minutos por
--    ítem solo se guardan cuando son identificables.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sesion_item_tiempos
  ALTER COLUMN minutos DROP NOT NULL;

DO $b4_minutos_check$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.sesion_item_tiempos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%minutos%'
  LOOP
    EXECUTE format('ALTER TABLE public.sesion_item_tiempos DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sesion_item_tiempos'::regclass
      AND conname = 'sesion_item_tiempos_minutos_validos'
  ) THEN
    ALTER TABLE public.sesion_item_tiempos
      ADD CONSTRAINT sesion_item_tiempos_minutos_validos
      CHECK (minutos IS NULL OR (minutos > 0 AND minutos <= 1440));
  END IF;
END;
$b4_minutos_check$;

COMMENT ON COLUMN public.sesion_item_tiempos.minutos IS
  'AUD-10: minutos individuales opcionales. NULL = el tiempo se costea a nivel de corrida/sesión.';

-- -----------------------------------------------------------------------------
-- 2. AUD-10 - Consumo compartido trazable a la corrida (una sola vez).
-- -----------------------------------------------------------------------------
ALTER TABLE public.registros_consumo_material
  ADD COLUMN IF NOT EXISTS corrida_id uuid REFERENCES public.corridas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registros_consumo_corrida
  ON public.registros_consumo_material (corrida_id)
  WHERE corrida_id IS NOT NULL;

COMMENT ON COLUMN public.registros_consumo_material.corrida_id IS
  'AUD-10: corrida compartida que originó el consumo total; se registra una sola vez y consolida a la orden.';

-- -----------------------------------------------------------------------------
-- 3. AUD-09 - Meta/operación que corresponde al proceso de la corrida.
--    Prioridad: nombre o código del proceso; si la partida solo tiene una meta
--    (ruta legacy), esa meta. Si hay varias y ninguna coincide, se rechaza.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.meta_proceso_corrida_b4(
  p_corrida_id uuid,
  p_partida_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_nombre text;
  v_codigo text;
  v_coincidencias integer;
  v_total integer;
  v_meta_id uuid;
BEGIN
  IF p_corrida_id IS NULL OR p_partida_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT proceso.nombre, proceso.codigo INTO v_nombre, v_codigo
  FROM public.corridas AS corrida
  JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
  WHERE corrida.id = p_corrida_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_coincidencias
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = p_partida_id
    AND (
      lower(btrim(meta.nombre)) = lower(btrim(v_nombre))
      OR lower(btrim(meta.nombre)) = lower(btrim(v_codigo))
    );
  IF v_coincidencias = 1 THEN
    SELECT meta.id INTO v_meta_id
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = p_partida_id
      AND (
        lower(btrim(meta.nombre)) = lower(btrim(v_nombre))
        OR lower(btrim(meta.nombre)) = lower(btrim(v_codigo))
      )
    ORDER BY meta.secuencia
    LIMIT 1;
    RETURN v_meta_id;
  END IF;
  IF v_coincidencias > 1 THEN
    RAISE EXCEPTION 'meta_proceso_ambigua' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = p_partida_id;
  IF v_total = 1 THEN
    SELECT meta.id INTO v_meta_id
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = p_partida_id
    LIMIT 1;
    RETURN v_meta_id;
  END IF;

  RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = '23514';
END;
$function$;

COMMENT ON FUNCTION privado.meta_proceso_corrida_b4(uuid, uuid) IS
  'AUD-09: resuelve la meta/operación de la partida que coincide con el proceso de la corrida.';

REVOKE ALL ON FUNCTION privado.meta_proceso_corrida_b4(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. AUD-09 - Avance de un ítem extra en la operación de la corrida.
--    No exige que el operador de la sesión sea el asignado de la partida (la
--    corrida compartida puede reunir ítems de distintos operadores), pero sí
--    valida orden activa, operador activo, meta correcta y disponibilidad.
--    No actualiza el estado de la orden: lo decide el cierre principal.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.registrar_avance_corrida_b4(
  p_partida_id uuid,
  p_operador_id uuid,
  p_cantidad_producida numeric,
  p_cantidad_scrap numeric,
  p_meta_proceso_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_orden_id uuid;
  v_cantidad_producida_actual numeric;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_hecho_meta numeric;
  v_piezas_previas numeric;
  v_es_meta_final boolean;
BEGIN
  IF p_partida_id IS NULL OR p_operador_id IS NULL OR p_meta_proceso_id IS NULL
     OR p_cantidad_producida IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_producida < 0 OR p_cantidad_scrap < 0
     OR p_cantidad_producida + p_cantidad_scrap <= 0 THEN
    RAISE EXCEPTION 'cantidad_avance_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT partida.orden_id, partida.cantidad_producida
  INTO v_orden_id, v_cantidad_producida_actual
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_meta
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id AND meta.partida_id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id AND orden.estado = 'en_proceso'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = '23514';
  END IF;

  SELECT v_meta.secuencia = (
    SELECT max(meta.secuencia) FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = p_partida_id
  ) INTO v_es_meta_final;

  IF p_cantidad_producida > 0 THEN
    SELECT coalesce(sum(avance.cantidad_producida), 0) INTO v_hecho_meta
    FROM public.registros_avance_partida AS avance
    WHERE avance.meta_proceso_id = v_meta.id;
    IF v_hecho_meta + p_cantidad_producida > v_meta.meta_piezas THEN
      RAISE EXCEPTION 'cantidad_excede_meta_proceso' USING ERRCODE = '23514';
    END IF;

    v_piezas_previas := privado.piezas_disponibles_proceso(v_meta.id);
    IF v_piezas_previas IS NOT NULL AND p_cantidad_producida > v_piezas_previas THEN
      RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.registros_avance_partida (
    partida_id, operador_id, cantidad_producida, cantidad_scrap,
    sesion_trabajo_id, meta_proceso_id
  ) VALUES (
    p_partida_id, p_operador_id, p_cantidad_producida, p_cantidad_scrap,
    NULL, v_meta.id
  );

  UPDATE public.partidas_orden_produccion AS partida
  SET cantidad_producida = v_cantidad_producida_actual
        + CASE WHEN v_es_meta_final THEN p_cantidad_producida ELSE 0 END,
      cantidad_scrap = partida.cantidad_scrap + p_cantidad_scrap
  WHERE partida.id = p_partida_id;
END;
$function$;

COMMENT ON FUNCTION privado.registrar_avance_corrida_b4(
  uuid, uuid, numeric, numeric, uuid) IS
  'AUD-09: avance de un ítem extra en la meta que corresponde al proceso de la corrida, sin exigir operador asignado.';

REVOKE ALL ON FUNCTION privado.registrar_avance_corrida_b4(
  uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. AUD-10 - Consumo total de una corrida compartida, registrado una vez.
--    Se valida que el material pertenezca a algún ítem de la corrida y se
--    guarda en la partida principal con corrida_id para trazabilidad. No toca
--    existencias ni crea compras.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.registrar_consumo_corrida_b4(
  p_corrida_id uuid,
  p_partida_principal_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_material public.catalogo_materiales%ROWTYPE;
  v_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_tipo_cambio numeric;
  v_costo_mxn numeric;
  v_consumo_id uuid;
BEGIN
  IF p_corrida_id IS NULL OR p_partida_principal_id IS NULL OR p_material_id IS NULL
     OR p_actor_id IS NULL OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_consumo_invalida' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.corrida_items AS item
    JOIN public.partidas_orden_produccion AS partida ON partida.id = item.partida_id
    WHERE item.corrida_id = p_corrida_id
      AND partida.catalogo_material_id = p_material_id
  ) THEN
    RAISE EXCEPTION 'material_no_corresponde_corrida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_material
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id AND material.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente_o_inactivo' USING ERRCODE = 'P0002';
  END IF;
  IF v_material.costo_vigente IS NULL OR v_material.fecha_vigencia_costo IS NULL THEN
    RAISE EXCEPTION 'costo_material_no_configurado' USING ERRCODE = '23514';
  END IF;

  IF v_material.moneda_costo = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSE
    SELECT configuracion.tipo_cambio_usd INTO v_tipo_cambio
    FROM public.configuracion_sistema AS configuracion
    LIMIT 1;
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'tipo_cambio_no_configurado' USING ERRCODE = '23514';
    END IF;
  END IF;
  v_costo_mxn := round(v_material.costo_vigente * v_tipo_cambio, 4);

  INSERT INTO public.registros_consumo_material (
    partida_id, material_id, catalogo_material_id, cantidad_usada, cantidad_scrap,
    unidad_base, costo_unitario_origen, moneda_costo, tipo_cambio,
    costo_unitario_momento, actor_id, origen, corrida_id
  ) VALUES (
    p_partida_principal_id, NULL, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    v_material.unidad_base, v_material.costo_vigente, v_material.moneda_costo,
    v_tipo_cambio, v_costo_mxn, p_actor_id, 'NUEVO', p_corrida_id
  ) RETURNING registros_consumo_material.id INTO v_consumo_id;

  RETURN v_consumo_id;
END;
$function$;

COMMENT ON FUNCTION privado.registrar_consumo_corrida_b4(
  uuid, uuid, uuid, numeric, numeric, uuid) IS
  'AUD-10: registra el consumo total de una corrida una sola vez, con costo congelado y sin inventario.';

REVOKE ALL ON FUNCTION privado.registrar_consumo_corrida_b4(
  uuid, uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. AUD-09 - Lectura de ítems de la corrida con la operación correcta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_items_corrida(
  p_corrida_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  codigo_pieza text,
  meta_proceso_id uuid,
  cantidad_solicitada numeric,
  cantidad_producida numeric,
  disponible numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_corrida_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS usuario
    WHERE usuario.id = p_actor_id AND usuario.activo = true
  ) AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT partida.id, partida.codigo_pieza, meta.id,
    partida.cantidad_solicitada, partida.cantidad_producida,
    CASE WHEN meta.id IS NULL THEN NULL
         ELSE privado.piezas_disponibles_proceso(meta.id) END
  FROM public.corrida_items AS item
  JOIN public.corridas AS corrida ON corrida.id = item.corrida_id
  JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = item.partida_id
  LEFT JOIN LATERAL (
    SELECT candidata.id
    FROM public.metas_proceso_partida AS candidata
    WHERE candidata.partida_id = partida.id
      AND (
        lower(btrim(candidata.nombre)) = lower(btrim(proceso.nombre))
        OR lower(btrim(candidata.nombre)) = lower(btrim(proceso.codigo))
        OR (
          SELECT count(*) FROM public.metas_proceso_partida AS total
          WHERE total.partida_id = partida.id
        ) = 1
      )
    ORDER BY candidata.secuencia
    LIMIT 1
  ) AS meta ON true
  WHERE item.corrida_id = p_corrida_id
  ORDER BY partida.codigo_pieza;
END;
$function$;

COMMENT ON FUNCTION public.obtener_items_corrida(uuid, uuid) IS
  'C13.4 + AUD-09: ítems de la corrida con la meta/operación real y disponibilidad.';

REVOKE ALL ON FUNCTION public.obtener_items_corrida(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_items_corrida(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. AUD-09/AUD-10 - Cierre integrado corregido.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_sesion_integrada(
  p_sesion_id uuid,
  p_items jsonb,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_notas text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_calculo record;
  v_item record;
  v_total_items integer := 0;
  v_piezas_principal numeric := NULL;
  v_meta_principal uuid := NULL;
  v_meta_item uuid;
  v_total_minutos numeric := 0;
  v_minutos_declarados boolean := false;
  v_consumo_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_cierre record;
  v_items jsonb := '[]'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_consumo_total > 0 AND p_material_id IS NULL THEN
    RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_cierre_integrado' USING ERRCODE = '42501';
  END IF;
  IF v_sesion.corrida_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id
    AND programacion.partida_id = v_sesion.partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_no_en_proceso' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_calculo
  FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now());

  FOR v_item IN
    SELECT fila.partida_id, fila.piezas, fila.minutos
    FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
  LOOP
    IF v_item.partida_id IS NULL OR v_item.piezas IS NULL OR v_item.piezas < 0
       OR (v_item.minutos IS NOT NULL AND (v_item.minutos <= 0 OR v_item.minutos > 1440)) THEN
      RAISE EXCEPTION 'cierre_integrado_invalido' USING ERRCODE = '23514';
    END IF;
    IF v_item.partida_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'item_duplicado' USING ERRCODE = '23514';
    END IF;
    v_ids := array_append(v_ids, v_item.partida_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.corrida_items AS corrida_item
      WHERE corrida_item.corrida_id = v_sesion.corrida_id
        AND corrida_item.partida_id = v_item.partida_id
    ) THEN
      RAISE EXCEPTION 'item_fuera_de_corrida' USING ERRCODE = '23514';
    END IF;

    v_meta_item := privado.meta_proceso_corrida_b4(v_sesion.corrida_id, v_item.partida_id);
    IF v_item.partida_id = v_sesion.partida_id THEN
      v_piezas_principal := v_item.piezas;
      v_meta_principal := v_meta_item;
    END IF;
    IF v_item.minutos IS NOT NULL THEN
      v_total_minutos := v_total_minutos + v_item.minutos;
      v_minutos_declarados := true;
    END IF;
    v_total_items := v_total_items + 1;
  END LOOP;

  IF v_piezas_principal IS NULL THEN
    RAISE EXCEPTION 'item_principal_requerido' USING ERRCODE = '23514';
  END IF;
  IF v_minutos_declarados
     AND v_total_minutos > greatest(coalesce(v_calculo.horas_netas, 0) * 60, 1) THEN
    RAISE EXCEPTION 'minutos_exceden_sesion' USING ERRCODE = '23514';
  END IF;
  IF v_programacion.meta_proceso_id IS NOT NULL
     AND v_programacion.meta_proceso_id <> v_meta_principal THEN
    RAISE EXCEPTION 'proceso_corrida_no_corresponde' USING ERRCODE = '23514';
  END IF;

  -- Consumo total de la corrida, una sola vez y con trazabilidad a la corrida.
  IF v_consumo_total > 0 THEN
    PERFORM privado.registrar_consumo_corrida_b4(
      v_sesion.corrida_id, v_sesion.partida_id, p_material_id,
      p_cantidad_usada, p_cantidad_scrap, p_actor_id);
  END IF;

  -- Avance de los ítems extra en su operación real.
  FOR v_item IN
    SELECT fila.partida_id, fila.piezas
    FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
    WHERE fila.partida_id <> v_sesion.partida_id
  LOOP
    IF v_item.piezas > 0 THEN
      PERFORM privado.registrar_avance_corrida_b4(
        v_item.partida_id, v_sesion.operador_id, v_item.piezas, 0,
        privado.meta_proceso_corrida_b4(v_sesion.corrida_id, v_item.partida_id));
    END IF;
  END LOOP;

  INSERT INTO public.sesion_item_tiempos (sesion_id, partida_id, piezas, minutos)
  SELECT p_sesion_id, fila.partida_id, fila.piezas, fila.minutos
  FROM jsonb_to_recordset(p_items) AS fila(partida_id uuid, piezas numeric, minutos numeric)
  ON CONFLICT (sesion_id, partida_id) DO UPDATE
    SET piezas = EXCLUDED.piezas, minutos = EXCLUDED.minutos;

  -- El consumo ya se registró; el cierre principal usa la operación resuelta.
  SELECT * INTO v_cierre
  FROM public.cerrar_sesion_trabajo_operador(
    p_sesion_id, v_sesion.operador_id, v_piezas_principal, 'finalizada',
    NULL, p_notas, v_meta_principal);

  SELECT jsonb_agg(jsonb_build_object(
    'partida_id', tiempo.partida_id,
    'piezas', tiempo.piezas,
    'minutos', tiempo.minutos
  ) ORDER BY tiempo.partida_id)
  INTO v_items
  FROM public.sesion_item_tiempos AS tiempo
  WHERE tiempo.sesion_id = p_sesion_id;

  RETURN jsonb_build_object('cierre', to_jsonb(v_cierre), 'items', coalesce(v_items, '[]'::jsonb));
END;
$function$;

COMMENT ON FUNCTION public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, uuid) IS
  'C13.4 + AUD-09/AUD-10: cierra la corrida con avance en la operación real, consumo único y tiempo total de sesión; los minutos por ítem son opcionales.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. AUD-10 - Lectura de tiempos integrados con minutos opcionales.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_tiempos_integrados_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  sesion_id uuid,
  fecha_inicio timestamptz,
  operador_nombre text,
  partida_id uuid,
  codigo_pieza text,
  piezas numeric,
  minutos numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_cierre_integrado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT tiempo.sesion_id, sesion.fecha_inicio,
    coalesce(usuario.nombre_completo, 'Operador'),
    tiempo.partida_id, partida.codigo_pieza, tiempo.piezas, tiempo.minutos
  FROM public.sesion_item_tiempos AS tiempo
  JOIN public.sesiones_trabajo AS sesion ON sesion.id = tiempo.sesion_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = tiempo.partida_id
  LEFT JOIN public.usuarios AS usuario ON usuario.id = sesion.operador_id
  WHERE sesion.orden_id = p_orden_id
    AND EXISTS (
      SELECT 1 FROM public.sesion_item_tiempos AS hermano
      WHERE hermano.sesion_id = tiempo.sesion_id
      GROUP BY hermano.sesion_id
      HAVING count(*) > 1
    )
  ORDER BY sesion.fecha_inicio DESC, partida.codigo_pieza;
END;
$function$;

COMMENT ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid) IS
  'C13.4 + AUD-10: sesiones con más de un ítem; minutos por ítem opcionales (NULL = costo a nivel de sesión).';

REVOKE ALL ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_tiempos_integrados_orden(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. AUD-11 - Material del cliente: idempotencia y concurrencia.
-- -----------------------------------------------------------------------------
ALTER TABLE public.consumos_material_cliente
  ADD COLUMN IF NOT EXISTS solicitud_id uuid;

DO $b4_material_cliente_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consumos_material_cliente'::regclass
      AND conname = 'consumos_material_cliente_solicitud_unica'
  ) THEN
    ALTER TABLE public.consumos_material_cliente
      ADD CONSTRAINT consumos_material_cliente_solicitud_unica UNIQUE (solicitud_id);
  END IF;
END;
$b4_material_cliente_key$;

COMMENT ON COLUMN public.consumos_material_cliente.solicitud_id IS
  'AUD-11: clave de idempotencia por intento de consumo del material del cliente.';

CREATE OR REPLACE FUNCTION privado.registrar_consumo_material_cliente_b4(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid,
  p_solicitud_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_declarado numeric;
  v_consumido numeric;
  v_consumo_id uuid;
  v_existente public.consumos_material_cliente%ROWTYPE;
BEGIN
  IF p_sesion_id IS NULL OR p_material_id IS NULL OR p_actor_id IS NULL
     OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'consumo_material_cliente_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;
  IF v_sesion.estado_sesion <> 'activa'
     AND (v_sesion.estado_sesion <> 'finalizada'
          OR v_sesion.fecha_fin IS NULL
          OR v_sesion.fecha_fin < now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;

  -- Lock por partida: serializa consumos de sesiones distintas del mismo ítem.
  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_sesion.partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_sesion.orden_id;
  IF v_orden.propuesta_revision_id IS NULL THEN
    RAISE EXCEPTION 'material_cliente_no_declarado' USING ERRCODE = '23514';
  END IF;

  SELECT material.cantidad INTO v_declarado
  FROM public.material_cliente_item AS material
  WHERE material.propuesta_revision_id = v_orden.propuesta_revision_id
    AND material.codigo_item = v_partida.codigo_pieza
    AND material.material_id = p_material_id;
  IF v_declarado IS NULL THEN
    RAISE EXCEPTION 'material_cliente_no_declarado' USING ERRCODE = '23514';
  END IF;

  -- Reintento válido: devuelve el consumo original sin insertar otro.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente
    FROM public.consumos_material_cliente AS consumo
    WHERE consumo.solicitud_id = p_solicitud_id;
    IF FOUND THEN
      IF v_existente.sesion_id IS DISTINCT FROM p_sesion_id
         OR v_existente.partida_id IS DISTINCT FROM v_sesion.partida_id
         OR v_existente.material_id IS DISTINCT FROM p_material_id
         OR v_existente.cantidad_usada IS DISTINCT FROM p_cantidad_usada
         OR v_existente.cantidad_scrap IS DISTINCT FROM p_cantidad_scrap THEN
        RAISE EXCEPTION 'solicitud_consumo_conflicto' USING ERRCODE = '23514';
      END IF;
      SELECT coalesce(sum(consumo.cantidad_usada + consumo.cantidad_scrap), 0)
      INTO v_consumido
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.partida_id = v_sesion.partida_id
        AND consumo.material_id = p_material_id;
      RETURN QUERY
      SELECT v_existente.id, v_existente.orden_id, v_existente.partida_id,
        v_existente.material_id, v_existente.cantidad_usada, v_existente.cantidad_scrap,
        v_declarado, v_consumido, v_declarado - v_consumido;
      RETURN;
    END IF;
  END IF;

  SELECT coalesce(sum(consumo.cantidad_usada + consumo.cantidad_scrap), 0)
  INTO v_consumido
  FROM public.consumos_material_cliente AS consumo
  WHERE consumo.partida_id = v_sesion.partida_id
    AND consumo.material_id = p_material_id;

  IF v_consumido + v_total > v_declarado THEN
    RAISE EXCEPTION 'material_cliente_insuficiente' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.consumos_material_cliente (
    orden_id, partida_id, material_id, cantidad_usada, cantidad_scrap,
    sesion_id, registrado_por, solicitud_id
  ) VALUES (
    v_sesion.orden_id, v_sesion.partida_id, p_material_id,
    p_cantidad_usada, p_cantidad_scrap, v_sesion.id, p_actor_id, p_solicitud_id
  ) RETURNING consumos_material_cliente.id INTO v_consumo_id;

  RETURN QUERY
  SELECT consumo.id, consumo.orden_id, consumo.partida_id, consumo.material_id,
    consumo.cantidad_usada, consumo.cantidad_scrap,
    v_declarado, v_consumido + v_total, v_declarado - (v_consumido + v_total)
  FROM public.consumos_material_cliente AS consumo
  WHERE consumo.id = v_consumo_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_solicitud_id IS NOT NULL THEN
      SELECT * INTO v_existente
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.solicitud_id = p_solicitud_id;
      IF FOUND THEN
        SELECT coalesce(sum(consumo.cantidad_usada + consumo.cantidad_scrap), 0)
        INTO v_consumido
        FROM public.consumos_material_cliente AS consumo
        WHERE consumo.partida_id = v_sesion.partida_id
          AND consumo.material_id = p_material_id;
        RETURN QUERY
        SELECT v_existente.id, v_existente.orden_id, v_existente.partida_id,
          v_existente.material_id, v_existente.cantidad_usada, v_existente.cantidad_scrap,
          v_declarado, v_consumido, v_declarado - v_consumido;
        RETURN;
      END IF;
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION privado.registrar_consumo_material_cliente_b4(
  uuid, uuid, numeric, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Firma histórica de 5 argumentos: se conserva para pruebas y llamadas viejas.
CREATE OR REPLACE FUNCTION public.registrar_consumo_material_cliente(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM privado.registrar_consumo_material_cliente_b4(
    p_sesion_id, p_material_id, p_cantidad_usada, p_cantidad_scrap, p_actor_id, NULL);
$$;

-- Firma nueva con clave de idempotencia.
CREATE OR REPLACE FUNCTION public.registrar_consumo_material_cliente(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_actor_id uuid,
  p_solicitud_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM privado.registrar_consumo_material_cliente_b4(
    p_sesion_id, p_material_id, p_cantidad_usada, p_cantidad_scrap, p_actor_id, p_solicitud_id);
$$;

COMMENT ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid) IS
  'C13.3 + AUD-11: consumo del material del cliente sin inventario ni costo propio. Solo service_role.';
COMMENT ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid, uuid) IS
  'C13.3 + AUD-11: consumo idempotente por solicitud_id y serializado por partida. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_cliente(
  uuid, uuid, numeric, numeric, uuid, uuid) TO service_role;
