-- =============================================================================
-- C3.3b — Máquina opcional por renglón de ruteo (DC-07)
--
--   * `editar_ruteo_item` acepta `recurso_id` por renglón: debe existir, estar
--     activo y pertenecer al grupo de equipo del renglón. Así la tarifa propia
--     de la máquina (C3.2) se usa al costear (C3.3). El resto de la función
--     queda igual que en SII-B4.5.
--   * `crear_nueva_revision` copia también la máquina elegida (no el snapshot
--     de costeo: la revisión nueva se recostea).
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.editar_ruteo_item(
  p_item_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_item public.propuesta_items%ROWTYPE;
  v_esperado timestamptz;
  v_filas jsonb;
  v_fila jsonb;
  v_proceso_id uuid;
  v_grupo_equipo uuid;
  v_grupo_planeado uuid;
  v_recurso uuid;
  v_recurso_grupo uuid;
  v_setup numeric;
  v_run numeric;
  v_secuencia integer := 0;
  v_creadas integer := 0;
  v_flag boolean;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_ruteo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR jsonb_typeof(p_datos->'filas') <> 'array' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_revision
  FROM public.propuesta_revisiones AS r
  JOIN public.propuesta_items AS i ON i.revision_id = r.id
  WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = v_revision.id FOR UPDATE;

  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  SELECT * INTO v_item FROM public.propuesta_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Validación completa antes de reemplazar (una carga inválida no borra nada).
  FOR v_fila IN SELECT e.value FROM jsonb_array_elements(p_datos->'filas') AS e(value) LOOP
    IF jsonb_typeof(v_fila) <> 'object' THEN
      RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023', DETAIL = 'filas';
    END IF;
    v_proceso_id := privado.json_uuid(v_fila, 'proceso_id');
    IF v_proceso_id IS NULL THEN
      RAISE EXCEPTION 'ruteo_proceso_requerido' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.catalogo_procesos AS p WHERE p.id = v_proceso_id AND p.activo) THEN
      RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
    END IF;

    v_grupo_equipo := privado.json_uuid(v_fila, 'grupo_equipo_id');
    v_grupo_planeado := privado.json_uuid(v_fila, 'grupo_planeado_id');
    IF v_grupo_equipo IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.grupos_equipo AS g WHERE g.id = v_grupo_equipo
    ) THEN
      RAISE EXCEPTION 'grupo_equipo_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_grupo_planeado IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.grupos_planeados AS g WHERE g.id = v_grupo_planeado
    ) THEN
      RAISE EXCEPTION 'grupo_planeado_invalido' USING ERRCODE = '22023';
    END IF;

    -- C3.3: máquina opcional; debe existir, estar activa y pertenecer al grupo.
    v_recurso := privado.json_uuid(v_fila, 'recurso_id');
    IF v_recurso IS NOT NULL THEN
      SELECT r.grupo_equipo_id INTO v_recurso_grupo
      FROM public.recursos_planeacion AS r WHERE r.id = v_recurso AND r.activo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'recurso_invalido' USING ERRCODE = '22023';
      END IF;
      IF v_grupo_equipo IS NOT NULL AND v_recurso_grupo IS DISTINCT FROM v_grupo_equipo THEN
        RAISE EXCEPTION 'recurso_grupo_distinto' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_setup := COALESCE(privado.json_numero(v_fila, 'setup_horas'), 0);
    v_run := COALESCE(privado.json_numero(v_fila, 'run_horas'), 0);
    IF v_setup < 0 OR v_setup > 10000 OR v_run < 0 OR v_run > 100000 THEN
      RAISE EXCEPTION 'ruteo_horas_invalidas' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.propuesta_item_ruteo WHERE item_id = p_item_id;

  FOR v_fila IN SELECT e.value FROM jsonb_array_elements(p_datos->'filas') AS e(value) LOOP
    v_secuencia := v_secuencia + 1;
    INSERT INTO public.propuesta_item_ruteo (
      item_id, secuencia, proceso_id, grupo_equipo_id, grupo_planeado_id, recurso_id,
      setup_horas, run_horas, requiere_revision
    ) VALUES (
      p_item_id,
      v_secuencia,
      privado.json_uuid(v_fila, 'proceso_id'),
      privado.json_uuid(v_fila, 'grupo_equipo_id'),
      privado.json_uuid(v_fila, 'grupo_planeado_id'),
      privado.json_uuid(v_fila, 'recurso_id'),
      COALESCE(privado.json_numero(v_fila, 'setup_horas'), 0),
      COALESCE(privado.json_numero(v_fila, 'run_horas'), 0),
      false
    );
    v_creadas := v_creadas + 1;
  END LOOP;

  UPDATE public.propuesta_revisiones
  SET requiere_revision_ruteo = EXISTS (
        SELECT 1
        FROM public.propuesta_item_ruteo AS rt
        JOIN public.propuesta_items AS i ON i.id = rt.item_id
        WHERE i.revision_id = v_revision.id AND rt.requiere_revision
      ),
      actualizado_en = now()
  WHERE id = v_revision.id
  RETURNING requiere_revision_ruteo INTO v_flag;

  RETURN jsonb_build_object(
    'itemId', p_item_id,
    'filas', v_creadas,
    'requiereRevisionRuteo', v_flag
  );
END;
$$;

COMMENT ON FUNCTION public.editar_ruteo_item(uuid, jsonb, uuid, uuid) IS
  'SII-B4.5/4.9 + C3.3: reemplaza el ruteo estimado de un ítem DRAFT, con máquina opcional del mismo grupo. Solo service_role.';


-- Copia de la máquina al crear una revisión nueva: solo cambian las dos listas
-- de columnas del INSERT … SELECT del ruteo. Falla cerrado si el texto no
-- coincide con lo esperado.
DO $$
DECLARE
  v_definicion text;
  v_cols_original constant text := $c$item_id, secuencia, proceso_id, grupo_equipo_id, grupo_planeado_id,
      setup_horas, run_horas, requiere_revision
    )
    SELECT v_nuevo_item_id, rt.secuencia, rt.proceso_id, rt.grupo_equipo_id, rt.grupo_planeado_id,
           rt.setup_horas, rt.run_horas, false$c$;
  v_cols_nueva constant text := $c$item_id, secuencia, proceso_id, grupo_equipo_id, grupo_planeado_id, recurso_id,
      setup_horas, run_horas, requiere_revision
    )
    SELECT v_nuevo_item_id, rt.secuencia, rt.proceso_id, rt.grupo_equipo_id, rt.grupo_planeado_id, rt.recurso_id,
           rt.setup_horas, rt.run_horas, false$c$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definicion
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'crear_nueva_revision';
  IF v_definicion IS NULL THEN
    RAISE EXCEPTION 'C3.3b: no existe crear_nueva_revision';
  END IF;
  IF position(v_cols_nueva IN v_definicion) > 0 THEN
    RETURN;  -- ya migrada (idempotente)
  END IF;
  IF (length(v_definicion) - length(replace(v_definicion, v_cols_original, ''))) / length(v_cols_original) <> 1 THEN
    RAISE EXCEPTION 'C3.3b: la copia de ruteo de crear_nueva_revision no coincide con lo esperado';
  END IF;
  EXECUTE replace(v_definicion, v_cols_original, v_cols_nueva);
END;
$$;
