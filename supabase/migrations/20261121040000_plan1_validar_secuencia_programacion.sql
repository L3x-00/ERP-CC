-- PLAN-1: no se puede programar una operación posterior sin piezas del previo.
--
-- La regla ya existe en Producción (privado.piezas_disponibles_proceso y
-- proceso_previo_sin_piezas), pero los RPC de Planeación no la consultaban: se
-- podía reservar capacidad para Doblado con Corte sin producir nada y el
-- bloqueo aparecía después, al iniciar sesión.
--
-- Un trigger sobre programacion_areas cubre de una vez programar, reprogramar y
-- programación multidia sin reescribir las RPC auditadas. Solo aplica a filas
-- con meta conocida, secuencia > 1 y estado todavía no terminal.

CREATE OR REPLACE FUNCTION privado.validar_secuencia_programacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secuencia integer;
  v_proceso text;
  v_previas numeric;
BEGIN
  -- Solo programaciones hechas desde Planeación llevan prioridad > 0; las
  -- filas internas que crea Producción al preparar una sesión no se validan
  -- aquí (esa validación ya existe al iniciar).
  IF NEW.meta_proceso_id IS NULL
     OR coalesce(NEW.orden_prioridad, 0) <= 0
     OR NEW.estado_planeacion IN ('completada', 'cancelada') THEN
    RETURN NEW;
  END IF;

  SELECT meta.secuencia, coalesce(meta.nombre, 'el proceso anterior')
  INTO v_secuencia, v_proceso
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = NEW.meta_proceso_id;

  IF v_secuencia IS NULL OR v_secuencia <= 1 THEN
    RETURN NEW;
  END IF;

  v_previas := privado.piezas_disponibles_proceso(NEW.meta_proceso_id);
  IF v_previas IS NULL OR v_previas <= 0 THEN
    RAISE EXCEPTION 'proceso_previo_sin_piezas' USING ERRCODE = 'check_violation',
      DETAIL = v_proceso;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_secuencia_programacion ON public.programacion_areas;
CREATE TRIGGER trg_validar_secuencia_programacion
BEFORE INSERT OR UPDATE OF meta_proceso_id, estado_planeacion
ON public.programacion_areas
FOR EACH ROW EXECUTE FUNCTION privado.validar_secuencia_programacion();

COMMENT ON FUNCTION privado.validar_secuencia_programacion() IS
  'PLAN-1: impide programar una operación posterior sin piezas terminadas por el proceso previo.';
