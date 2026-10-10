-- C4.2 / DC-10 — snapshot comercial inmutable y operación reprogramable.
--
-- Contrato:
--   * `fecha_compromiso_comercial` nace de la aceptación y nunca cambia.
--   * `fecha_operativa` inicia en el compromiso y puede reprogramarse.
--   * El snapshot, la revisión, los ítems y cantidades de una Orden comercial
--     quedan congelados. Prioridad, fecha operativa y notas cambian solo por
--     RPC con CAS, motivo, actor y evento anterior/nuevo.
--   * Planeación conserva sus motores probados como funciones núcleo, pero la
--     aplicación solo puede ejecutar wrappers auditados con actor/correlación.

DO $$
BEGIN
  IF to_regclass('public.ordenes_produccion') IS NULL
     OR to_regclass('public.partidas_orden_produccion') IS NULL
     OR to_regclass('public.solicitudes_orden') IS NULL
     OR to_regclass('public.orden_eventos_cambio') IS NULL THEN
    RAISE EXCEPTION 'C4.2 requiere Orden B5 y C4.1';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Fechas explícitas y backfill compatible
-- ---------------------------------------------------------------------------
ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS fecha_compromiso_comercial date,
  ADD COLUMN IF NOT EXISTS fecha_operativa timestamptz;

UPDATE public.ordenes_produccion AS orden
SET fecha_compromiso_comercial = coalesce(
      solicitud.fecha_compromiso_comercial,
      revision.fecha_compromiso_comercial,
      orden.fecha_compromiso::date
    ),
    fecha_operativa = coalesce(orden.fecha_operativa, orden.fecha_compromiso)
FROM public.propuesta_revisiones AS revision
LEFT JOIN public.solicitudes_orden AS solicitud ON solicitud.revision_id = revision.id
WHERE orden.propuesta_revision_id = revision.id
  AND (orden.fecha_compromiso_comercial IS NULL OR orden.fecha_operativa IS NULL);

UPDATE public.ordenes_produccion
SET fecha_operativa = fecha_compromiso
WHERE fecha_operativa IS NULL;

UPDATE public.ordenes_produccion
SET snapshot_json = jsonb_set(
  snapshot_json,
  '{fecha_compromiso_comercial}',
  to_jsonb(fecha_compromiso_comercial),
  true
)
WHERE propuesta_revision_id IS NOT NULL
  AND fecha_compromiso_comercial IS NOT NULL
  AND jsonb_typeof(snapshot_json) = 'object'
  AND NOT (snapshot_json ? 'fecha_compromiso_comercial');

ALTER TABLE public.ordenes_produccion
  ALTER COLUMN fecha_operativa SET NOT NULL;

ALTER TABLE public.ordenes_produccion
  DROP CONSTRAINT IF EXISTS orden_comercial_compromiso_requerido;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT orden_comercial_compromiso_requerido CHECK (
    propuesta_revision_id IS NULL OR fecha_compromiso_comercial IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS ix_ordenes_fecha_operativa
  ON public.ordenes_produccion (fecha_operativa);
CREATE INDEX IF NOT EXISTS ix_ordenes_fecha_compromiso_comercial
  ON public.ordenes_produccion (fecha_compromiso_comercial)
  WHERE fecha_compromiso_comercial IS NOT NULL;

COMMENT ON COLUMN public.ordenes_produccion.fecha_compromiso_comercial IS
  'C4.2/DC-10: fecha prometida al cliente al aceptar la revisión. Inmutable en la Orden comercial.';
COMMENT ON COLUMN public.ordenes_produccion.fecha_operativa IS
  'C4.2/DC-10: fecha interna reprogramable con CAS, motivo, actor e historial. fecha_compromiso es espejo legacy temporal.';

-- ---------------------------------------------------------------------------
-- 2. Guardas de Orden y partidas comerciales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.proteger_orden_comercial_c4_2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_compromiso date;
  v_finalizando_snapshot boolean := false;
  v_gate boolean := coalesce(current_setting('sii.c4_2_ajuste_operativo', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.fecha_operativa := coalesce(NEW.fecha_operativa, NEW.fecha_compromiso);
    IF NEW.propuesta_revision_id IS NOT NULL THEN
      SELECT coalesce(
        solicitud.fecha_compromiso_comercial,
        revision.fecha_compromiso_comercial,
        NEW.fecha_compromiso::date
      )
      INTO v_compromiso
      FROM public.propuesta_revisiones AS revision
      LEFT JOIN public.solicitudes_orden AS solicitud ON solicitud.revision_id = revision.id
      WHERE revision.id = NEW.propuesta_revision_id;

      IF v_compromiso IS NULL THEN
        RAISE EXCEPTION 'fecha_compromiso_comercial_requerida' USING ERRCODE = '23514';
      END IF;
      NEW.fecha_compromiso_comercial := v_compromiso;
      NEW.fecha_operativa := v_compromiso::timestamptz;
      NEW.fecha_compromiso := NEW.fecha_operativa;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.propuesta_revision_id IS NULL THEN
    IF NEW.fecha_operativa IS DISTINCT FROM OLD.fecha_operativa THEN
      NEW.fecha_compromiso := NEW.fecha_operativa;
    END IF;
    RETURN NEW;
  END IF;

  -- La función creadora inserta primero la Orden con `{}` y completa el
  -- snapshot al terminar las partidas. Es la única escritura inicial válida.
  v_finalizando_snapshot := OLD.snapshot_json = '{}'::jsonb
    AND NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json
    AND jsonb_typeof(NEW.snapshot_json) = 'object'
    AND OLD.cliente_id IS NOT DISTINCT FROM NEW.cliente_id
    AND OLD.propuesta_revision_id IS NOT DISTINCT FROM NEW.propuesta_revision_id;

  IF OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
     OR OLD.cotizacion_id IS DISTINCT FROM NEW.cotizacion_id
     OR OLD.es_interna IS DISTINCT FROM NEW.es_interna
     OR OLD.propuesta_id IS DISTINCT FROM NEW.propuesta_id
     OR OLD.propuesta_revision_id IS DISTINCT FROM NEW.propuesta_revision_id
     OR OLD.rfq_id IS DISTINCT FROM NEW.rfq_id
     OR OLD.fecha_compromiso_comercial IS DISTINCT FROM NEW.fecha_compromiso_comercial
     OR (OLD.snapshot_json IS DISTINCT FROM NEW.snapshot_json AND NOT v_finalizando_snapshot) THEN
    RAISE EXCEPTION 'alcance_comercial_inmutable' USING ERRCODE = '23514';
  END IF;

  IF v_finalizando_snapshot THEN
    NEW.snapshot_json := jsonb_set(
      jsonb_set(
        NEW.snapshot_json,
        '{fecha_compromiso_comercial}',
        to_jsonb(OLD.fecha_compromiso_comercial),
        true
      ),
      '{fecha_compromiso}',
      to_jsonb(OLD.fecha_compromiso_comercial),
      true
    );
  END IF;

  IF OLD.prioridad IS DISTINCT FROM NEW.prioridad
     OR OLD.fecha_operativa IS DISTINCT FROM NEW.fecha_operativa
     OR OLD.fecha_compromiso IS DISTINCT FROM NEW.fecha_compromiso
     OR OLD.notas IS DISTINCT FROM NEW.notas THEN
    IF NOT v_gate THEN
      RAISE EXCEPTION 'cambio_operativo_sin_evento' USING ERRCODE = '23514';
    END IF;
    NEW.fecha_compromiso := NEW.fecha_operativa;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.proteger_orden_comercial_c4_2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_ordenes_c4_2_comercial ON public.ordenes_produccion;
CREATE TRIGGER trigger_ordenes_c4_2_comercial
  BEFORE INSERT OR UPDATE ON public.ordenes_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_orden_comercial_c4_2();

CREATE OR REPLACE FUNCTION privado.proteger_partida_comercial_c4_2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid := coalesce(NEW.orden_id, OLD.orden_id);
  v_es_comercial boolean;
  v_snapshot_final boolean;
BEGIN
  SELECT orden.propuesta_revision_id IS NOT NULL,
         orden.snapshot_json <> '{}'::jsonb
  INTO v_es_comercial, v_snapshot_final
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id;

  IF NOT coalesce(v_es_comercial, false) OR NOT coalesce(v_snapshot_final, false) THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'alcance_comercial_inmutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.orden_id IS DISTINCT FROM NEW.orden_id
     OR OLD.codigo_pieza IS DISTINCT FROM NEW.codigo_pieza
     OR OLD.codigo_item IS DISTINCT FROM NEW.codigo_item
     OR OLD.propuesta_item_id IS DISTINCT FROM NEW.propuesta_item_id
     OR OLD.descripcion IS DISTINCT FROM NEW.descripcion
     OR OLD.cantidad_solicitada IS DISTINCT FROM NEW.cantidad_solicitada
     OR OLD.unidad_medida IS DISTINCT FROM NEW.unidad_medida
     OR OLD.material_id IS DISTINCT FROM NEW.material_id
     OR OLD.area_trabajo_codigo IS DISTINCT FROM NEW.area_trabajo_codigo
     OR OLD.procesos IS DISTINCT FROM NEW.procesos
     OR OLD.tiempo_estimado_minutos IS DISTINCT FROM NEW.tiempo_estimado_minutos THEN
    RAISE EXCEPTION 'alcance_comercial_inmutable' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.proteger_partida_comercial_c4_2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_partidas_c4_2_comercial ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_partidas_c4_2_comercial
  BEFORE INSERT OR UPDATE OR DELETE ON public.partidas_orden_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_partida_comercial_c4_2();

-- ---------------------------------------------------------------------------
-- 3. Ajuste operativo de Orden: solo campos permitidos + CAS + diff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_orden_post_aceptacion(
  p_orden_id uuid,
  p_cambios jsonb,
  p_motivo text,
  p_actualizado_en timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_sii text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_nueva public.ordenes_produccion%ROWTYPE;
  v_motivo text;
  v_prioridad text;
  v_notas text;
  v_fecha_operativa timestamptz;
  v_anterior jsonb;
  v_nuevo jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_editar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'cambios_requeridos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_cambios) AS clave(nombre)
    WHERE clave.nombre NOT IN ('fecha_operativa', 'prioridad', 'notas')
  ) THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado_sii NOT IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA') THEN
    RAISE EXCEPTION 'orden_en_produccion' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;
  IF p_actualizado_en IS NULL OR v_orden.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = '23514';
  END IF;

  v_prioridad := v_orden.prioridad;
  v_notas := v_orden.notas;
  v_fecha_operativa := v_orden.fecha_operativa;

  IF p_cambios ? 'prioridad' THEN
    v_prioridad := privado.json_texto(p_cambios, 'prioridad');
    IF v_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
      RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_cambios ? 'notas' THEN
    v_notas := privado.json_texto(p_cambios, 'notas');
    IF char_length(coalesce(v_notas, '')) > 2000 THEN
      RAISE EXCEPTION 'notas_invalidas' USING ERRCODE = '23514';
    END IF;
    v_notas := nullif(btrim(coalesce(v_notas, '')), '');
  END IF;
  IF p_cambios ? 'fecha_operativa' THEN
    BEGIN
      v_fecha_operativa := privado.json_texto(p_cambios, 'fecha_operativa')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format THEN
      RAISE EXCEPTION 'fecha_operativa_invalida' USING ERRCODE = '22023';
    END;
    IF v_fecha_operativa IS NULL THEN
      RAISE EXCEPTION 'fecha_operativa_requerida' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_prioridad IS NOT DISTINCT FROM v_orden.prioridad
     AND v_notas IS NOT DISTINCT FROM v_orden.notas
     AND v_fecha_operativa IS NOT DISTINCT FROM v_orden.fecha_operativa THEN
    RAISE EXCEPTION 'cambios_sin_diferencias' USING ERRCODE = '22023';
  END IF;

  v_anterior := jsonb_build_object(
    'prioridad', v_orden.prioridad,
    'fecha_operativa', v_orden.fecha_operativa,
    'notas', v_orden.notas
  );

  PERFORM set_config('sii.c4_2_ajuste_operativo', 'on', true);
  UPDATE public.ordenes_produccion AS orden
  SET prioridad = v_prioridad,
      fecha_operativa = v_fecha_operativa,
      fecha_compromiso = v_fecha_operativa,
      notas = v_notas,
      actualizado_en = now()
  WHERE orden.id = p_orden_id
  RETURNING orden.* INTO v_nueva;

  v_nuevo := jsonb_build_object(
    'prioridad', v_nueva.prioridad,
    'fecha_operativa', v_nueva.fecha_operativa,
    'notas', v_nueva.notas
  );

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id, 'ajuste_operativo',
    jsonb_build_object('anterior', v_anterior, 'nuevo', v_nuevo),
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_nueva.id, v_nueva.estado_sii, v_nueva.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid) IS
  'C4.2/DC-10: modifica solo prioridad, fecha_operativa y notas antes de producción; exige permiso, CAS, motivo y registra anterior/nuevo. Nunca cambia alcance ni compromiso comercial.';
REVOKE ALL ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_orden_post_aceptacion(uuid, jsonb, text, timestamptz, uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Wrappers auditados de Planeación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.programar_partida_recurso_auditada(
  p_orden_id uuid,
  p_partida_id uuid,
  p_recurso_id uuid,
  p_secuencia smallint,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_planeacion text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resultado record;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_resultado
  FROM public.programar_partida_recurso(
    p_orden_id, p_partida_id, p_recurso_id, p_secuencia,
    p_fecha_programada, p_turno, p_horas_estimadas, p_orden_prioridad
  );

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'programacion_inicial',
    jsonb_build_object(
      'anterior', NULL,
      'nuevo', jsonb_build_object(
        'programacion_id', v_resultado.id,
        'partida_id', p_partida_id,
        'recurso_id', p_recurso_id,
        'secuencia', p_secuencia,
        'fecha_programada', p_fecha_programada,
        'turno', p_turno,
        'horas_estimadas', p_horas_estimadas,
        'orden_prioridad', p_orden_prioridad
      )
    ),
    'Programación inicial', p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_resultado.id, v_resultado.estado_planeacion, v_resultado.actualizado_en;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprogramar_partida_recurso_auditada(
  p_programacion_id uuid,
  p_recurso_id uuid,
  p_fecha_programada date,
  p_turno text,
  p_horas_estimadas numeric,
  p_orden_prioridad integer,
  p_actualizado_en_esperado timestamptz,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_planeacion text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anterior public.programacion_areas%ROWTYPE;
  v_resultado record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion') THEN
    RAISE EXCEPTION 'sin_permiso_planeacion' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_reprogramacion_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_anterior
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_resultado
  FROM public.reprogramar_partida_recurso(
    p_programacion_id, p_recurso_id, p_fecha_programada, p_turno,
    p_horas_estimadas, p_orden_prioridad, p_actualizado_en_esperado
  );

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_anterior.orden_id,
    'reprogramacion_operativa',
    jsonb_build_object(
      'programacion_id', p_programacion_id,
      'partida_id', v_anterior.partida_id,
      'anterior', jsonb_build_object(
        'recurso_id', v_anterior.recurso_id,
        'fecha_programada', v_anterior.fecha_programada,
        'turno', v_anterior.turno,
        'horas_estimadas', v_anterior.horas_estimadas,
        'orden_prioridad', v_anterior.orden_prioridad
      ),
      'nuevo', jsonb_build_object(
        'recurso_id', p_recurso_id,
        'fecha_programada', p_fecha_programada,
        'turno', p_turno,
        'horas_estimadas', p_horas_estimadas,
        'orden_prioridad', p_orden_prioridad
      )
    ),
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_resultado.id, v_resultado.estado_planeacion, v_resultado.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid) IS
  'C4.2/DC-10: programa mediante el motor de capacidad y registra actor, correlación y estado nuevo en la historia de la Orden.';
COMMENT ON FUNCTION public.reprogramar_partida_recurso_auditada(uuid, uuid, date, text, numeric, integer, timestamptz, text, uuid, uuid) IS
  'C4.2/DC-10: reprograma con CAS y capacidad; exige motivo/actor y registra anterior/nuevo en la historia de la Orden.';

REVOKE ALL ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprogramar_partida_recurso_auditada(uuid, uuid, date, text, numeric, integer, timestamptz, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programar_partida_recurso_auditada(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reprogramar_partida_recurso_auditada(uuid, uuid, date, text, numeric, integer, timestamptz, text, uuid, uuid)
  TO service_role;

-- Los motores núcleo conservan compatibilidad interna, pero dejan de ser una
-- superficie de Data API: solo los wrappers anteriores son invocables por la app.
REVOKE EXECUTE ON FUNCTION public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reprogramar_partida_recurso(uuid, uuid, date, text, numeric, integer, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
