-- =============================================================================
-- B7 (corrección de auditoría) — Fecha de entrega editable con CAS
-- Plan: docs/plan-erp-sii/07-entregas.md §7.1 regla 4.
--
-- Defecto: `fecha_entrega` se capturaba al generar la nota y no había forma de
-- corregirla. Se agrega `actualizado_en` (token CAS), se ajusta el CHECK a
-- granularidad de día (la fecha de entrega es un día, no un instante) y la RPC
-- `actualizar_fecha_entrega`: permiso `entrega_generar`, CAS, no anterior al
-- día de generación y no posterior a hoy (UTC).
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007230006).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Token CAS y validación por día
-- -----------------------------------------------------------------------------
ALTER TABLE public.notas_entrega
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.notas_entrega.actualizado_en IS
  'B7: token de versión para ediciones con compare-and-set (fecha de entrega).';

DROP TRIGGER IF EXISTS trigger_notas_entrega_actualizado_en ON public.notas_entrega;
CREATE TRIGGER trigger_notas_entrega_actualizado_en
  BEFORE UPDATE ON public.notas_entrega
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

ALTER TABLE public.notas_entrega DROP CONSTRAINT IF EXISTS notas_entrega_fecha_entrega_valida;
ALTER TABLE public.notas_entrega
  ADD CONSTRAINT notas_entrega_fecha_entrega_valida
  CHECK (fecha_entrega::date >= creado_en::date);

-- -----------------------------------------------------------------------------
-- 2. RPC: corregir la fecha de entrega (CAS + permiso + rango de días)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_fecha_entrega(
  p_nota_id uuid,
  p_fecha_entrega timestamptz,
  p_actualizado_en_esperado timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, fecha_entrega timestamptz, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nota public.notas_entrega%ROWTYPE;
  v_hoy_utc date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_nota_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'datos_fecha_entrega_invalidos' USING ERRCODE = '23514';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'entrega_generar') THEN
    RAISE EXCEPTION 'sin_permiso_entrega' USING ERRCODE = '42501';
  END IF;
  IF p_fecha_entrega IS NULL OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'datos_fecha_entrega_invalidos' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_nota
  FROM public.notas_entrega AS nota
  WHERE nota.id = p_nota_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_nota.actualizado_en IS DISTINCT FROM p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'entrega_desactualizada' USING ERRCODE = '23514';
  END IF;
  IF p_fecha_entrega::date < v_nota.creado_en::date THEN
    RAISE EXCEPTION 'fecha_entrega_invalida' USING ERRCODE = '23514';
  END IF;
  IF p_fecha_entrega::date > v_hoy_utc THEN
    RAISE EXCEPTION 'fecha_entrega_futura' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  UPDATE public.notas_entrega AS nota
  SET fecha_entrega = p_fecha_entrega
  WHERE nota.id = p_nota_id
  RETURNING nota.id, nota.fecha_entrega, nota.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid) IS
  'B7: corrige la fecha de entrega con CAS y permiso entrega_generar; no anterior al día de generación ni posterior a hoy (UTC). Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid)
  TO service_role;
