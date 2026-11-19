-- =============================================================================
-- C25 — Disponibilidad y ocupación de equipos con causa explícita
--
-- Reglas del PO (2026-11-19):
--   * La ocupación de un equipo es FÍSICA: un equipo solo puede estar en una
--     preparación o ejecución a la vez, sin importar la fecha para la que se
--     programó (el índice `idx_programacion_areas_candado_recurso_activo` ya lo
--     garantiza). La fecha solo reparte la CAPACIDAD DIARIA del equipo.
--   * El arranque nunca cancela ni mueve el proceso de otro operador. Si el
--     equipo está trabajando otra orden, el error lo dice con nombre y apellido
--     y explica que hay que esperar el cierre/pausa o reprogramar.
--   * Regla transversal: ningún error genérico. El mensaje distingue entre
--     día cerrado, grupo sin equipos activos, equipos sin capacidad ese día,
--     equipo ocupado por otro proceso y capacidad diaria insuficiente.
--
-- Motivo: O-1126_08 (IT01/IT02) fallaba con «todos los equipos del área están
-- en preparación o en proceso» sin decir qué equipo, quién lo tenía ni qué
-- hacer, cuando el único equipo del grupo LAS01 (LASER-01) estaba trabajando
-- O-1126_09.
--
-- Aplicar solo en local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Detalle legible del proceso que ocupa un equipo.
--
-- Devuelve una frase por cada fila activa del recurso con la orden, partida,
-- operación, operador y fecha para la que estaba programada. La ocupación es la
-- misma que vigila el índice parcial: en_preparacion / en_proceso.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.detalle_ocupacion_recurso(
  p_recurso_id uuid,
  p_fecha date,
  p_operador_id uuid,
  p_programacion_excluida uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT string_agg(
    format(
      '%s (%s) está ocupado por la orden %s · %s%s%s%s',
      recurso.codigo,
      recurso.nombre,
      coalesce(nullif(btrim(orden.folio_sii), ''), orden.folio),
      partida.codigo_pieza,
      CASE WHEN meta.nombre IS NULL THEN '' ELSE ' (' || meta.nombre || ')' END,
      CASE
        WHEN sesion.estado_sesion = 'activa' AND sesion.operador_id = p_operador_id
          THEN ', lo estás trabajando tú'
        WHEN sesion.estado_sesion = 'activa'
          THEN format(', operador %s', coalesce(usuario.nombre_completo, 'de piso'))
        WHEN sesion.estado_sesion = 'pausada'
          THEN format(', en pausa con el operador %s', coalesce(usuario.nombre_completo, 'de piso'))
        WHEN sesion.estado_sesion IS NULL
          THEN ', en preparación'
        ELSE format(', con una sesión ya %s que Planeación debe revisar', sesion.estado_sesion)
      END,
      CASE WHEN ocupada.fecha_programada = p_fecha THEN ''
           ELSE format(' (programado para el %s)', ocupada.fecha_programada)
      END
    ),
    '; '
    ORDER BY recurso.codigo
  )
  FROM public.programacion_areas AS ocupada
  JOIN public.recursos_planeacion AS recurso
    ON recurso.id = ocupada.recurso_id
  JOIN public.ordenes_produccion AS orden
    ON orden.id = ocupada.orden_id
  JOIN public.partidas_orden_produccion AS partida
    ON partida.id = ocupada.partida_id
  LEFT JOIN public.metas_proceso_partida AS meta
    ON meta.id = ocupada.meta_proceso_id
  LEFT JOIN LATERAL (
    SELECT sesion.estado_sesion, sesion.operador_id
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.programacion_id = ocupada.id
    ORDER BY (sesion.estado_sesion = 'activa') DESC, sesion.fecha_inicio DESC
    LIMIT 1
  ) AS sesion ON true
  LEFT JOIN public.usuarios AS usuario
    ON usuario.id = sesion.operador_id
  WHERE ocupada.recurso_id = p_recurso_id
    AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
    AND ocupada.id IS DISTINCT FROM p_programacion_excluida;
$$;

COMMENT ON FUNCTION privado.detalle_ocupacion_recurso(uuid, date, uuid, uuid) IS
  'C25: frase legible del proceso que mantiene ocupado un equipo (orden, partida, operación, operador y fecha programada).';

REVOKE ALL ON FUNCTION privado.detalle_ocupacion_recurso(uuid, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Preparar el reclamo: elige equipo con causa explícita cuando no hay.
--
-- Contrato de locks: reclamo → partida → orden → meta → recursos (por código).
-- La ocupación se evalúa sin filtrar por fecha porque el equipo es el mismo hoy;
-- la capacidad y las horas programadas sí se suman solo para el día del reclamo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preparar_reclamo_operador(
  p_reclamo_id uuid,
  p_operador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reclamo public.reclamos_proceso_operador%ROWTYPE;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_meta public.metas_proceso_partida%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_area_macro text;
  v_grupo_id uuid;
  v_grupo_nombre text;
  v_recurso record;
  v_recurso_preferido uuid;
  v_recurso_id uuid;
  v_capacidad numeric;
  v_horas_programadas numeric;
  v_libre numeric;
  v_prioridad integer;
  v_programacion_id uuid;
  v_secuencia smallint := 1;
  v_total_metas integer;
  v_reutiliza_programacion boolean := false;
  v_total_equipos integer := 0;
  v_equipos_con_capacidad integer := 0;
  v_sin_capacidad text;
  v_detalle_ocupados text;
  v_mejor_recurso text;
  v_mejor_libre numeric;
  v_mejor_capacidad numeric;
  v_mejor_cargado numeric;
  v_mensaje text;
BEGIN
  IF p_reclamo_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'reclamo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_reclamo
  FROM public.reclamos_proceso_operador AS reclamo
  WHERE reclamo.id = p_reclamo_id
  FOR UPDATE;

  IF NOT FOUND OR v_reclamo.estado <> 'activo' THEN
    RAISE EXCEPTION 'reclamo_no_activo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reclamo.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'reclamo_otro_operador' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_partida
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = v_reclamo.partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_partida.orden_id <> v_reclamo.orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_reclamo.orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orden.estado NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_pendiente_liberacion' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT privado.operador_habilitado_area(p_operador_id, v_partida.area_trabajo_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT * INTO v_meta
    FROM public.metas_proceso_partida AS meta
    WHERE meta.id = v_reclamo.meta_proceso_id
      AND meta.partida_id = v_reclamo.partida_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
    END IF;

    v_secuencia := v_meta.secuencia;
  END IF;

  v_prioridad := CASE v_orden.prioridad
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'normal' THEN 3
    ELSE 4
  END;

  -- ¿Ya existe la fila de programación de esta operación?
  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = v_reclamo.partida_id
    AND programacion.meta_proceso_id IS NOT DISTINCT FROM v_reclamo.meta_proceso_id
  FOR UPDATE;
  v_reutiliza_programacion := FOUND;

  -- Compatibilidad C9.0: Planeación pudo preparar la partida completa (fila
  -- heredada sin operación). Si la partida tiene una sola operación, el reclamo
  -- adopta esa fila en lugar de crear otra que competiría por el mismo recurso.
  IF NOT v_reutiliza_programacion AND v_reclamo.meta_proceso_id IS NOT NULL THEN
    SELECT count(*) INTO v_total_metas
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = v_reclamo.partida_id;

    IF v_total_metas = 1 THEN
      SELECT * INTO v_programacion
      FROM public.programacion_areas AS programacion
      WHERE programacion.partida_id = v_reclamo.partida_id
        AND programacion.meta_proceso_id IS NULL
        AND programacion.estado_planeacion IN ('programada', 'en_preparacion')
      ORDER BY programacion.creado_en DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.programacion_areas AS programacion
        SET meta_proceso_id = v_reclamo.meta_proceso_id,
            actualizado_en = now()
        WHERE programacion.id = v_programacion.id;
        v_reutiliza_programacion := true;
      END IF;
    END IF;
  END IF;

  IF v_reutiliza_programacion THEN
    IF v_programacion.estado_planeacion = 'completada' THEN
      RAISE EXCEPTION 'proceso_completado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_proceso' THEN
      RAISE EXCEPTION 'programacion_ya_en_proceso' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'bloqueada' THEN
      RAISE EXCEPTION 'proceso_pausado_reanudar' USING ERRCODE = 'check_violation';
    END IF;
    IF v_programacion.estado_planeacion = 'en_preparacion' THEN
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET programacion_id = v_programacion.id,
          actualizado_en = now()
      WHERE reclamo.id = p_reclamo_id;
      RETURN v_programacion.id;
    END IF;
    -- `programada` o `cancelada`: se revalida recurso y capacidad para el día
    -- del reclamo antes de reactivarla.
    v_programacion_id := v_programacion.id;
    v_recurso_preferido := v_programacion.recurso_id;
  END IF;

  v_area_macro := privado.area_planeacion_catalogo(v_partida.area_trabajo_codigo);

  -- C18/A3: el respaldo exige el grupo de equipo que pide la operación y, si el
  -- ruteo no lo capturó, el grupo del equipo ya programado. Nunca se cambia a
  -- una máquina de otra familia.
  v_grupo_id := privado.grupo_equipo_requerido_operacion(v_reclamo.meta_proceso_id);

  IF v_grupo_id IS NULL AND v_recurso_preferido IS NOT NULL THEN
    SELECT recurso.grupo_equipo_id INTO v_grupo_id
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.id = v_recurso_preferido;
  END IF;

  IF v_grupo_id IS NOT NULL THEN
    SELECT grupo.nombre INTO v_grupo_nombre
    FROM public.grupos_equipo AS grupo
    WHERE grupo.id = v_grupo_id;
  END IF;

  -- El día cerrado se explica antes de hablar de equipos.
  IF privado.jornada_laboral_dia(v_reclamo.fecha) <= 0 THEN
    RAISE EXCEPTION 'jornada_cerrada: el % no tiene jornada laboral; elige de lunes a sábado', v_reclamo.fecha
      USING ERRCODE = 'check_violation';
  END IF;

  -- Locks deterministas: todos los candidatos del grupo, por código, antes de
  -- evaluar. Así dos arranques simultáneos no se bloquean en orden inverso.
  PERFORM 1
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.activo = true
    AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
    AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
  ORDER BY recurso.codigo
  FOR UPDATE;

  v_recurso_id := NULL;

  FOR v_recurso IN
    SELECT recurso.id,
           recurso.codigo,
           privado.obtener_capacidad_efectiva_recurso_turno(
             recurso.id, v_reclamo.fecha, v_reclamo.turno
           ) AS capacidad,
           coalesce((
             SELECT sum(programacion.horas_estimadas)
             FROM public.programacion_areas AS programacion
             WHERE programacion.recurso_id = recurso.id
               AND programacion.fecha_programada = v_reclamo.fecha
               AND programacion.estado_planeacion NOT IN ('cancelada', 'completada')
               AND programacion.id IS DISTINCT FROM v_programacion_id
           ), 0) AS horas_programadas,
           EXISTS (
             SELECT 1
             FROM public.programacion_areas AS ocupada
             WHERE ocupada.recurso_id = recurso.id
               AND ocupada.estado_planeacion IN ('en_preparacion', 'en_proceso')
               AND ocupada.id IS DISTINCT FROM v_programacion_id
           ) AS ocupado
    FROM public.recursos_planeacion AS recurso
    WHERE recurso.activo = true
      AND (v_area_macro IS NULL OR recurso.area = v_area_macro)
      AND (v_grupo_id IS NULL OR recurso.grupo_equipo_id = v_grupo_id)
    ORDER BY ((recurso.id = v_recurso_preferido) IS TRUE) DESC, recurso.codigo
  LOOP
    v_total_equipos := v_total_equipos + 1;

    IF v_recurso.capacidad <= 0 THEN
      v_sin_capacidad := concat_ws(', ', nullif(v_sin_capacidad, ''), v_recurso.codigo);
      CONTINUE;
    END IF;
    v_equipos_con_capacidad := v_equipos_con_capacidad + 1;

    IF v_recurso.ocupado THEN
      v_detalle_ocupados := concat_ws(
        '; ',
        nullif(v_detalle_ocupados, ''),
        privado.detalle_ocupacion_recurso(
          v_recurso.id, v_reclamo.fecha, p_operador_id, v_programacion_id
        )
      );
      CONTINUE;
    END IF;

    v_libre := v_recurso.capacidad - v_recurso.horas_programadas;

    IF v_libre >= v_reclamo.horas_estimadas THEN
      v_recurso_id := v_recurso.id;
      EXIT;
    END IF;

    IF v_mejor_libre IS NULL OR v_libre > v_mejor_libre THEN
      v_mejor_libre := v_libre;
      v_mejor_recurso := v_recurso.codigo;
      v_mejor_capacidad := v_recurso.capacidad;
      v_mejor_cargado := v_recurso.horas_programadas;
    END IF;
  END LOOP;

  IF v_recurso_id IS NULL THEN
    IF v_total_equipos = 0 THEN
      v_mensaje := format(
        'no hay equipos activos del grupo %s %s; configura un equipo activo o corrige el grupo del proceso',
        coalesce(v_grupo_nombre, 'requerido'),
        CASE WHEN v_area_macro IS NOT NULL
          THEN 'en el área ' || v_area_macro
          ELSE 'en la planta'
        END
      );
      RAISE EXCEPTION 'recurso_sin_equipos: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    IF v_equipos_con_capacidad = 0 THEN
      v_mensaje := format(
        'el %s no hay disponibilidad: %s sin capacidad configurada (jornada cerrada o excepción de capacidad); elige otro día',
        v_reclamo.fecha,
        coalesce(v_sin_capacidad, 'los equipos del grupo')
      );
      RAISE EXCEPTION 'recurso_sin_capacidad: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    IF v_detalle_ocupados IS NOT NULL THEN
      v_mensaje := v_detalle_ocupados || '.';
      IF v_mejor_recurso IS NOT NULL THEN
        v_mensaje := v_mensaje || format(
          ' El equipo libre con más hueco es %s: %s h libres de %s h (%s h ya programadas) el %s.',
          v_mejor_recurso,
          round(greatest(v_mejor_libre, 0), 2),
          round(v_mejor_capacidad, 2),
          round(v_mejor_cargado, 2),
          v_reclamo.fecha
        );
      END IF;
      v_mensaje := v_mensaje
        || ' No puedes cancelar el trabajo en curso de otro operador desde aquí:'
        || ' pide que lo cierren o lo pausen, o reprograma esta operación.';
      RAISE EXCEPTION 'recurso_ocupado: %', v_mensaje USING ERRCODE = 'check_violation';
    END IF;

    v_mensaje := format(
      'el proceso requiere %s h y %s solo tiene %s h libres el %s (capacidad %s h, ya programadas %s h); elige otro día o libera capacidad',
      v_reclamo.horas_estimadas,
      coalesce(v_mejor_recurso, 'el equipo'),
      round(greatest(coalesce(v_mejor_libre, 0), 0), 2),
      v_reclamo.fecha,
      round(coalesce(v_mejor_capacidad, 0), 2),
      round(coalesce(v_mejor_cargado, 0), 2)
    );
    RAISE EXCEPTION 'recurso_capacidad_excedida: %', v_mensaje USING ERRCODE = 'check_violation';
  END IF;

  IF v_programacion_id IS NULL THEN
    INSERT INTO public.programacion_areas (
      orden_id, partida_id, recurso_id, secuencia, fecha_programada, turno,
      horas_estimadas, orden_prioridad, estado_planeacion, meta_proceso_id
    ) VALUES (
      v_reclamo.orden_id, v_reclamo.partida_id, v_recurso_id,
      v_secuencia, v_reclamo.fecha, v_reclamo.turno,
      v_reclamo.horas_estimadas, v_prioridad, 'en_preparacion',
      v_reclamo.meta_proceso_id
    )
    RETURNING id INTO v_programacion_id;
  ELSE
    UPDATE public.programacion_areas AS programacion
    SET recurso_id = v_recurso_id,
        fecha_programada = v_reclamo.fecha,
        turno = v_reclamo.turno,
        horas_estimadas = v_reclamo.horas_estimadas,
        orden_prioridad = v_prioridad,
        estado_planeacion = 'en_preparacion',
        actualizado_en = now()
    WHERE programacion.id = v_programacion_id;
  END IF;

  UPDATE public.reclamos_proceso_operador AS reclamo
  SET programacion_id = v_programacion_id,
      actualizado_en = now()
  WHERE reclamo.id = p_reclamo_id;

  RETURN v_programacion_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'recurso_ocupado: otro proceso tomó el equipo en el mismo instante; actualiza y vuelve a intentar' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.preparar_reclamo_operador(uuid, uuid) IS
  'C25: prepara la operación sobre un equipo libre del grupo requerido y explica con causa exacta cuándo no hay disponibilidad (día cerrado, sin equipos, sin capacidad, ocupado o capacidad excedida).';
