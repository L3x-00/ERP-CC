-- =============================================================================
-- C8.5 — Eventos de negocio de la Orden (O-13 «Sí»)
-- =============================================================================
-- La Actividad de la ficha debe registrar el ciclo comercial: Planificada,
-- Liberada/Lista (ya existe «orden_liberada»), Producción iniciada/completada,
-- Cancelada y Entregada. Los eventos de alta (orden_creada,
-- orden_interna_creada), liberación, ajustes y cierre ya existen (B5/B1).
-- Esta migración emite los que faltaban.
--
-- Enfoque (R10 fase 2 revisada): en lugar de redefinir los 3 triggers
-- derivar_* (planificada/en_produccion de 20261007120002 y completada de
-- 20261007120005, definer) ni `registrar_entrega` (C8.4), un SOLO trigger
-- AFTER UPDATE OF estado_sii en ordenes_produccion emite el evento cuando la
-- transición ocurre de verdad (IS DISTINCT FROM: un UPDATE con la misma
-- columna y el mismo valor no emite nada). Los derivar_* solo actualizan con
-- WHERE del estado anterior, así que cada transición genera un evento. Para
-- «Entregada», un trigger AFTER INSERT en notas_entrega (el único escritor es
-- registrar_entrega) emite el evento por nota: parcial y total quedan trazadas.
-- actor_id NULL (los triggers no tienen actor) → la UI lo rotula «Sistema».

-- -----------------------------------------------------------------------------
-- 1. Eventos por transición de estado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.emitir_evento_cambio_estado_orden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo text;
BEGIN
  IF NEW.estado_sii IS NOT DISTINCT FROM OLD.estado_sii THEN
    RETURN NEW;
  END IF;

  v_tipo := CASE NEW.estado_sii
    WHEN 'PLANIFICADA' THEN 'orden_planificada'
    WHEN 'EN_PRODUCCION' THEN 'produccion_iniciada'
    WHEN 'PRODUCCION_COMPLETADA' THEN 'produccion_completada'
    WHEN 'CANCELADA' THEN 'orden_cancelada'
    ELSE NULL
  END;

  IF v_tipo IS NOT NULL THEN
    INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id, correlation_id)
    VALUES (
      NEW.id,
      v_tipo,
      jsonb_build_object('estado_anterior', OLD.estado_sii, 'estado_nuevo', NEW.estado_sii),
      CASE WHEN v_tipo = 'orden_cancelada' THEN NEW.motivo_cancelacion ELSE NULL END,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.emitir_evento_cambio_estado_orden() IS
  'C8.5 / O-13: emite orden_planificada, produccion_iniciada, produccion_completada y orden_cancelada solo cuando estado_sii cambia; permitido para otros estados sin duplicar.';

DROP TRIGGER IF EXISTS trigger_orden_evento_cambio_estado ON public.ordenes_produccion;
CREATE TRIGGER trigger_orden_evento_cambio_estado
  AFTER UPDATE OF estado_sii ON public.ordenes_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.emitir_evento_cambio_estado_orden();

-- -----------------------------------------------------------------------------
-- 2. Evento «Entregada» por nota de entrega (parcial marcada en detalle)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.emitir_evento_nota_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id, correlation_id)
  VALUES (
    NEW.orden_id,
    'orden_entregada',
    jsonb_build_object('folio', NEW.folio, 'folio_sii', NEW.folio_sii, 'es_parcial', NEW.es_parcial),
    CASE WHEN NEW.es_parcial THEN 'Entrega parcial' ELSE 'Entrega total' END,
    NEW.creado_por,
    NEW.solicitud_id
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.emitir_evento_nota_entrega() IS
  'C8.5 / O-13: emite orden_entregada por cada nota de entrega registrada (parcial o total); correlation_id es la solicitud idempotente.';

DROP TRIGGER IF EXISTS trigger_nota_entrega_evento ON public.notas_entrega;
CREATE TRIGGER trigger_nota_entrega_evento
  AFTER INSERT ON public.notas_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.emitir_evento_nota_entrega();

-- -----------------------------------------------------------------------------
-- 3. Permisos (mismo criterio que los triggers de derivación B5)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION privado.emitir_evento_cambio_estado_orden()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION privado.emitir_evento_nota_entrega()
  FROM PUBLIC, anon, authenticated;
