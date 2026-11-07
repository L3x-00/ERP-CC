-- =============================================================================
-- B7 - Consumo real con motivo y vínculo a la operación/corrida
-- Documento de aclaraciones 06/11/2026, sección 2:
--   * Consumo real: material, cantidad, costo, corrida u operación, fecha y motivo.
--   * El consumo se registra una sola vez.
--   * No se administra inventario físico, kardex, reservas ni saldos.
--
-- Alcance:
--   * Agrega `motivo` obligatorio al consumo material propio.
--   * Agrega `sesion_id` para identificar la operación individual; la corrida
--     compartida ya se identifica con `corrida_id` (B4).
--   * Propaga el motivo por las RPC de consumo, cierre individual y cierre
--     integrado sin crear consumos adicionales.
--
-- No modifica cálculos financieros de B5. No toca inventario legado.
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas de trazabilidad del consumo.
-- -----------------------------------------------------------------------------
ALTER TABLE public.registros_consumo_material
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS sesion_id uuid
    REFERENCES public.sesiones_trabajo (id) ON DELETE SET NULL;

UPDATE public.registros_consumo_material
SET motivo = 'Consumo de producción'
WHERE motivo IS NULL OR btrim(motivo) = '';

ALTER TABLE public.registros_consumo_material
  ALTER COLUMN motivo SET NOT NULL;

DO $b7_consumo_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registros_consumo_material'::regclass
      AND conname = 'registros_consumo_motivo_valido'
  ) THEN
    ALTER TABLE public.registros_consumo_material
      ADD CONSTRAINT registros_consumo_motivo_valido
      CHECK (
        btrim(motivo) <> ''
        AND char_length(motivo) <= 200
        AND motivo = btrim(motivo)
      );
  END IF;
END;
$b7_consumo_checks$;

CREATE INDEX IF NOT EXISTS idx_registros_consumo_sesion
  ON public.registros_consumo_material (sesion_id)
  WHERE sesion_id IS NOT NULL;

COMMENT ON COLUMN public.registros_consumo_material.motivo IS
  'B7: motivo obligatorio del consumo real (documento de aclaraciones, sección 2).';
COMMENT ON COLUMN public.registros_consumo_material.sesion_id IS
  'B7: sesión/operación individual que originó el consumo. La corrida compartida usa corrida_id.';

-- -----------------------------------------------------------------------------
-- 2. Consumo de material propio con motivo y sesión.
--    Función privada reutilizada por las variantes administrativa y de piso.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS privado.registrar_consumo_material_c6(
  uuid, uuid, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION privado.registrar_consumo_material_c6(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo text,
  p_sesion_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_material_partida_id uuid;
  v_material public.catalogo_materiales%ROWTYPE;
  v_total numeric := p_cantidad_usada + p_cantidad_scrap;
  v_tipo_cambio numeric;
  v_costo_mxn numeric;
  v_consumo_id uuid;
  v_corrida_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF p_actor_id IS NULL OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_consumo_invalida' USING ERRCODE = '23514';
  END IF;
  IF v_motivo = '' OR char_length(v_motivo) > 200 THEN
    RAISE EXCEPTION 'motivo_consumo_requerido' USING ERRCODE = '23514';
  END IF;

  SELECT partida.catalogo_material_id INTO v_material_partida_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_material_partida_id IS NOT NULL AND v_material_partida_id <> p_material_id THEN
    RAISE EXCEPTION 'material_no_corresponde_partida' USING ERRCODE = '23514';
  END IF;

  IF p_sesion_id IS NOT NULL THEN
    SELECT sesion.corrida_id INTO v_corrida_id
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = p_sesion_id
      AND sesion.partida_id = p_partida_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
    END IF;
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
    costo_unitario_momento, actor_id, origen, corrida_id, sesion_id, motivo
  ) VALUES (
    p_partida_id, NULL, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    v_material.unidad_base, v_material.costo_vigente, v_material.moneda_costo,
    v_tipo_cambio, v_costo_mxn, p_actor_id, 'NUEVO', v_corrida_id, p_sesion_id,
    v_motivo
  ) RETURNING registros_consumo_material.id INTO v_consumo_id;

  RETURN QUERY SELECT v_consumo_id, v_costo_mxn, v_total, NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION privado.registrar_consumo_material_c6(
  uuid, uuid, numeric, numeric, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo text,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM privado.registrar_consumo_material_c6(
    p_partida_id, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    p_motivo, NULL::uuid, p_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_operador_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo text,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_sesion_id uuid;
BEGIN
  SELECT partida.orden_id, partida.operador_asignado_id
  INTO v_orden_id, v_operador_asignado_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id AND orden.estado = 'en_proceso' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id AND operador.rol = 'operador' AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = '23514';
  END IF;

  -- B7: si el operador tiene una sesión activa para la partida, el consumo
  -- queda vinculado a esa operación individual; si no, sigue siendo consumo
  -- manual de la partida.
  SELECT sesion.id INTO v_sesion_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = p_partida_id
    AND sesion.operador_id = p_operador_id
    AND sesion.estado_sesion = 'activa'
  ORDER BY sesion.fecha_inicio DESC
  LIMIT 1;

  RETURN QUERY SELECT * FROM privado.registrar_consumo_material_c6(
    p_partida_id, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    p_motivo, v_sesion_id, p_operador_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.registrar_consumo_material_op(
  uuid, uuid, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, uuid);

REVOKE ALL ON FUNCTION public.registrar_consumo_material_op(
  uuid, uuid, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_op(
  uuid, uuid, numeric, numeric, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, text, uuid)
  TO service_role;

-- El motivo es dato operativo, no financiero; se conserva la lectura acotada.
GRANT SELECT (motivo, sesion_id) ON public.registros_consumo_material TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Cierre individual con consumo: recibe y propaga el motivo.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.cerrar_sesion_con_consumo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo_consumo text,
  p_meta_proceso_id uuid DEFAULT NULL,
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
SET search_path TO ''
AS $function$
DECLARE
  v_partida_id uuid;
BEGIN
  IF p_sesion_id IS NULL
     OR p_operador_id IS NULL
     OR p_material_id IS NULL
     OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0
     OR p_cantidad_usada IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0
     OR p_cantidad_scrap < 0
     OR p_cantidad_usada + p_cantidad_scrap <= 0
  THEN
    RAISE EXCEPTION 'cierre_sesion_invalido'
      USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(coalesce(p_motivo_consumo, '')), '') IS NULL
     OR char_length(btrim(p_motivo_consumo)) > 200 THEN
    RAISE EXCEPTION 'motivo_consumo_requerido'
      USING ERRCODE = '23514';
  END IF;

  SELECT sesion.partida_id
  INTO v_partida_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
    AND sesion.operador_id = p_operador_id
    AND sesion.estado_sesion = 'activa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.registrar_consumo_material_operador_op(
    v_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap,
    btrim(p_motivo_consumo),
    p_operador_id
  );

  RETURN QUERY
  SELECT cierre.*
  FROM public.cerrar_sesion_trabajo_operador(
    p_sesion_id,
    p_operador_id,
    p_piezas_producidas,
    'finalizada',
    NULL::text,
    p_notas,
    p_meta_proceso_id
  ) AS cierre;
END;
$function$;

COMMENT ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, text, uuid, text
) IS
  'C10 + B7: registra consumo con motivo y cierra una sesión finalizada en una única transacción. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, text, uuid, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Consumo total de una corrida compartida con motivo y sesión.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS privado.registrar_consumo_corrida_b4(
  uuid, uuid, uuid, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION privado.registrar_consumo_corrida_b4(
  p_corrida_id uuid,
  p_partida_principal_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo text,
  p_sesion_id uuid,
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
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_corrida_sesion uuid;
BEGIN
  IF p_corrida_id IS NULL OR p_partida_principal_id IS NULL OR p_material_id IS NULL
     OR p_actor_id IS NULL OR p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0
     OR p_sesion_id IS NULL THEN
    RAISE EXCEPTION 'cantidad_consumo_invalida' USING ERRCODE = '23514';
  END IF;
  IF v_motivo = '' OR char_length(v_motivo) > 200 THEN
    RAISE EXCEPTION 'motivo_consumo_requerido' USING ERRCODE = '23514';
  END IF;

  SELECT sesion.corrida_id INTO v_corrida_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
    AND sesion.estado_sesion = 'activa'
  FOR KEY SHARE;
  IF NOT FOUND OR v_corrida_sesion IS DISTINCT FROM p_corrida_id THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '23514';
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
    costo_unitario_momento, actor_id, origen, corrida_id, sesion_id, motivo
  ) VALUES (
    p_partida_principal_id, NULL, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    v_material.unidad_base, v_material.costo_vigente, v_material.moneda_costo,
    v_tipo_cambio, v_costo_mxn, p_actor_id, 'NUEVO', p_corrida_id, p_sesion_id,
    v_motivo
  ) RETURNING registros_consumo_material.id INTO v_consumo_id;

  RETURN v_consumo_id;
END;
$function$;

COMMENT ON FUNCTION privado.registrar_consumo_corrida_b4(
  uuid, uuid, uuid, numeric, numeric, text, uuid, uuid) IS
  'AUD-10 + B7: registra una vez el consumo total de la corrida con costo congelado, motivo y sesión.';

REVOKE ALL ON FUNCTION privado.registrar_consumo_corrida_b4(
  uuid, uuid, uuid, numeric, numeric, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Cierre integrado: motivo obligatorio solo cuando hay consumo.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.cerrar_sesion_integrada(
  p_sesion_id uuid,
  p_items jsonb,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_motivo_consumo text,
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
  v_motivo text := btrim(coalesce(p_motivo_consumo, ''));
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
  IF v_consumo_total > 0 AND (v_motivo = '' OR char_length(v_motivo) > 200) THEN
    RAISE EXCEPTION 'motivo_consumo_requerido' USING ERRCODE = '23514';
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
      p_cantidad_usada, p_cantidad_scrap, v_motivo, p_sesion_id, p_actor_id);
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
  uuid, jsonb, uuid, numeric, numeric, text, text, uuid) IS
  'C13.4 + AUD-09/AUD-10 + B7: cierra la corrida con consumo único, motivo y minutos por ítem opcionales.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion_integrada(
  uuid, jsonb, uuid, numeric, numeric, text, text, uuid) TO service_role;
