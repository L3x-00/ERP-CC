-- C6.1 / DC-13 y DC-14 — maestro canónico e historial de costos.
--
-- `catalogo_materiales` continúa siendo el catálogo comercial y pasa a ser la
-- fuente canónica para consumos nuevos. El inventario anterior se enlaza por
-- código cuando es inequívoco, pero sus costos y existencias no se reescriben.

ALTER TABLE public.catalogo_materiales
  ADD COLUMN IF NOT EXISTS unidad_base text NOT NULL DEFAULT 'pieza',
  ADD COLUMN IF NOT EXISTS moneda_costo text NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS costo_vigente numeric(14, 4),
  ADD COLUMN IF NOT EXISTS fecha_vigencia_costo date,
  ADD COLUMN IF NOT EXISTS costo_confirmado_en timestamptz,
  ADD COLUMN IF NOT EXISTS costo_confirmado_por uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS material_legacy_id uuid UNIQUE REFERENCES public.materiales (id);

UPDATE public.catalogo_materiales AS catalogo
SET material_legacy_id = legado.id,
    unidad_base = legado.unidad_control
FROM public.materiales AS legado
WHERE catalogo.material_legacy_id IS NULL
  AND upper(btrim(catalogo.codigo)) = upper(btrim(legado.codigo));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_materiales_unidad_base_valida'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_unidad_base_valida
      CHECK (unidad_base = btrim(unidad_base) AND char_length(unidad_base) BETWEEN 1 AND 30);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_materiales_moneda_costo_valida'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_moneda_costo_valida
      CHECK (moneda_costo IN ('MXN', 'USD'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_materiales_costo_vigente_valido'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_costo_vigente_valido
      CHECK (
        costo_vigente IS NULL
        OR (
          costo_vigente >= 0
          AND costo_vigente NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_materiales_confirmacion_costo_completa'
  ) THEN
    ALTER TABLE public.catalogo_materiales
      ADD CONSTRAINT catalogo_materiales_confirmacion_costo_completa
      CHECK (
        (costo_vigente IS NULL AND fecha_vigencia_costo IS NULL
          AND costo_confirmado_en IS NULL AND costo_confirmado_por IS NULL)
        OR
        (costo_vigente IS NOT NULL AND fecha_vigencia_costo IS NOT NULL
          AND costo_confirmado_en IS NOT NULL AND costo_confirmado_por IS NOT NULL)
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.catalogo_materiales.unidad_base IS
  'C6: unidad configurable en la que se cotiza y consume el material.';
COMMENT ON COLUMN public.catalogo_materiales.costo_vigente IS
  'Último costo unitario confirmado; NULL significa pendiente de configurar.';
COMMENT ON COLUMN public.catalogo_materiales.material_legacy_id IS
  'Vínculo opcional, por código exacto, al inventario histórico de solo lectura.';

CREATE TABLE IF NOT EXISTS public.propuestas_costo_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  costo_propuesto numeric(14, 4) NOT NULL,
  moneda text NOT NULL,
  fecha_efectiva date NOT NULL,
  fuente text NOT NULL,
  referencia text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  propuesto_por uuid NOT NULL REFERENCES public.usuarios (id),
  propuesto_en timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid REFERENCES public.usuarios (id),
  confirmado_en timestamptz,
  CONSTRAINT propuestas_costo_valor_valido CHECK (
    costo_propuesto >= 0
    AND costo_propuesto NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT propuestas_costo_moneda_valida CHECK (moneda IN ('MXN', 'USD')),
  CONSTRAINT propuestas_costo_fuente_valida CHECK (fuente IN ('COMPRA', 'GASTO')),
  CONSTRAINT propuestas_costo_referencia_valida CHECK (
    referencia = btrim(referencia) AND char_length(referencia) BETWEEN 2 AND 120
  ),
  CONSTRAINT propuestas_costo_estado_valido CHECK (estado IN ('PENDIENTE', 'CONFIRMADA')),
  CONSTRAINT propuestas_costo_confirmacion_coherente CHECK (
    (estado = 'PENDIENTE' AND confirmado_por IS NULL AND confirmado_en IS NULL)
    OR (estado = 'CONFIRMADA' AND confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_propuestas_costo_material_pendientes
  ON public.propuestas_costo_material (material_id, propuesto_en DESC)
  WHERE estado = 'PENDIENTE';

CREATE TABLE IF NOT EXISTS public.historial_costos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  costo_anterior numeric(14, 4),
  moneda_anterior text,
  costo_nuevo numeric(14, 4) NOT NULL,
  moneda_nueva text NOT NULL,
  fecha_efectiva date NOT NULL,
  fuente text NOT NULL,
  referencia text,
  propuesta_id uuid REFERENCES public.propuestas_costo_material (id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.usuarios (id),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historial_costos_anterior_valido CHECK (
    (costo_anterior IS NULL AND moneda_anterior IS NULL)
    OR (costo_anterior IS NOT NULL AND costo_anterior >= 0 AND moneda_anterior IN ('MXN', 'USD'))
  ),
  CONSTRAINT historial_costos_nuevo_valido CHECK (
    costo_nuevo >= 0 AND moneda_nueva IN ('MXN', 'USD')
  ),
  CONSTRAINT historial_costos_fuente_valida CHECK (fuente IN ('MANUAL', 'COMPRA', 'GASTO')),
  CONSTRAINT historial_costos_propuesta_coherente CHECK (
    (fuente = 'MANUAL' AND propuesta_id IS NULL)
    OR (fuente IN ('COMPRA', 'GASTO') AND propuesta_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_historial_costos_material_fecha
  ON public.historial_costos_material (material_id, confirmado_en DESC);

COMMENT ON TABLE public.propuestas_costo_material IS
  'C6: Compra/Gasto propone un costo; no modifica el maestro hasta confirmación autorizada.';
COMMENT ON TABLE public.historial_costos_material IS
  'C6: bitácora append-only de cada costo confirmado, con valor anterior/nuevo, fuente y actor.';

CREATE OR REPLACE FUNCTION privado.proteger_costo_material_c6()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.costo_vigente IS DISTINCT FROM NEW.costo_vigente
     OR OLD.moneda_costo IS DISTINCT FROM NEW.moneda_costo
     OR OLD.fecha_vigencia_costo IS DISTINCT FROM NEW.fecha_vigencia_costo
     OR OLD.costo_confirmado_en IS DISTINCT FROM NEW.costo_confirmado_en
     OR OLD.costo_confirmado_por IS DISTINCT FROM NEW.costo_confirmado_por THEN
    IF current_setting('sii.c6_confirmar_costo', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'costo_requiere_confirmacion' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.proteger_costo_material_c6() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_catalogo_materiales_proteger_costo_c6 ON public.catalogo_materiales;
CREATE TRIGGER trigger_catalogo_materiales_proteger_costo_c6
  BEFORE UPDATE ON public.catalogo_materiales
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_costo_material_c6();

CREATE OR REPLACE FUNCTION privado.impedir_cambio_historial_costos_c6()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'historial_costos_append_only' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION privado.impedir_cambio_historial_costos_c6() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_historial_costos_append_only_filas ON public.historial_costos_material;
CREATE TRIGGER trigger_historial_costos_append_only_filas
  BEFORE UPDATE OR DELETE ON public.historial_costos_material
  FOR EACH ROW EXECUTE FUNCTION privado.impedir_cambio_historial_costos_c6();
DROP TRIGGER IF EXISTS trigger_historial_costos_append_only_truncate ON public.historial_costos_material;
CREATE TRIGGER trigger_historial_costos_append_only_truncate
  BEFORE TRUNCATE ON public.historial_costos_material
  FOR EACH STATEMENT EXECUTE FUNCTION privado.impedir_cambio_historial_costos_c6();

CREATE OR REPLACE FUNCTION public.proponer_costo_material(
  p_material_id uuid,
  p_costo numeric,
  p_moneda text,
  p_fecha_efectiva date,
  p_fuente text,
  p_referencia text,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_fuente text := upper(btrim(coalesce(p_fuente, '')));
  v_referencia text := btrim(coalesce(p_referencia, ''));
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;
  IF p_costo IS NULL OR p_costo < 0
     OR p_costo IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_moneda NOT IN ('MXN', 'USD') OR v_fuente NOT IN ('COMPRA', 'GASTO')
     OR p_fecha_efectiva IS NULL OR char_length(v_referencia) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'propuesta_costo_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.catalogo_materiales
  WHERE id = p_material_id AND activo = true FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente_o_inactivo' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.propuestas_costo_material (
    material_id, costo_propuesto, moneda, fecha_efectiva, fuente,
    referencia, propuesto_por
  ) VALUES (
    p_material_id, round(p_costo, 4), v_moneda, p_fecha_efectiva, v_fuente,
    v_referencia, p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_costo_material(
  p_material_id uuid,
  p_costo numeric,
  p_moneda text,
  p_fecha_efectiva date,
  p_fuente text,
  p_referencia text,
  p_actor_id uuid,
  p_actualizado_en timestamptz,
  p_propuesta_id uuid DEFAULT NULL
)
RETURNS TABLE (material_id uuid, costo_vigente numeric, moneda_costo text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_material public.catalogo_materiales%ROWTYPE;
  v_propuesta public.propuestas_costo_material%ROWTYPE;
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_fuente text := upper(btrim(coalesce(p_fuente, '')));
  v_referencia text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_confirmado_en timestamptz := clock_timestamp();
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;
  IF p_costo IS NULL OR p_costo < 0
     OR p_costo IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR v_moneda NOT IN ('MXN', 'USD') OR v_fuente NOT IN ('MANUAL', 'COMPRA', 'GASTO')
     OR p_fecha_efectiva IS NULL OR p_actualizado_en IS NULL THEN
    RAISE EXCEPTION 'confirmacion_costo_invalida' USING ERRCODE = '22023';
  END IF;
  IF (v_fuente = 'MANUAL' AND p_propuesta_id IS NOT NULL)
     OR (v_fuente IN ('COMPRA', 'GASTO') AND p_propuesta_id IS NULL) THEN
    RAISE EXCEPTION 'propuesta_costo_requerida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_material
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_material.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'material_desactualizado' USING ERRCODE = '40001';
  END IF;

  IF p_propuesta_id IS NOT NULL THEN
    SELECT * INTO v_propuesta
    FROM public.propuestas_costo_material AS propuesta
    WHERE propuesta.id = p_propuesta_id
    FOR UPDATE;
    IF NOT FOUND OR v_propuesta.estado <> 'PENDIENTE'
       OR v_propuesta.material_id <> p_material_id
       OR v_propuesta.costo_propuesto <> round(p_costo, 4)
       OR v_propuesta.moneda <> v_moneda
       OR v_propuesta.fecha_efectiva <> p_fecha_efectiva
       OR v_propuesta.fuente <> v_fuente
       OR v_propuesta.referencia <> v_referencia THEN
      RAISE EXCEPTION 'propuesta_costo_no_coincide' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('sii.c6_confirmar_costo', 'on', true);
  UPDATE public.catalogo_materiales AS material
  SET costo_vigente = round(p_costo, 4),
      moneda_costo = v_moneda,
      fecha_vigencia_costo = p_fecha_efectiva,
      costo_confirmado_en = v_confirmado_en,
      costo_confirmado_por = p_actor_id
  WHERE material.id = p_material_id;
  PERFORM set_config('sii.c6_confirmar_costo', 'off', true);

  INSERT INTO public.historial_costos_material (
    material_id, costo_anterior, moneda_anterior, costo_nuevo, moneda_nueva,
    fecha_efectiva, fuente, referencia, propuesta_id, actor_id, confirmado_en
  ) VALUES (
    p_material_id, v_material.costo_vigente,
    CASE WHEN v_material.costo_vigente IS NULL THEN NULL ELSE v_material.moneda_costo END,
    round(p_costo, 4), v_moneda, p_fecha_efectiva, v_fuente, v_referencia,
    p_propuesta_id, p_actor_id, v_confirmado_en
  );

  IF p_propuesta_id IS NOT NULL THEN
    UPDATE public.propuestas_costo_material
    SET estado = 'CONFIRMADA', confirmado_por = p_actor_id, confirmado_en = v_confirmado_en
    WHERE id = p_propuesta_id;
  END IF;

  RETURN QUERY
  SELECT material.id, material.costo_vigente, material.moneda_costo, material.actualizado_en
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id;
END;
$$;

ALTER TABLE public.propuestas_costo_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_costos_material ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.propuestas_costo_material FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.historial_costos_material FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.propuestas_costo_material TO authenticated;
GRANT SELECT ON TABLE public.historial_costos_material TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.propuestas_costo_material TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.historial_costos_material TO service_role;

CREATE POLICY propuestas_costo_materiales_leer_c6
  ON public.propuestas_costo_material FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );
CREATE POLICY historial_costos_materiales_leer_c6
  ON public.historial_costos_material FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

-- El catálogo general conserva solo columnas no financieras para authenticated.
REVOKE SELECT ON TABLE public.catalogo_materiales FROM authenticated;
GRANT SELECT (
  id, codigo, nombre, activo, orden, metadata, creado_en, actualizado_en, unidad_base
) ON public.catalogo_materiales TO authenticated;

REVOKE EXECUTE ON FUNCTION public.proponer_costo_material(uuid, numeric, text, date, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proponer_costo_material(uuid, numeric, text, date, text, text, uuid)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirmar_costo_material(uuid, numeric, text, date, text, text, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_costo_material(uuid, numeric, text, date, text, text, uuid, timestamptz, uuid)
  TO service_role;
