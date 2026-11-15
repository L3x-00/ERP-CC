-- =============================================================================
-- C17 (2026-11-15): consumo de piezas en procesos posteriores al corte.
--
-- Observación del cliente (Sergio): en Doblado (y cualquier proceso posterior)
-- el operador no consume la lámina completa, sino las piezas que liberó el
-- proceso anterior. El formulario debe listar esas piezas y la merma debe
-- descontar del inventario de piezas disponible para los procesos siguientes.
--
-- Modelo:
--   * `registros_avance_partida.cantidad_consumida` guarda cuántas piezas del
--     proceso previo tomó la operación (buenas + merma).
--   * `piezas_disponibles_proceso` usa lo consumido por la operación actual, no
--     lo producido, para calcular lo que queda del proceso anterior. Los
--     registros históricos sin consumo siguen usando lo producido.
--   * El consumo se registra después del cierre de la sesión con una RPC
--     idempotente; el cierre existente no cambia de firma.
--
-- Aplicar solo localmente; el remoto lo controla el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trazabilidad del consumo de piezas.
-- -----------------------------------------------------------------------------
ALTER TABLE public.registros_avance_partida
  ADD COLUMN IF NOT EXISTS cantidad_consumida numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_consumo_piezas text;

ALTER TABLE public.registros_avance_partida
  DROP CONSTRAINT IF EXISTS registros_avance_cantidad_consumida_positiva;
ALTER TABLE public.registros_avance_partida
  ADD CONSTRAINT registros_avance_cantidad_consumida_positiva
  CHECK (cantidad_consumida >= 0) NOT VALID;

ALTER TABLE public.registros_avance_partida
  DROP CONSTRAINT IF EXISTS registros_avance_motivo_consumo_piezas_valido;
ALTER TABLE public.registros_avance_partida
  ADD CONSTRAINT registros_avance_motivo_consumo_piezas_valido
  CHECK (
    motivo_consumo_piezas IS NULL
    OR (char_length(btrim(motivo_consumo_piezas)) BETWEEN 3 AND 200)
  ) NOT VALID;

COMMENT ON COLUMN public.registros_avance_partida.cantidad_consumida IS
  'C17: piezas del proceso previo consumidas por esta operación (buenas + merma).';
COMMENT ON COLUMN public.registros_avance_partida.motivo_consumo_piezas IS
  'C17: motivo del consumo de piezas del proceso previo.';

-- -----------------------------------------------------------------------------
-- 2. Disponibilidad: el proceso actual consume piezas, no las produce.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.piezas_disponibles_proceso(p_meta_proceso_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_previa_id uuid;
  v_hecho_previo numeric;
  v_consumido_actual numeric;
BEGIN
  IF p_meta_proceso_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_meta
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT previa.id INTO v_previa_id
  FROM public.metas_proceso_partida AS previa
  WHERE previa.partida_id = v_meta.partida_id
    AND previa.secuencia < v_meta.secuencia
  ORDER BY previa.secuencia DESC
  LIMIT 1;

  -- La primera operación del ruteo no depende de piezas de otro proceso.
  IF v_previa_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(avance.cantidad_producida), 0)
  INTO v_hecho_previo
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_previa_id;

  -- C17: lo que la operación actual ya tomó del proceso previo. El respaldo
  -- por cantidad_producida conserva los registros anteriores a esta migración.
  SELECT coalesce(sum(
    CASE
      WHEN avance.cantidad_consumida > 0 THEN avance.cantidad_consumida
      ELSE avance.cantidad_producida
    END
  ), 0)
  INTO v_consumido_actual
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_meta.id;

  RETURN greatest(v_hecho_previo - v_consumido_actual, 0);
END;
$$;

COMMENT ON FUNCTION privado.piezas_disponibles_proceso(uuid) IS
  'C11/C17: piezas del proceso previo que la operación aún puede tomar; usa lo consumido por la operación y cae a lo producido en registros históricos.';

REVOKE ALL ON FUNCTION privado.piezas_disponibles_proceso(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Registrar el consumo de piezas de la sesión (idempotente).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_consumo_piezas_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_merma numeric,
  p_motivo text
)
RETURNS TABLE (
  id uuid,
  cantidad_consumida numeric,
  cantidad_scrap numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_previa_id uuid;
  v_producido_previo numeric;
  v_consumido_otras numeric;
  v_disponible numeric;
  v_avance public.registros_avance_partida%ROWTYPE;
  v_total numeric;
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL
     OR p_cantidad_usada IS NULL OR p_cantidad_merma IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_merma < 0
     OR p_cantidad_usada <> trunc(p_cantidad_usada)
     OR p_cantidad_merma <> trunc(p_cantidad_merma)
     OR p_cantidad_usada + p_cantidad_merma <= 0
     OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 200 THEN
    RAISE EXCEPTION 'consumo_piezas_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'finalizada' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- La operación realmente trabajada está en el avance de la sesión (el cierre
  -- permite elegir la meta incluso con una programación heredada). Si no hay
  -- avance, se conserva la meta de la programación.
  SELECT meta.* INTO v_meta
  FROM public.registros_avance_partida AS avance
  JOIN public.metas_proceso_partida AS meta
    ON meta.id = avance.meta_proceso_id
  WHERE avance.sesion_trabajo_id = p_sesion_id;

  IF NOT FOUND THEN
    SELECT meta.* INTO v_meta
    FROM public.programacion_areas AS programacion
    JOIN public.metas_proceso_partida AS meta
      ON meta.id = programacion.meta_proceso_id
    WHERE programacion.id = v_sesion.programacion_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proceso_sin_piezas_previas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT previa.id INTO v_previa_id
  FROM public.metas_proceso_partida AS previa
  WHERE previa.partida_id = v_meta.partida_id
    AND previa.secuencia < v_meta.secuencia
  ORDER BY previa.secuencia DESC
  LIMIT 1;

  IF v_previa_id IS NULL THEN
    RAISE EXCEPTION 'proceso_sin_piezas_previas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(avance.cantidad_producida), 0)
  INTO v_producido_previo
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_previa_id;

  -- Lo consumido por otras sesiones de la misma operación; se excluye esta
  -- sesión para que reintentar el registro no descuente dos veces.
  SELECT coalesce(sum(
    CASE
      WHEN avance.cantidad_consumida > 0 THEN avance.cantidad_consumida
      ELSE avance.cantidad_producida
    END
  ), 0)
  INTO v_consumido_otras
  FROM public.registros_avance_partida AS avance
  WHERE avance.meta_proceso_id = v_meta.id
    AND avance.sesion_trabajo_id IS DISTINCT FROM p_sesion_id;

  v_disponible := greatest(v_producido_previo - v_consumido_otras, 0);
  v_total := p_cantidad_usada + p_cantidad_merma;

  IF v_total > v_disponible THEN
    RAISE EXCEPTION 'cantidad_excede_disponible_proceso' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cantidad_usada < v_sesion.piezas_producidas THEN
    RAISE EXCEPTION 'consumo_piezas_menor_produccion' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_avance
  FROM public.registros_avance_partida AS avance
  WHERE avance.sesion_trabajo_id = p_sesion_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.registros_avance_partida AS avance
    SET cantidad_consumida = v_total,
        cantidad_scrap = p_cantidad_merma,
        motivo_consumo_piezas = v_motivo
    WHERE avance.id = v_avance.id;
  ELSE
    IF p_cantidad_usada > 0 AND v_sesion.piezas_producidas = 0 THEN
      RAISE EXCEPTION 'consumo_piezas_menor_produccion' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.registros_avance_partida (
      partida_id, operador_id, cantidad_producida, cantidad_scrap,
      sesion_trabajo_id, meta_proceso_id, cantidad_consumida, motivo_consumo_piezas
    ) VALUES (
      v_sesion.partida_id, p_operador_id, 0, p_cantidad_merma,
      p_sesion_id, v_meta.id, v_total, v_motivo
    );
  END IF;

  RETURN QUERY
  SELECT avance.id, avance.cantidad_consumida, avance.cantidad_scrap
  FROM public.registros_avance_partida AS avance
  WHERE avance.sesion_trabajo_id = p_sesion_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_consumo_piezas_operador(uuid, uuid, numeric, numeric, text) IS
  'C17: registra (idempotente) las piezas del proceso previo consumidas por una sesión finalizada y su merma. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_consumo_piezas_operador(uuid, uuid, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_piezas_operador(uuid, uuid, numeric, numeric, text)
  TO service_role;
