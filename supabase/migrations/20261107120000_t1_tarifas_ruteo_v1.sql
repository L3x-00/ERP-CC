-- =============================================================================
-- T1 — Tarifas / TC V1: origen explícito y respaldo nunca silencioso
--
-- Aclaraciones del cliente 2026-11-06 (tarifas):
--   * Cada operación costea con un Grupo de Equipo; la máquina solo sustituye
--     la tarifa cuando tiene un override activo y explícito.
--   * Prioridad V1: máquina (override activo) → tarifa estándar del grupo
--     (propia o la de la estación de Tarifas / TC vinculada) → tarifa de
--     respaldo.
--   * La tarifa de respaldo (`tarifas_json.costoHoraDefault`) solo se usa si
--     el grupo no tiene ninguna tarifa válida. Se devuelve marcada con
--     `advertencia = true` y un `origen` legible que el ruteo muestra.
--   * `propuesta_item_ruteo.tarifa_origen` congela el origen al costear, para
--     que la propuesta conserve la explicación aunque cambien los catálogos.
--
-- Aditiva e idempotente. No modifica datos operativos.
-- =============================================================================

ALTER TABLE public.propuesta_item_ruteo
  ADD COLUMN IF NOT EXISTS tarifa_origen text;

COMMENT ON COLUMN public.propuesta_item_ruteo.tarifa_origen IS
  'T1 2026-11-06: origen legible de la tarifa congelada (máquina, grupo, Tarifas / TC o respaldo).';

-- Backfill de renglones ya costeados con el origen que se conocía por la fuente.
UPDATE public.propuesta_item_ruteo AS rt
SET tarifa_origen = CASE rt.tarifa_fuente
  WHEN 'RECURSO' THEN 'Tarifa propia de la máquina'
  WHEN 'GRUPO' THEN 'Tarifa del grupo'
  WHEN 'ESTACION' THEN 'Tarifas / TC'
  ELSE NULL
END
WHERE rt.costeado_en IS NOT NULL
  AND rt.tarifa_origen IS NULL;

-- El snapshot acepta la fuente RESPALDO.
ALTER TABLE public.propuesta_item_ruteo
  DROP CONSTRAINT IF EXISTS propuesta_item_ruteo_snapshot_costeo;
ALTER TABLE public.propuesta_item_ruteo
  ADD CONSTRAINT propuesta_item_ruteo_snapshot_costeo CHECK (
    (costeado_en IS NULL AND tarifa_hora IS NULL AND costo_total IS NULL)
    OR (
      costeado_en IS NOT NULL
      AND tarifa_hora >= 0
      AND tarifa_moneda IN ('MXN', 'USD')
      AND tarifa_fuente IN ('GRUPO', 'RECURSO', 'ESTACION', 'RESPALDO')
      AND costo_setup >= 0 AND costo_run >= 0
      AND costo_total = costo_setup + costo_run
    )
  );

-- -----------------------------------------------------------------------------
-- Etiqueta legible de una estación (misma que ETIQUETA_ESTACION_TARIFA en TS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.etiqueta_estacion_tarifa(p_estacion text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_estacion
    WHEN 'laser' THEN 'Corte láser'
    WHEN 'router' THEN 'Router CNC'
    WHEN 'doblado' THEN 'Dobladora'
    WHEN 'soldadura' THEN 'Soldadura'
    WHEN 'mano_obra' THEN 'Mano de obra'
    WHEN 'acabado' THEN 'Acabado'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.etiqueta_estacion_tarifa(text) IS
  'T1 2026-11-06: etiqueta legible de una estación de Tarifas / TC para el origen de la tarifa.';

REVOKE ALL ON FUNCTION public.etiqueta_estacion_tarifa(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etiqueta_estacion_tarifa(text) TO service_role;

-- -----------------------------------------------------------------------------
-- Tarifa de respaldo (MXN) de Configuración → Tarifas / TC
-- Devuelve NULL cuando no está configurada o no es un monto válido.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarifa_respaldo_hora()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN c.tarifas_json ? 'costoHoraDefault'
     AND jsonb_typeof(c.tarifas_json -> 'costoHoraDefault') = 'number'
     AND (c.tarifas_json ->> 'costoHoraDefault')::numeric >= 0
    THEN (c.tarifas_json ->> 'costoHoraDefault')::numeric
    ELSE NULL
  END
  FROM public.configuracion_sistema AS c
  WHERE c.id = 'main';
$$;

COMMENT ON FUNCTION public.tarifa_respaldo_hora() IS
  'T1 2026-11-06: costo por hora de respaldo configurado en Tarifas / TC; NULL si no existe. Solo service_role.';

REVOKE ALL ON FUNCTION public.tarifa_respaldo_hora() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarifa_respaldo_hora() TO service_role;

-- -----------------------------------------------------------------------------
-- Resolución de tarifa V1:
--   override de la máquina > tarifa del grupo > estación vinculada > respaldo
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
  v_respaldo numeric;
  v_etiqueta text;
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
        'advertencia', false,
        'origen', 'Tarifa propia de la máquina',
        'grupo_equipo_id', v_grupo_id,
        'recurso_id', v_recurso.id,
        'recurso', v_recurso.nombre
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
      'advertencia', false,
      'origen', 'Tarifa del grupo',
      'grupo_equipo_id', v_grupo.id,
      'grupo', v_grupo.nombre,
      'recurso_id', p_recurso_id
    );
  END IF;

  IF v_grupo.estacion_tarifa IS NOT NULL THEN
    v_etiqueta := public.etiqueta_estacion_tarifa(v_grupo.estacion_tarifa);
    RETURN jsonb_build_object(
      'tarifa', public.tarifa_estacion_hora(v_grupo.estacion_tarifa),
      'moneda', 'MXN',
      'fuente', 'ESTACION',
      'advertencia', false,
      'origen', 'Tarifas / TC · ' || COALESCE(v_etiqueta, v_grupo.estacion_tarifa),
      'estacion', v_grupo.estacion_tarifa,
      'grupo_equipo_id', v_grupo.id,
      'grupo', v_grupo.nombre,
      'recurso_id', p_recurso_id
    );
  END IF;

  -- Último recurso: nunca silencioso. Se marca la advertencia y el origen.
  v_respaldo := public.tarifa_respaldo_hora();
  IF v_respaldo IS NOT NULL THEN
    RETURN jsonb_build_object(
      'tarifa', v_respaldo,
      'moneda', 'MXN',
      'fuente', 'RESPALDO',
      'advertencia', true,
      'origen', 'Tarifa de respaldo (el grupo no tiene tarifa estándar)',
      'grupo_equipo_id', v_grupo.id,
      'grupo', v_grupo.nombre,
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
  'T1 2026-11-06: tarifa por hora del ruteo. Máquina (override activo) > tarifa estándar del Grupo (propia o estación de Tarifas / TC) > respaldo con advertencia; sin nada falla con tarifa_no_configurada. Solo service_role.';

REVOKE ALL ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- El costeo congela también el origen legible de la tarifa.
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
        tarifa_origen = v_tarifa->>'origen',
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
  'T1 2026-11-06: congela tarifa, fuente, origen y costos de cada renglón de ruteo de una revisión DRAFT. Sin tarifa o con moneda distinta falla completa. Solo service_role.';

REVOKE ALL ON FUNCTION public.costear_ruteo_revision(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.costear_ruteo_revision(uuid, uuid, uuid) TO service_role;
