-- C31 — Cerrar una pausa atrapada no exige consumo nuevo si la orden ya terminó.
--
-- Hallazgo (O-1126_09): la orden se cerró administrativamente con dos pausas
-- todavía abiertas y sin consumo de material en la partida IT02. El cierre
-- administrativo de esas pausas actualizaba la sesión a 'finalizada' y el
-- trigger B2 exigía consumo de material, aunque la orden ya estaba completada
-- y entregada. El diálogo de cierre no captura material, así que la pausa
-- quedaba imposible de cerrar y la programación seguía en 'bloqueada'.
--
-- Regla C31: el requisito de materia prima protege el cierre normal de una
-- sesión mientras la orden sigue en piso. Cuando la orden ya es terminal
-- (completada/cerrada), finalizar una pausa residual es una corrección
-- administrativa: no inventa consumo ni reabre el flujo de producción.
--
-- No cambia el criterio C30 (solo la primera operación exige materia prima):
-- lo conserva y añade la excepción de órdenes ya terminadas.

CREATE OR REPLACE FUNCTION privado.validar_consumo_cierre_b2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta_proceso_id uuid;
  v_orden_terminada boolean;
BEGIN
  IF NEW.estado_sesion = 'finalizada'
     AND OLD.estado_sesion IS DISTINCT FROM 'finalizada'
     -- C23: descartar una sesión vacía no consume material. El requisito de
     -- consumo aplica solo cuando la sesión declaró piezas producidas.
     AND coalesce(NEW.piezas_producidas, 0) > 0 THEN
    -- C31: una orden ya concluida no puede exigir consumo retroactivo para
    -- limpiar una pausa residual. El cierre normal siempre ocurre antes de que
    -- la orden pase a completada, así que esta excepción no relaja ese flujo.
    SELECT (
      orden.estado IN ('completada', 'cerrada')
      OR orden.estado_sii IN ('PRODUCCION_COMPLETADA', 'CERRADA')
    )
    INTO v_orden_terminada
    FROM public.ordenes_produccion AS orden
    WHERE orden.id = NEW.orden_id;

    IF NOT coalesce(v_orden_terminada, false) THEN
      SELECT programacion.meta_proceso_id INTO v_meta_proceso_id
      FROM public.programacion_areas AS programacion
      WHERE programacion.id = NEW.programacion_id;

      IF privado.partida_requiere_consumo_material_en_proceso(
           NEW.partida_id, v_meta_proceso_id
         ) THEN
        RAISE EXCEPTION 'consumo_material_requerido' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.validar_consumo_cierre_b2() IS
  'B2/C23/C30/C31: exige materia prima al cerrar con piezas solo en la primera operación y mientras la orden siga en piso; una pausa de una orden ya terminada se cierra sin consumo retroactivo.';

REVOKE ALL ON FUNCTION privado.validar_consumo_cierre_b2()
  FROM PUBLIC, anon, authenticated, service_role;
