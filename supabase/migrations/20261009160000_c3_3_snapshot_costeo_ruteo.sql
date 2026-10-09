-- =============================================================================
-- C3.3 — Snapshot y desglose del costeo de ruteo (DC-07, CONTRATOS-CORTE-0 §5.2)
--
--   * Cada renglón de `propuesta_item_ruteo` congela al costear: recurso
--     opcional, tarifa por hora, moneda, fuente (GRUPO/RECURSO), costo de
--     preparación, de operación, total y fecha. Preparación y operación usan
--     la misma tarifa (MVP). Cambiar la tarifa maestra no altera renglones ya
--     costeados; editar el ruteo reinserta renglones y obliga a recostear.
--   * `public.costear_ruteo_revision` costea todos los renglones de los ítems
--     activos de una revisión DRAFT en una sola operación. Sin tarifa o con
--     tarifa en otra moneda que la propuesta, falla completa con un código
--     estable (no convierte moneda en silencio ni calcula con cero).
--   * Sin doble conteo: el ruteo costeado es el costo de categoría `maquina`;
--     cuando la revisión tiene ruteo costeado, el costo manual `maquina` deja
--     de sumarse en `calcular_totales_revision` (los demás manuales sí).
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.propuesta_item_ruteo
  ADD COLUMN IF NOT EXISTS recurso_id uuid REFERENCES public.recursos_planeacion (id),
  ADD COLUMN IF NOT EXISTS tarifa_hora numeric(12,4),
  ADD COLUMN IF NOT EXISTS tarifa_moneda text,
  ADD COLUMN IF NOT EXISTS tarifa_fuente text,
  ADD COLUMN IF NOT EXISTS costo_setup numeric(14,4),
  ADD COLUMN IF NOT EXISTS costo_run numeric(14,4),
  ADD COLUMN IF NOT EXISTS costo_total numeric(14,4),
  ADD COLUMN IF NOT EXISTS costeado_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'propuesta_item_ruteo_snapshot_costeo') THEN
    ALTER TABLE public.propuesta_item_ruteo
      ADD CONSTRAINT propuesta_item_ruteo_snapshot_costeo CHECK (
        (costeado_en IS NULL AND tarifa_hora IS NULL AND costo_total IS NULL)
        OR (
          costeado_en IS NOT NULL
          AND tarifa_hora >= 0
          AND tarifa_moneda IN ('MXN', 'USD')
          AND tarifa_fuente IN ('GRUPO', 'RECURSO')
          AND costo_setup >= 0 AND costo_run >= 0
          AND costo_total = costo_setup + costo_run
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.propuesta_item_ruteo.costeado_en IS
  'C3.3/DC-07: momento del snapshot de costeo; NULL = renglón sin costear. La tarifa congelada no cambia si cambia el maestro.';

-- -----------------------------------------------------------------------------
-- Costear el ruteo de una revisión DRAFT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.costear_ruteo_revision(
  p_revision_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_moneda text;
  v_fila record;
  v_tarifa jsonb;
  v_valor numeric;
  v_renglones integer := 0;
  v_total numeric := 0;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'propuesta_editar_costo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514';
  END IF;
  v_moneda := COALESCE(v_revision.snapshot_cabecera->>'moneda', 'MXN');

  FOR v_fila IN
    SELECT rt.id, rt.grupo_equipo_id, rt.recurso_id, rt.setup_horas, rt.run_horas
    FROM public.propuesta_item_ruteo AS rt
    JOIN public.propuesta_items AS i ON i.id = rt.item_id
    WHERE i.revision_id = p_revision_id AND i.activo
    ORDER BY i.codigo, rt.secuencia
    FOR UPDATE OF rt
  LOOP
    -- Sin tarifa resoluble falla todo el costeo con el código del resolvedor.
    v_tarifa := public.resolver_tarifa_hora(v_fila.grupo_equipo_id, v_fila.recurso_id);
    IF v_tarifa->>'moneda' <> v_moneda THEN
      RAISE EXCEPTION 'tarifa_moneda_distinta' USING ERRCODE = '23514',
        DETAIL = jsonb_build_object('tarifa', v_tarifa->>'moneda', 'propuesta', v_moneda)::text;
    END IF;
    v_valor := (v_tarifa->>'tarifa')::numeric;

    UPDATE public.propuesta_item_ruteo AS rt
    SET tarifa_hora = v_valor,
        tarifa_moneda = v_tarifa->>'moneda',
        tarifa_fuente = v_tarifa->>'fuente',
        costo_setup = round(rt.setup_horas * v_valor, 4),
        costo_run = round(rt.run_horas * v_valor, 4),
        costo_total = round(rt.setup_horas * v_valor, 4) + round(rt.run_horas * v_valor, 4),
        costeado_en = now()
    WHERE rt.id = v_fila.id;

    v_renglones := v_renglones + 1;
    v_total := v_total + round(v_fila.setup_horas * v_valor, 4) + round(v_fila.run_horas * v_valor, 4);
  END LOOP;

  IF v_renglones = 0 THEN
    RAISE EXCEPTION 'ruteo_vacio' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
  ) VALUES (
    p_revision_id, 'DRAFT', 'DRAFT', 'costear_ruteo', p_actor_id, p_correlation_id
  );

  RETURN jsonb_build_object('renglones', v_renglones, 'costoRuteo', round(v_total, 4), 'moneda', v_moneda);
END;
$$;

COMMENT ON FUNCTION public.costear_ruteo_revision(uuid, uuid, uuid) IS
  'C3.3/DC-07: congela tarifa, fuente y costos de cada renglón de ruteo de una revisión DRAFT. Sin tarifa o con moneda distinta falla completa. Solo service_role.';

REVOKE ALL ON FUNCTION public.costear_ruteo_revision(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.costear_ruteo_revision(uuid, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Totales sin doble conteo (espejo TS `calcularTotalesPropuesta`)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_totales_revision(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_iva_porcentaje numeric;
  v_bruto numeric := 0;
  v_descuento numeric := 0;
  v_subtotal numeric;
  v_iva numeric;
  v_total numeric;
  v_costo_manual numeric := 0;
  v_costo_ruteo numeric := 0;
  v_ruteo_costeado boolean;
  v_costo numeric;
  v_margen numeric;
BEGIN
  SELECT * INTO v_revision FROM public.propuesta_revisiones WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  v_iva_porcentaje := COALESCE((v_revision.snapshot_cabecera->>'iva_porcentaje')::numeric, 16);

  SELECT
    COALESCE(sum(i.cantidad * i.precio_unitario) FILTER (WHERE NOT i.es_descuento), 0),
    COALESCE(sum(i.cantidad * i.precio_unitario) FILTER (WHERE i.es_descuento), 0)
  INTO v_bruto, v_descuento
  FROM public.propuesta_items AS i
  WHERE i.revision_id = p_revision_id AND i.activo;

  v_subtotal := round(v_bruto - v_descuento, 2);
  v_iva := round(v_subtotal * v_iva_porcentaje / 100, 2);
  v_total := round(v_subtotal + v_iva, 2);

  SELECT count(*) > 0, COALESCE(sum(rt.costo_total), 0)
  INTO v_ruteo_costeado, v_costo_ruteo
  FROM public.propuesta_item_ruteo AS rt
  JOIN public.propuesta_items AS i ON i.id = rt.item_id
  WHERE i.revision_id = p_revision_id AND i.activo AND rt.costeado_en IS NOT NULL;

  -- Con ruteo costeado, el costo de máquina sale del ruteo: el manual
  -- `maquina` no se suma (evita doble conteo).
  SELECT COALESCE(sum(c.monto), 0) INTO v_costo_manual
  FROM public.propuesta_revision_costos AS c
  WHERE c.revision_id = p_revision_id
    AND (NOT v_ruteo_costeado OR c.categoria <> 'maquina');

  v_costo := v_costo_manual + v_costo_ruteo;
  v_margen := CASE
    WHEN v_subtotal = 0 THEN NULL
    ELSE round((v_subtotal - v_costo) / v_subtotal, 4)
  END;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'moneda', COALESCE(v_revision.snapshot_cabecera->>'moneda', 'MXN'),
    'bruto', round(v_bruto, 2),
    'descuento', round(v_descuento, 2),
    'subtotal', v_subtotal,
    'ivaPorcentaje', v_iva_porcentaje,
    'iva', v_iva,
    'total', v_total,
    'costoManual', round(v_costo_manual, 4),
    'costoRuteo', round(v_costo_ruteo, 4),
    'costoTotal', round(v_costo, 4),
    'margen', v_margen
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_totales_revision(uuid) IS
  'SII-B4.5 + C3.3: subtotal, IVA, total, costo (manual + ruteo costeado, sin sumar el manual `maquina` cuando hay ruteo costeado) y margen (null si subtotal 0). Solo service_role.';

REVOKE ALL ON FUNCTION public.calcular_totales_revision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_totales_revision(uuid) TO service_role;
