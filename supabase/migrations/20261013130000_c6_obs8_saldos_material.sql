-- =============================================================================
-- Obs. cliente 2026-10-13 (8) — Existencias: saldo manual con historial
-- Refinamiento de DC-12/ADR-0015 (registrado en DECISIONES-ACEPTADAS.md).
--
--   * `saldos_material`: saldo manual por material + espesor opcional.
--   * `movimientos_saldo_material`: bitácora append-only de cada ajuste
--     (anterior/nuevo, motivo, actor).
--   * RPC atómica `ajustar_saldo_material` (permiso `gestionar_inventario`,
--     revalidado en SQL con el actor): fija el saldo nuevo y registra el
--     movimiento. El consumo NO descuenta: el saldo solo cambia por ajuste
--     manual auditado.
--
-- Aditiva e idempotente; sin tocar el inventario legado (`materiales`,
-- `movimientos_inventario`), que permanece oculto e intacto.
-- Aplicar SOLO local hasta autorización.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saldos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  espesor_id uuid REFERENCES public.catalogo_espesores (id) ON DELETE RESTRICT,
  saldo numeric(16, 4) NOT NULL DEFAULT 0,
  actualizado_por uuid NOT NULL REFERENCES public.usuarios (id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saldos_material_saldo_valido CHECK (
    saldo >= 0
    AND saldo NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  )
);

-- Un saldo por (material, espesor); dos índices parciales porque NULL no
-- colisiona consigo mismo en un UNIQUE ordinario.
CREATE UNIQUE INDEX IF NOT EXISTS ux_saldos_material_sin_espesor
  ON public.saldos_material (material_id)
  WHERE espesor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_saldos_material_con_espesor
  ON public.saldos_material (material_id, espesor_id)
  WHERE espesor_id IS NOT NULL;

COMMENT ON TABLE public.saldos_material IS
  'Obs. 8: saldo manual (existencia) por material y espesor opcional; solo cambia por ajuste auditado.';

CREATE TABLE IF NOT EXISTS public.movimientos_saldo_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  espesor_id uuid REFERENCES public.catalogo_espesores (id) ON DELETE RESTRICT,
  saldo_anterior numeric(16, 4) NOT NULL,
  saldo_nuevo numeric(16, 4) NOT NULL,
  motivo text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_saldo_valores_validos CHECK (
    saldo_anterior >= 0 AND saldo_nuevo >= 0
    AND saldo_anterior NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND saldo_nuevo NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT movimientos_saldo_motivo_valido CHECK (
    motivo = btrim(motivo) AND char_length(motivo) BETWEEN 3 AND 300
  )
);

CREATE INDEX IF NOT EXISTS idx_movimientos_saldo_material
  ON public.movimientos_saldo_material (material_id, creado_en DESC);

COMMENT ON TABLE public.movimientos_saldo_material IS
  'Obs. 8: bitácora append-only de ajustes de saldo, con valor anterior/nuevo, motivo y actor.';

-- Historial inmutable (mismo patrón que historial_costos_material).
CREATE OR REPLACE FUNCTION privado.impedir_cambio_movimientos_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'historial_saldos_append_only' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION privado.impedir_cambio_movimientos_saldo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_movimientos_saldo_append_only_filas ON public.movimientos_saldo_material;
CREATE TRIGGER trigger_movimientos_saldo_append_only_filas
  BEFORE UPDATE OR DELETE ON public.movimientos_saldo_material
  FOR EACH ROW EXECUTE FUNCTION privado.impedir_cambio_movimientos_saldo();
DROP TRIGGER IF EXISTS trigger_movimientos_saldo_append_only_truncate ON public.movimientos_saldo_material;
CREATE TRIGGER trigger_movimientos_saldo_append_only_truncate
  BEFORE TRUNCATE ON public.movimientos_saldo_material
  FOR EACH STATEMENT EXECUTE FUNCTION privado.impedir_cambio_movimientos_saldo();

-- -----------------------------------------------------------------------------
-- RPC atómica: fija el saldo y registra el movimiento en una sola operación.
-- Orden de locks: advisory por (material, espesor) → fila de saldo. Nunca al
-- revés, para no cruzar bloqueos entre ajustes concurrentes del mismo insumo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_saldo_material(
  p_actor_id uuid,
  p_material_id uuid,
  p_espesor_id uuid,
  p_nuevo_saldo numeric,
  p_motivo text
)
RETURNS TABLE (
  material_id uuid,
  espesor_id uuid,
  saldo_anterior numeric,
  saldo_nuevo numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anterior numeric := 0;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_ahora timestamptz := clock_timestamp();
  v_saldo_redondeado numeric;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;
  IF p_nuevo_saldo IS NULL OR p_nuevo_saldo < 0
     OR p_nuevo_saldo IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR char_length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'ajuste_saldo_invalido' USING ERRCODE = '22023';
  END IF;
  v_saldo_redondeado := round(p_nuevo_saldo, 4);

  PERFORM 1 FROM public.catalogo_materiales AS m
  WHERE m.id = p_material_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF p_espesor_id IS NOT NULL THEN
    PERFORM 1 FROM public.catalogo_espesores AS e
    WHERE e.id = p_espesor_id AND e.material_id = p_material_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'espesor_no_pertenece_al_material' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Serializa por insumo: dos ajustes simultáneos no pierden el anterior ni
  -- duplican la fila de saldo.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_material_id::text || ':' || coalesce(p_espesor_id::text, ''), 0)
  );

  SELECT s.saldo INTO v_anterior
  FROM public.saldos_material AS s
  WHERE s.material_id = p_material_id
    AND s.espesor_id IS NOT DISTINCT FROM p_espesor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_anterior := 0;
    INSERT INTO public.saldos_material (
      material_id, espesor_id, saldo, actualizado_por, actualizado_en
    ) VALUES (
      p_material_id, p_espesor_id, v_saldo_redondeado, p_actor_id, v_ahora
    );
  ELSE
    UPDATE public.saldos_material AS s
    SET saldo = v_saldo_redondeado, actualizado_por = p_actor_id, actualizado_en = v_ahora
    WHERE s.material_id = p_material_id
      AND s.espesor_id IS NOT DISTINCT FROM p_espesor_id;
  END IF;

  INSERT INTO public.movimientos_saldo_material (
    material_id, espesor_id, saldo_anterior, saldo_nuevo, motivo, actor_id, creado_en
  ) VALUES (
    p_material_id, p_espesor_id, v_anterior, v_saldo_redondeado, v_motivo, p_actor_id, v_ahora
  );

  RETURN QUERY
  SELECT p_material_id, p_espesor_id, v_anterior, v_saldo_redondeado, v_ahora;
END;
$$;

COMMENT ON FUNCTION public.ajustar_saldo_material(uuid, uuid, uuid, numeric, text) IS
  'Obs. 8: fija el saldo manual (material + espesor opcional) y registra el movimiento; solo service_role con actor autorizado.';

-- -----------------------------------------------------------------------------
-- Privilegios y RLS (espejo de las tablas de costo C6.1)
-- -----------------------------------------------------------------------------
ALTER TABLE public.saldos_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_saldo_material ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.saldos_material FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.movimientos_saldo_material FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.saldos_material TO authenticated;
GRANT SELECT ON TABLE public.movimientos_saldo_material TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.saldos_material TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.movimientos_saldo_material TO service_role;

DROP POLICY IF EXISTS saldos_material_leer_obs8 ON public.saldos_material;
CREATE POLICY saldos_material_leer_obs8
  ON public.saldos_material FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

DROP POLICY IF EXISTS movimientos_saldo_material_leer_obs8 ON public.movimientos_saldo_material;
CREATE POLICY movimientos_saldo_material_leer_obs8
  ON public.movimientos_saldo_material FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

REVOKE ALL ON FUNCTION public.ajustar_saldo_material(uuid, uuid, uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_saldo_material(uuid, uuid, uuid, numeric, text)
  TO service_role;
