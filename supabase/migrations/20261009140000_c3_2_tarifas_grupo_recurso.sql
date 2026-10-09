-- =============================================================================
-- C3.2 — Tarifa estándar por Grupo de Equipo y override por recurso
-- (DC-07, CONTRATOS-CORTE-0 §5.1)
--
--   * `grupos_equipo` incorpora tarifa por hora (NULL = sin configurar, nunca
--     cero implícito) y moneda de costeo MXN/USD. Se versiona con el mecanismo
--     existente de catálogos (`versiones_catalogo` guarda la fila completa).
--   * `recursos_planeacion` incorpora un override explícito: indicador +
--     tarifa + moneda. Inactivo = usa el Grupo; activo exige tarifa >= 0. El
--     cero solo cuenta como override si el indicador está activo. No se toca
--     `costo_hora_interno`, que consumen Rentabilidad y los estimados.
--   * `public.resolver_tarifa_hora` devuelve tarifa, moneda y fuente
--     (GRUPO/RECURSO) o falla con un código estable que identifica qué
--     configurar. Preparación y operación usan la misma tarifa (MVP).
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.grupos_equipo
  ADD COLUMN IF NOT EXISTS tarifa_hora numeric(12,4),
  ADD COLUMN IF NOT EXISTS tarifa_moneda text NOT NULL DEFAULT 'MXN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grupos_equipo_tarifa_valida') THEN
    ALTER TABLE public.grupos_equipo
      ADD CONSTRAINT grupos_equipo_tarifa_valida CHECK (tarifa_hora IS NULL OR tarifa_hora >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grupos_equipo_tarifa_moneda_valida') THEN
    ALTER TABLE public.grupos_equipo
      ADD CONSTRAINT grupos_equipo_tarifa_moneda_valida CHECK (tarifa_moneda IN ('MXN', 'USD'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.grupos_equipo.tarifa_hora IS
  'C3.2/DC-07: tarifa estándar por hora (preparación + operación). NULL = sin configurar: el costeo se bloquea.';
COMMENT ON COLUMN public.grupos_equipo.tarifa_moneda IS
  'C3.2/DC-07: moneda de costeo de la tarifa estándar (MXN o USD).';

ALTER TABLE public.recursos_planeacion
  ADD COLUMN IF NOT EXISTS tarifa_override_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tarifa_override_hora numeric(12,4),
  ADD COLUMN IF NOT EXISTS tarifa_override_moneda text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recursos_planeacion_override_tarifa_valido') THEN
    ALTER TABLE public.recursos_planeacion
      ADD CONSTRAINT recursos_planeacion_override_tarifa_valido CHECK (
        (NOT tarifa_override_activa AND tarifa_override_hora IS NULL AND tarifa_override_moneda IS NULL)
        OR (
          tarifa_override_activa
          AND tarifa_override_hora IS NOT NULL
          AND tarifa_override_hora >= 0
          AND tarifa_override_moneda IN ('MXN', 'USD')
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.recursos_planeacion.tarifa_override_activa IS
  'C3.2/DC-07: true = el recurso usa su propia tarifa; false = usa la del Grupo de Equipo. Distingue "sin override" de un override igual a cero.';

-- -----------------------------------------------------------------------------
-- Resolución de tarifa (consumidor: costeo de ruteo C3.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_tarifa_hora(
  p_grupo_equipo_id uuid,
  p_recurso_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recurso public.recursos_planeacion%ROWTYPE;
  v_grupo public.grupos_equipo%ROWTYPE;
  v_grupo_id uuid := p_grupo_equipo_id;
BEGIN
  IF p_recurso_id IS NOT NULL THEN
    SELECT * INTO v_recurso FROM public.recursos_planeacion AS r WHERE r.id = p_recurso_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'recurso_inexistente' USING ERRCODE = '22023';
    END IF;
    v_grupo_id := COALESCE(v_grupo_id, v_recurso.grupo_equipo_id);
    IF v_recurso.tarifa_override_activa THEN
      RETURN jsonb_build_object(
        'tarifa', v_recurso.tarifa_override_hora,
        'moneda', v_recurso.tarifa_override_moneda,
        'fuente', 'RECURSO',
        'grupo_equipo_id', v_grupo_id,
        'recurso_id', v_recurso.id
      );
    END IF;
  END IF;

  IF v_grupo_id IS NULL THEN
    RAISE EXCEPTION 'tarifa_sin_grupo' USING ERRCODE = '23514',
      DETAIL = jsonb_build_object('recurso_id', p_recurso_id, 'recurso', v_recurso.nombre)::text;
  END IF;

  SELECT * INTO v_grupo FROM public.grupos_equipo AS g WHERE g.id = v_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grupo_equipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_grupo.tarifa_hora IS NULL THEN
    RAISE EXCEPTION 'tarifa_no_configurada' USING ERRCODE = '23514',
      DETAIL = jsonb_build_object(
        'grupo_equipo_id', v_grupo.id, 'grupo', v_grupo.nombre, 'codigo', v_grupo.codigo
      )::text;
  END IF;

  RETURN jsonb_build_object(
    'tarifa', v_grupo.tarifa_hora,
    'moneda', v_grupo.tarifa_moneda,
    'fuente', 'GRUPO',
    'grupo_equipo_id', v_grupo.id,
    'recurso_id', p_recurso_id
  );
END;
$$;

COMMENT ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) IS
  'C3.2/DC-07: tarifa por hora para costear un renglón de ruteo. Override activo del recurso > tarifa del Grupo; sin tarifa falla con tarifa_no_configurada/tarifa_sin_grupo (DETAIL identifica qué configurar). Solo service_role.';

REVOKE ALL ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) TO service_role;
