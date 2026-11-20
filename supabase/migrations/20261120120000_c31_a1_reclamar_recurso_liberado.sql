-- C31/A1 (2026-11-20): reclamar un recurso liberado devuelve la operación al
-- pool de verdad y deja traza verificable para el operador.
--
-- Hallazgo A1: C22 marcaba `recurso_liberado` y devolvía la programación a
-- `programada`, pero no cerraba el reclamo ni limpiaba `operador_asignado_id`.
-- La operación seguía tomada y otro operador no podía reclamarla.
--
-- Reglas de esta migración:
--   * Misma firma de 4 argumentos; no se añade un parámetro de opción.
--   * El reclamo se cierra siempre; si la partida ya no tiene reclamos activos
--     se limpia su asignación (incluido el caso sin reclamo previo).
--   * Se persisten actor, fecha, correlation y número de reclamos cerrados en
--     la sesión para que el operador vea qué administración actuó y cuándo.
--   * Orden de locks: reclamo(s) → partida → orden → programación → recurso →
--     sesión. Coincide con `liberar_reclamo_operador` (C10) para evitar
--     esperas circulares entre la liberación administrativa y la del operador.
--   * Idempotencia ligada a (correlation, sesión, recurso, actor). Sin
--     correlation se conserva el error `recurso_ya_reclamado` de C22.
--   * No se relaja B2, RLS ni la pausa como historial.
--
-- Aplicar solo en local; el remoto lo controla el PO.
-- =============================================================================

ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS recurso_liberado_por uuid
    REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS recurso_liberado_en timestamptz,
  ADD COLUMN IF NOT EXISTS recurso_liberado_correlation_id uuid,
  ADD COLUMN IF NOT EXISTS recurso_liberado_reclamos_count integer;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sesiones_recurso_liberado_correlation
  ON public.sesiones_trabajo (recurso_liberado_correlation_id)
  WHERE recurso_liberado_correlation_id IS NOT NULL;

COMMENT ON COLUMN public.sesiones_trabajo.recurso_liberado_por IS
  'C31/A1: actor (admin o gerente) que liberó la máquina de esta pausa.';
COMMENT ON COLUMN public.sesiones_trabajo.recurso_liberado_en IS
  'C31/A1: instante exacto en que se liberó la máquina.';
COMMENT ON COLUMN public.sesiones_trabajo.recurso_liberado_correlation_id IS
  'C31/A1: identificador de la petición original; hace idempotente la doble pulsación.';
COMMENT ON COLUMN public.sesiones_trabajo.recurso_liberado_reclamos_count IS
  'C31/A1: número de reclamos cerrados por esta liberación (0 en el caso heredado).';

-- C4.3/C20: `authenticated` tiene GRANT SELECT por columnas. Sin estas cuatro
-- líneas PostgREST responde "permission denied for table" (CUELLOS §13).
GRANT SELECT (
  recurso_liberado_por, recurso_liberado_en,
  recurso_liberado_correlation_id, recurso_liberado_reclamos_count
) ON TABLE public.sesiones_trabajo TO authenticated;

-- Invariante durable: si una sesión vuelve a estar en uso, su traza de
-- liberación desaparece y el correlation queda libre para una petición nueva.
CREATE OR REPLACE FUNCTION privado.limpiar_traza_recurso_liberado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.recurso_liberado = false THEN
    NEW.recurso_liberado_por := NULL;
    NEW.recurso_liberado_en := NULL;
    NEW.recurso_liberado_correlation_id := NULL;
    NEW.recurso_liberado_reclamos_count := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.limpiar_traza_recurso_liberado()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_limpiar_traza_recurso_liberado ON public.sesiones_trabajo;
CREATE TRIGGER trg_limpiar_traza_recurso_liberado
  BEFORE UPDATE OF recurso_liberado ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION privado.limpiar_traza_recurso_liberado();

-- -----------------------------------------------------------------------------
-- RPC: misma firma, ahora con cierre de reclamo y traza idempotente.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reclamar_recurso_liberado(
  p_recurso_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_sesion_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_original uuid;
  v_reclamo record;
  v_sesion_id uuid;
  v_partida_id uuid;
  v_orden_id uuid;
  v_estado_planeacion text;
  v_actor_nombre text;
  v_liberado_en timestamptz;
  v_ya_aplicado boolean := false;
  v_reclamos_count integer := 0;
BEGIN
  IF p_recurso_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reclamacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'gestionar_planeacion')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_reclamar_recurso' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(usuario.nombre_completo, usuario.email)
  INTO v_actor_nombre
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_actor_id;

  -- Idempotencia: la misma petición devuelve la traza persistida. La
  -- autorización ya se comprobó, de modo que un replay no filtra datos a un
  -- actor sin permiso.
  IF p_correlation_id IS NOT NULL THEN
    SELECT sesion.* INTO v_sesion
    FROM public.sesiones_trabajo AS sesion
    JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
    WHERE sesion.recurso_liberado_correlation_id = p_correlation_id;

    IF FOUND THEN
      SELECT programacion.recurso_id
      INTO v_recurso_original
      FROM public.programacion_areas AS programacion
      WHERE programacion.id = v_sesion.programacion_id;

      IF (p_sesion_id IS NOT NULL AND v_sesion.id <> p_sesion_id)
         OR v_recurso_original IS DISTINCT FROM p_recurso_id
         OR v_sesion.recurso_liberado_por IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'conflicto_idempotencia'
          USING ERRCODE = '22023',
                DETAIL = format('La petición pertenece a la sesión %s.', v_sesion.id);
      END IF;

      v_ya_aplicado := true;
      v_sesion_id := v_sesion.id;
      v_partida_id := v_sesion.partida_id;
      v_orden_id := v_sesion.orden_id;
      v_reclamos_count := coalesce(v_sesion.recurso_liberado_reclamos_count, 0);
      IF v_sesion.recurso_liberado_por IS NOT NULL THEN
        SELECT coalesce(usuario.nombre_completo, usuario.email)
        INTO v_actor_nombre
        FROM public.usuarios AS usuario
        WHERE usuario.id = v_sesion.recurso_liberado_por;
      ELSE
        v_actor_nombre := NULL;
      END IF;
    END IF;
  END IF;

  IF NOT v_ya_aplicado THEN
    -- Primera lectura sin lock solo para localizar la pausa y su programación.
    IF p_sesion_id IS NOT NULL THEN
      SELECT sesion.* INTO v_sesion
      FROM public.sesiones_trabajo AS sesion
      JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
      WHERE sesion.id = p_sesion_id
        AND programacion.recurso_id = p_recurso_id;
    ELSE
      SELECT sesion.* INTO v_sesion
      FROM public.sesiones_trabajo AS sesion
      JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
      JOIN public.catalogo_motivos_pausa AS motivo ON motivo.codigo = sesion.motivo_pausa_codigo
      WHERE programacion.recurso_id = p_recurso_id
        AND programacion.estado_planeacion IN ('bloqueada', 'programada')
        AND sesion.estado_sesion = 'pausada'
        AND sesion.recurso_liberado = false
        AND motivo.libera_maquina
        AND sesion.fecha_fin <= now() - interval '60 minutes'
      ORDER BY sesion.fecha_fin ASC
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
    END IF;

    -- Replay de una liberación anterior a esta corrección: no hay actor ni
    -- fecha guardados, y se dice exactamente eso en lugar de inventarlos.
    IF v_sesion.recurso_liberado THEN
      IF p_sesion_id IS NULL OR p_correlation_id IS NULL
         OR v_sesion.recurso_liberado_correlation_id IS NOT NULL THEN
        RAISE EXCEPTION 'recurso_ya_reclamado' USING ERRCODE = '23514';
      END IF;
      v_ya_aplicado := true;
      v_sesion_id := v_sesion.id;
      v_partida_id := v_sesion.partida_id;
      v_orden_id := v_sesion.orden_id;
      v_reclamos_count := 0;
      v_actor_nombre := NULL;
    END IF;
  END IF;

  IF NOT v_ya_aplicado THEN
    v_sesion_id := v_sesion.id;
    v_partida_id := v_sesion.partida_id;
    v_orden_id := v_sesion.orden_id;

    -- Contrato de locks: reclamo → partida → orden → programación → recurso →
    -- sesión. `liberar_reclamo_operador` toma reclamo → partida, así que ambas
    -- rutas avanzan en el mismo orden y no pueden interbloquearse.
    FOR v_reclamo IN
      SELECT reclamo.id
      FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.partida_id = v_partida_id
        AND reclamo.estado = 'activo'
      ORDER BY reclamo.id
      FOR UPDATE
    LOOP
      NULL;
    END LOOP;

    PERFORM 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_partida_id
    FOR UPDATE;

    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = v_orden_id
    FOR UPDATE;

    SELECT * INTO v_programacion
    FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_sesion.programacion_id
      AND programacion.recurso_id = p_recurso_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM public.recursos_planeacion AS recurso
    WHERE recurso.id = p_recurso_id
    FOR UPDATE;

    SELECT * INTO v_sesion
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = v_sesion_id
    FOR UPDATE;

    IF NOT FOUND OR v_sesion.programacion_id <> v_programacion.id THEN
      RAISE EXCEPTION 'sin_sesion_liberable' USING ERRCODE = '23514';
    END IF;
    -- La comprobación temprana por correlation ocurre antes de los locks; dos
    -- clics simultáneos pueden llegar los dos antes de que el primero confirme.
    -- Bajo lock, el que lleve el MISMO correlation es el mismo clic y debe
    -- devolver el resultado persistido en vez de un error.
    IF v_sesion.recurso_liberado THEN
      IF p_correlation_id IS NOT NULL
         AND v_sesion.recurso_liberado_correlation_id = p_correlation_id THEN
        v_ya_aplicado := true;
        v_reclamos_count := coalesce(v_sesion.recurso_liberado_reclamos_count, 0);
        IF v_sesion.recurso_liberado_por IS NOT NULL THEN
          SELECT coalesce(usuario.nombre_completo, usuario.email)
          INTO v_actor_nombre
          FROM public.usuarios AS usuario
          WHERE usuario.id = v_sesion.recurso_liberado_por;
        ELSE
          v_actor_nombre := NULL;
        END IF;
      ELSE
        RAISE EXCEPTION 'recurso_ya_reclamado' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NOT v_ya_aplicado THEN
    IF v_sesion.estado_sesion <> 'pausada' THEN
      RAISE EXCEPTION 'sesion_no_pausada' USING ERRCODE = '23514';
    END IF;
    IF v_sesion.motivo_pausa_codigo IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.catalogo_motivos_pausa AS motivo
      WHERE motivo.codigo = v_sesion.motivo_pausa_codigo
        AND motivo.libera_maquina
    ) THEN
      RAISE EXCEPTION 'motivo_no_liberable' USING ERRCODE = '23514';
    END IF;
    IF v_sesion.fecha_fin IS NULL OR v_sesion.fecha_fin > now() - interval '60 minutes' THEN
      RAISE EXCEPTION 'pausa_reciente' USING ERRCODE = '23514';
    END IF;
    IF v_programacion.estado_planeacion NOT IN ('bloqueada', 'programada', 'en_preparacion') THEN
      RAISE EXCEPTION 'programacion_no_liberable' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sesiones_trabajo AS posterior
      WHERE posterior.programacion_id = v_sesion.programacion_id
        AND posterior.id <> v_sesion.id
        AND (posterior.creado_en, posterior.id) > (v_sesion.creado_en, v_sesion.id)
    ) THEN
      RAISE EXCEPTION 'pausa_ya_superada' USING ERRCODE = '23514';
    END IF;

    -- Cierre de los reclamos de esta programación. Se cuentan explícitamente
    -- para que el mensaje diga 0, 1 o N y nunca mienta.
    FOR v_reclamo IN
      SELECT reclamo.id
      FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.programacion_id = v_programacion.id
        AND reclamo.estado = 'activo'
      ORDER BY reclamo.id
      FOR UPDATE
    LOOP
      UPDATE public.reclamos_proceso_operador AS reclamo
      SET estado = 'liberado',
          actualizado_en = now()
      WHERE reclamo.id = v_reclamo.id;
      v_reclamos_count := v_reclamos_count + 1;
    END LOOP;

    -- Una partida sin reclamos activos no debe conservar responsable asignado.
    IF NOT EXISTS (
      SELECT 1 FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.partida_id = v_partida_id
        AND reclamo.estado = 'activo'
    ) THEN
      UPDATE public.partidas_orden_produccion AS partida
      SET operador_asignado_id = NULL
      WHERE partida.id = v_partida_id;
    END IF;

    -- La pausa sigue siendo historial: no se finaliza, no se inventa consumo.
    v_liberado_en := now();
    UPDATE public.sesiones_trabajo AS sesion
    SET recurso_liberado = true,
        recurso_liberado_por = p_actor_id,
        recurso_liberado_en = v_liberado_en,
        recurso_liberado_correlation_id = p_correlation_id,
        recurso_liberado_reclamos_count = v_reclamos_count
    WHERE sesion.id = v_sesion.id;

    -- La variable v_sesion se usa para construir la respuesta; se sincroniza
    -- con lo recién persistido para que el JSON no devuelva NULL.
    v_sesion.recurso_liberado_por := p_actor_id;
    v_sesion.recurso_liberado_en := v_liberado_en;

    v_estado_planeacion := CASE
      WHEN v_programacion.estado_planeacion = 'bloqueada' THEN 'programada'
      ELSE v_programacion.estado_planeacion
    END;

    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = v_estado_planeacion
    WHERE programacion.id = v_programacion.id;

    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (v_sesion.partida_id, p_actor_id, 'fin', 'Recurso liberado por administración');
    END IF;
  END IF;

  SELECT programacion.estado_planeacion
  INTO v_estado_planeacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = v_sesion.programacion_id;

  RETURN jsonb_build_object(
    'sesion_id', v_sesion.id,
    'recurso_id', p_recurso_id,
    'orden_id', v_sesion.orden_id,
    'partida_id', v_sesion.partida_id,
    'motivo_pausa_codigo', v_sesion.motivo_pausa_codigo,
    'pausada_desde', v_sesion.fecha_fin,
    'estado_planeacion', v_estado_planeacion,
    'ya_aplicado', v_ya_aplicado,
    'reclamos_liberados', v_reclamos_count,
    'liberado_por', v_sesion.recurso_liberado_por,
    'liberado_por_nombre', v_actor_nombre,
    'liberado_en', v_sesion.recurso_liberado_en
  );
END;
$$;

COMMENT ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid) IS
  'C31/A1: libera la máquina, cierra los reclamos activos de la operación, limpia la asignación huérfana y guarda actor/fecha/correlation para que el operador vea la acción. Pausa historial, programación programada. Solo service_role.';

REVOKE ALL ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_recurso_liberado(uuid, uuid, uuid, uuid)
  TO service_role;
