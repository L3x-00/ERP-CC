-- =============================================================================
-- Obs. cliente 2026-10-13 — Un solo tarifario: «Tarifas / TC» alimenta el ruteo
--
-- Hoy existen dos fuentes de tarifa por hora que no se hablan:
--   * Configuración → Tarifas / TC: tarifas por estación del cotizador (láser,
--     router, dobladora, fabricación), guardadas en `configuracion_sistema`.
--   * `grupos_equipo.tarifa_hora` (C3.2/DC-07): la que lee el costeo del ruteo,
--     casi siempre vacía → «Sin tarifa configurada» aunque Tarifas / TC tenga datos.
--
-- Este cambio las relaciona sin duplicar valores:
--   * `grupos_equipo.estacion_tarifa` vincula el grupo con una estación de
--     Tarifas / TC. La tarifa propia del grupo (si existe) sigue mandando; sin
--     ella se usa la de la estación vinculada, siempre en MXN.
--   * `public.tarifa_estacion_hora(estacion)` lee Tarifas / TC con los mismos
--     valores por defecto que el cotizador cuando el JSON no los trae.
--   * `public.resolver_tarifa_hora` agrega la fuente `ESTACION` entre el grupo y
--     el error `tarifa_no_configurada`; el snapshot del renglón la congela.
--   * Los grupos sembrados se vinculan por código (editable después en
--     Configuración → Tarifas / TC); nunca se pisa una tarifa propia.
--
-- Aditiva e idempotente. Aplicar antes o junto con el despliegue del código.
-- =============================================================================

ALTER TABLE public.grupos_equipo
  ADD COLUMN IF NOT EXISTS estacion_tarifa text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grupos_equipo_estacion_tarifa_valida') THEN
    ALTER TABLE public.grupos_equipo
      ADD CONSTRAINT grupos_equipo_estacion_tarifa_valida CHECK (
        estacion_tarifa IS NULL
        OR estacion_tarifa IN ('laser', 'router', 'doblado', 'soldadura', 'mano_obra', 'acabado')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.grupos_equipo.estacion_tarifa IS
  'Obs. cliente 2026-10-13: estación de Configuración → Tarifas / TC de la que toma su tarifa por hora cuando el grupo no tiene tarifa propia (tarifa_hora NULL).';

-- Vínculo inicial por código de los grupos sembrados (B1.6). Solo grupos sin
-- tarifa propia y sin vínculo previo; el administrador puede cambiarlo.
UPDATE public.grupos_equipo AS g
SET estacion_tarifa = v.estacion
FROM (VALUES
  ('LASER_FIBRA', 'laser'),
  ('CNC_ROUTER',  'router'),
  ('PRESS_BRAKE', 'doblado'),
  ('SOLDADURA',   'soldadura'),
  ('MAQUINADO',   'mano_obra')
) AS v(codigo, estacion)
WHERE g.codigo = v.codigo
  AND g.estacion_tarifa IS NULL
  AND g.tarifa_hora IS NULL;

-- El snapshot del renglón acepta la nueva fuente.
ALTER TABLE public.propuesta_item_ruteo
  DROP CONSTRAINT IF EXISTS propuesta_item_ruteo_snapshot_costeo;
ALTER TABLE public.propuesta_item_ruteo
  ADD CONSTRAINT propuesta_item_ruteo_snapshot_costeo CHECK (
    (costeado_en IS NULL AND tarifa_hora IS NULL AND costo_total IS NULL)
    OR (
      costeado_en IS NOT NULL
      AND tarifa_hora >= 0
      AND tarifa_moneda IN ('MXN', 'USD')
      AND tarifa_fuente IN ('GRUPO', 'RECURSO', 'ESTACION')
      AND costo_setup >= 0 AND costo_run >= 0
      AND costo_total = costo_setup + costo_run
    )
  );

-- -----------------------------------------------------------------------------
-- Tarifa por hora de una estación de Tarifas / TC (MXN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarifa_estacion_hora(p_estacion text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ruta text[];
  v_defecto numeric;
  v_json jsonb;
  v_valor jsonb;
BEGIN
  -- Mismos valores por defecto que `CATALOGO_TARIFAS_DEFECTO` del cotizador.
  CASE p_estacion
    WHEN 'laser'     THEN v_ruta := ARRAY['estaciones', 'laser', 'maquinaHora'];        v_defecto := 650;
    WHEN 'router'    THEN v_ruta := ARRAY['estaciones', 'router', 'maquinaHora'];       v_defecto := 550;
    WHEN 'doblado'   THEN v_ruta := ARRAY['estaciones', 'doblado', 'maquinaHora'];      v_defecto := 600;
    WHEN 'soldadura' THEN v_ruta := ARRAY['estaciones', 'fabricacion', 'soldaduraHora']; v_defecto := 450;
    WHEN 'mano_obra' THEN v_ruta := ARRAY['estaciones', 'fabricacion', 'manoObraHora']; v_defecto := 350;
    WHEN 'acabado'   THEN v_ruta := ARRAY['estaciones', 'fabricacion', 'acabadoHora'];  v_defecto := 300;
    ELSE
      RAISE EXCEPTION 'estacion_tarifa_invalida' USING ERRCODE = '22023';
  END CASE;

  SELECT c.tarifas_json INTO v_json
  FROM public.configuracion_sistema AS c
  WHERE c.id = 'main';

  v_valor := v_json #> v_ruta;
  IF v_valor IS NOT NULL
     AND jsonb_typeof(v_valor) = 'number'
     AND (v_valor #>> '{}')::numeric >= 0 THEN
    RETURN (v_valor #>> '{}')::numeric;
  END IF;
  RETURN v_defecto;
END;
$$;

COMMENT ON FUNCTION public.tarifa_estacion_hora(text) IS
  'Obs. cliente 2026-10-13: tarifa por hora (MXN) de una estación de Configuración → Tarifas / TC; usa los valores por defecto del cotizador si el JSON no los trae. Solo service_role.';

REVOKE ALL ON FUNCTION public.tarifa_estacion_hora(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarifa_estacion_hora(text) TO service_role;

-- -----------------------------------------------------------------------------
-- Resolución de tarifa: recurso > grupo (propia) > estación vinculada > error
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

  IF v_grupo.tarifa_hora IS NOT NULL THEN
    RETURN jsonb_build_object(
      'tarifa', v_grupo.tarifa_hora,
      'moneda', v_grupo.tarifa_moneda,
      'fuente', 'GRUPO',
      'grupo_equipo_id', v_grupo.id,
      'recurso_id', p_recurso_id
    );
  END IF;

  IF v_grupo.estacion_tarifa IS NOT NULL THEN
    RETURN jsonb_build_object(
      'tarifa', public.tarifa_estacion_hora(v_grupo.estacion_tarifa),
      'moneda', 'MXN',
      'fuente', 'ESTACION',
      'estacion', v_grupo.estacion_tarifa,
      'grupo_equipo_id', v_grupo.id,
      'recurso_id', p_recurso_id
    );
  END IF;

  RAISE EXCEPTION 'tarifa_no_configurada' USING ERRCODE = '23514',
    DETAIL = jsonb_build_object(
      'grupo_equipo_id', v_grupo.id, 'grupo', v_grupo.nombre, 'codigo', v_grupo.codigo
    )::text;
END;
$$;

COMMENT ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) IS
  'C3.2/DC-07 (+obs. cliente 2026-10-13): tarifa por hora para costear un renglón de ruteo. Override activo del recurso > tarifa propia del Grupo > tarifa de la estación de Tarifas / TC vinculada al Grupo; sin ninguna falla con tarifa_no_configurada/tarifa_sin_grupo. Solo service_role.';

REVOKE ALL ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) TO service_role;
