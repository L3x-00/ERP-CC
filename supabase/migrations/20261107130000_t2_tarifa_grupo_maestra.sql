-- =============================================================================
-- T2 — Fuente maestra de tarifa y vínculo Proceso → Grupo de equipo
--
-- Aclaraciones del cliente 2026-11-06 (puntos 11-14):
--   * La fuente efectiva del costeo es `grupos_equipo.tarifa_hora` (y el
--     override explícito de la máquina). `estacion_tarifa` queda como
--     referencia de Tarifas / TC para copiar el valor, pero NO compite en el
--     cálculo.
--   * Los grupos que hoy solo tenían estación vinculada reciben el valor de la
--     estación una vez, para conservar su costo actual.
--   * La tarifa de respaldo es una excepción de V1: sigue disponible, pero su
--     origen incluye el grupo que no tiene tarifa estándar.
--   * El vínculo Proceso → Grupo de equipo no depende de Grupo planeado.
--
-- Aditiva e idempotente. No modifica datos operativos.
-- =============================================================================

COMMENT ON COLUMN public.grupos_equipo.tarifa_hora IS
  'T2 2026-11-06: fuente maestra de la tarifa estándar del grupo para el costeo del ruteo. NULL = sin configurar (respaldo o bloqueo).';
COMMENT ON COLUMN public.grupos_equipo.estacion_tarifa IS
  'T2 2026-11-06: referencia de Tarifas / TC para copiar su valor al grupo. No participa en el cálculo; la fuente efectiva es tarifa_hora.';

-- Conserva el costo actual: si el grupo no tenía tarifa propia pero sí una
-- estación vinculada, se copia el valor vigente una sola vez.
UPDATE public.grupos_equipo AS g
SET tarifa_hora = public.tarifa_estacion_hora(g.estacion_tarifa),
    tarifa_moneda = 'MXN'
WHERE g.tarifa_hora IS NULL
  AND g.estacion_tarifa IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Resolución de tarifa V1.1:
--   override de la máquina > tarifa estándar del grupo > respaldo con aviso
-- La estación ya no es un nivel de cálculo.
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

  -- Única fuente estándar: la tarifa del grupo.
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

  -- Excepción de V1: nunca silenciosa. Incluye el grupo que no está configurado.
  -- TODO(V2): revisar si la tarifa de respaldo se elimina o se administra como
  -- una excepción explícita por grupo.
  v_respaldo := public.tarifa_respaldo_hora();
  IF v_respaldo IS NOT NULL THEN
    RETURN jsonb_build_object(
      'tarifa', v_respaldo,
      'moneda', 'MXN',
      'fuente', 'RESPALDO',
      'advertencia', true,
      'origen', 'Tarifa de respaldo · ' || v_grupo.nombre || ' no tiene tarifa estándar',
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
  'T2 2026-11-06: tarifa por hora del ruteo. Máquina (override activo) > tarifa estándar del Grupo (fuente maestra) > respaldo con advertencia. La estación de Tarifas / TC ya no compite en el cálculo. Solo service_role.';

REVOKE ALL ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_hora(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Vínculo masivo Proceso → Grupo de equipo (alta guiada del grupo).
-- No toca Grupo planeado: esa capa sigue siendo opcional y solo de Planeación.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_procesos_a_grupo_equipo(
  p_grupo_id uuid,
  p_proceso_ids uuid[],
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer := 0;
BEGIN
  IF p_grupo_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'asignacion_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'catalogo_editar') THEN
    RAISE EXCEPTION 'sin_permiso_catalogo' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grupos_equipo AS g WHERE g.id = p_grupo_id) THEN
    RAISE EXCEPTION 'grupo_equipo_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_proceso_ids IS NULL OR cardinality(p_proceso_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.catalogo_procesos AS p
  SET grupo_equipo_id = p_grupo_id
  WHERE p.id = ANY (p_proceso_ids);

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.asignar_procesos_a_grupo_equipo(uuid, uuid[], uuid) IS
  'T2 2026-11-06: vincula procesos al grupo de equipo desde el alta guiada. No modifica grupo_planeado_id. Solo service_role.';

REVOKE ALL ON FUNCTION public.asignar_procesos_a_grupo_equipo(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_procesos_a_grupo_equipo(uuid, uuid[], uuid) TO service_role;
