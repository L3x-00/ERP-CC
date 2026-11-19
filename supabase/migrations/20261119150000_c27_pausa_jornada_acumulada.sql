-- C27 - Pausa automática por jornada acumulada del día.
--
-- Defecto corregido: el barrido medía solo las horas netas de la sesión en
-- curso contra la jornada del turno. Al reanudar el mismo día se abría una
-- sesión nueva cuyo reloj volvía a empezar, de modo que el operador podía
-- acumular más de 8 h netas sin que la pausa automática lo detuviera. El
-- cierre sí sumaba el día y rechazaba con «horas_extra_sin_autorizacion»,
-- dejando al operador sin entender la causa.
--
-- La jornada es una sola por día laboral (America/Tijuana): el corte del reloj
-- ocurre cuando la suma de las sesiones ya cerradas del día más lo transcurrido
-- en la sesión activa alcanza la jornada del turno. Si el día ya estaba
-- agotado al abrir la sesión, el exceso es tiempo extra y se gobierna con la
-- autorización del cierre; el barrido no la pausa en el instante de inicio para
-- no impedir el trabajo autorizado.
CREATE OR REPLACE FUNCTION public.pausar_sesiones_jornada_excedida(
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sesion_id uuid,
  orden_id uuid,
  programacion_id uuid,
  horas_netas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion record;
  v_jornada numeric;
  v_horas_brutas numeric;
  v_horas_netas numeric;
  v_horas_dia_previas numeric;
  v_restante numeric;
  v_dia date;
  v_bajo timestamptz;
  v_alto timestamptz;
  v_medio timestamptz;
  v_iteracion integer;
  v_fin_jornada timestamptz;
BEGIN
  FOR v_sesion IN
    SELECT sesion.id, sesion.orden_id, sesion.partida_id, sesion.operador_id,
           sesion.programacion_id, sesion.fecha_inicio, sesion.notas,
           programacion.recurso_id, programacion.fecha_programada, programacion.turno
    FROM public.sesiones_trabajo AS sesion
    JOIN public.programacion_areas AS programacion
      ON programacion.id = sesion.programacion_id
    WHERE sesion.estado_sesion = 'activa'
      AND (p_operador_id IS NULL OR sesion.operador_id = p_operador_id)
    ORDER BY sesion.fecha_inicio
  LOOP
    v_jornada := privado.obtener_jornada_recurso_turno(
      v_sesion.recurso_id, v_sesion.fecha_programada, v_sesion.turno);

    -- C27: la jornada se consume por día, no por sesión. Las sesiones
    -- pausadas/finalizadas del mismo día ya gastaron su parte; la sesión en
    -- curso solo dispone de lo que resta.
    v_dia := (v_sesion.fecha_inicio AT TIME ZONE 'America/Tijuana')::date;
    v_horas_dia_previas := coalesce(
      privado.horas_netas_operador_dia(v_sesion.operador_id, v_dia), 0);
    v_restante := v_jornada - v_horas_dia_previas;

    -- El día ya está agotado: este trabajo es tiempo extra y exige
    -- autorización en el cierre. Pausarlo al inicio impediría el trabajo
    -- autorizado, así que el barrido no interviene.
    CONTINUE WHEN v_restante <= 0;

    SELECT calculo.horas_brutas, calculo.horas_netas
    INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, now()) AS calculo;

    CONTINUE WHEN coalesce(v_horas_netas, 0) < v_restante;

    -- Instante exacto en que esta sesión agota lo que resta de la jornada.
    v_bajo := v_sesion.fecha_inicio;
    v_alto := now();
    FOR v_iteracion IN 1..40 LOOP
      v_medio := v_bajo + (v_alto - v_bajo) / 2;
      SELECT calculo.horas_netas INTO v_horas_netas
      FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_medio) AS calculo;
      IF v_horas_netas >= v_restante THEN
        v_alto := v_medio;
      ELSE
        v_bajo := v_medio;
      END IF;
    END LOOP;
    v_fin_jornada := v_alto;

    SELECT calculo.horas_brutas, calculo.horas_netas
    INTO v_horas_brutas, v_horas_netas
    FROM privado.calcular_horas_sesion_trabajo(v_sesion.fecha_inicio, v_fin_jornada) AS calculo;

    -- Mismo orden de locks que el resto del motor de sesiones:
    -- partida -> orden -> programación -> sesión.
    PERFORM 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = v_sesion.partida_id
    FOR UPDATE;
    PERFORM 1 FROM public.ordenes_produccion AS orden
    WHERE orden.id = v_sesion.orden_id
    FOR UPDATE;
    PERFORM 1 FROM public.programacion_areas AS programacion
    WHERE programacion.id = v_sesion.programacion_id
    FOR UPDATE;
    PERFORM 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = v_sesion.id AND sesion.estado_sesion = 'activa'
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.sesiones_trabajo AS sesion
    SET fecha_fin = v_fin_jornada,
        horas_brutas = v_horas_brutas,
        horas_netas = v_horas_netas,
        piezas_producidas = 0,
        motivo_pausa = 'otro',
        motivo_pausa_codigo = 'FIN_JORNADA',
        motivo_pausa_nota = 'Pausa automática al cumplir la jornada del turno.',
        notas = nullif(concat_ws(' · ', nullif(btrim(sesion.notas), ''),
          'Pausa automática por jornada'), ''),
        pendiente_actualizacion_avance = true,
        fecha_fin_declarada = NULL,
        estado_sesion = 'pausada'
    WHERE sesion.id = v_sesion.id;

    -- C23: el total de la partida se deriva de las sesiones; no se acumula.
    PERFORM privado.recalcular_tiempo_real_partida(v_sesion.partida_id);

    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'bloqueada'
    WHERE programacion.id = v_sesion.programacion_id
      AND programacion.estado_planeacion = 'en_proceso'
      AND NOT EXISTS (
        SELECT 1 FROM public.sesiones_trabajo AS otra
        WHERE otra.programacion_id = v_sesion.programacion_id
          AND otra.id <> v_sesion.id
          AND otra.estado_sesion = 'activa'
      );

    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (v_sesion.partida_id, v_sesion.operador_id, 'pausa',
      'Pausa automática al cumplir la jornada del turno');

    sesion_id := v_sesion.id;
    orden_id := v_sesion.orden_id;
    programacion_id := v_sesion.programacion_id;
    horas_netas := v_horas_netas;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid) IS
  'C15/C20/C23/C27: pausa las sesiones que agotan la jornada acumulada del día, deriva las horas de la partida y no bloquea operaciones ya completadas. Solo service_role.';

REVOKE ALL ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_sesiones_jornada_excedida(uuid)
  TO service_role;
