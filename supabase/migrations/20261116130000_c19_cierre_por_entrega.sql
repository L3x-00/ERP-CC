-- =============================================================================
-- C19 — Cierre por entrega total y cierre administrativo posterior (M5)
--
-- Decisión del PO (2026-11-16): al entregar el 100 % de las cantidades
-- solicitadas la orden pasa a CERRADA en la misma transacción, sin pasos
-- manuales. El cierre administrativo (costo y margen) se conserva como paso
-- separado: completa `cerrada_admin_en`/`cerrada_admin_por` sobre la orden que
-- ya cerró la entrega, y sigue siendo la única vía cuando Producción completa
-- sin que se haya entregado todo.
--
--   * `privado.pendientes_entrega_orden` concentra la regla de entrega vigente
--     (notas ANULADAS no cuentan).
--   * Trigger `trg_partidas_nota_cerrar_orden`: PRODUCCION_COMPLETADA → CERRADA
--     cuando la entrega cubre el 100 %, con evento de bitácora.
--   * Trigger `trg_notas_entrega_reabrir_orden`: si una nota que cerraba la
--     orden se anula y vuelve a haber pendiente, regresa a
--     PRODUCCION_COMPLETADA (nunca revierte un cierre administrativo cerrado).
--   * `cerrar_orden_administrativa` acepta CERRADA con `cerrada_admin_en`
--     nulo y cuenta solo renglones de notas vigentes.
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Regla única de pendientes de entrega (notas vigentes).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.pendientes_entrega_orden(p_orden_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
    AND coalesce((
      SELECT sum(renglon.cantidad_entregada)
      FROM public.partidas_nota_entrega AS renglon
      JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
      WHERE renglon.partida_id = partida.id
        AND nota.estado = 'VIGENTE'
    ), 0) < partida.cantidad_solicitada;
$$;

COMMENT ON FUNCTION privado.pendientes_entrega_orden(uuid) IS
  'C19: partidas de la orden con entrega vigente incompleta (solicitada − entregada > 0).';

REVOKE ALL ON FUNCTION privado.pendientes_entrega_orden(uuid)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. La entrega completa cierra la orden.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.cerrar_orden_por_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nota public.notas_entrega%ROWTYPE;
  v_filas integer;
BEGIN
  SELECT * INTO v_nota
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF NOT FOUND OR v_nota.estado IS DISTINCT FROM 'VIGENTE' THEN
    RETURN NEW;
  END IF;

  IF privado.pendientes_entrega_orden(v_nota.orden_id) <> 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'CERRADA'
  WHERE orden.id = v_nota.orden_id
    AND orden.estado_sii = 'PRODUCCION_COMPLETADA'
    AND orden.cerrada_admin_en IS NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas > 0 THEN
    INSERT INTO public.orden_eventos_cambio (
      orden_id, tipo, detalle, actor_id
    ) VALUES (
      v_nota.orden_id,
      'cierre_por_entrega',
      jsonb_build_object(
        'estado_anterior', 'PRODUCCION_COMPLETADA',
        'estado_nuevo', 'CERRADA',
        'nota_id', v_nota.id,
        'folio', v_nota.folio,
        'folio_sii', v_nota.folio_sii
      ),
      v_nota.creado_por
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.cerrar_orden_por_entrega() IS
  'C19/M5: al registrar la entrega que cubre el 100 % solicitado, la orden pasa de PRODUCCION_COMPLETADA a CERRADA y se bitácora el evento.';

REVOKE ALL ON FUNCTION privado.cerrar_orden_por_entrega()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_partidas_nota_cerrar_orden ON public.partidas_nota_entrega;
CREATE TRIGGER trg_partidas_nota_cerrar_orden
  AFTER INSERT ON public.partidas_nota_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.cerrar_orden_por_entrega();

-- -----------------------------------------------------------------------------
-- 3. Anular una nota reabre la orden que cerró la entrega.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.reabrir_orden_por_anulacion_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_filas integer;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado
     OR NEW.estado IS DISTINCT FROM 'ANULADA' THEN
    RETURN NEW;
  END IF;

  -- Un cierre administrativo ya confirmado es terminal; no se revierte.
  IF NOT EXISTS (
    SELECT 1
    FROM public.ordenes_produccion AS orden
    WHERE orden.id = NEW.orden_id
      AND orden.estado_sii = 'CERRADA'
      AND orden.cerrada_admin_en IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF privado.pendientes_entrega_orden(NEW.orden_id) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'PRODUCCION_COMPLETADA'
  WHERE orden.id = NEW.orden_id
    AND orden.estado_sii = 'CERRADA'
    AND orden.cerrada_admin_en IS NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas > 0 THEN
    INSERT INTO public.orden_eventos_cambio (
      orden_id, tipo, detalle, actor_id
    ) VALUES (
      NEW.orden_id,
      'reapertura_por_anulacion_entrega',
      jsonb_build_object(
        'estado_anterior', 'CERRADA',
        'estado_nuevo', 'PRODUCCION_COMPLETADA',
        'nota_id', NEW.id,
        'folio', NEW.folio,
        'folio_sii', NEW.folio_sii,
        'motivo_anulacion', NEW.motivo_anulacion
      ),
      NEW.anulada_por
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.reabrir_orden_por_anulacion_entrega() IS
  'C19/M5: anular una nota que había cerrado la entrega devuelve la orden a PRODUCCION_COMPLETADA, salvo que el cierre administrativo ya esté confirmado.';

REVOKE ALL ON FUNCTION privado.reabrir_orden_por_anulacion_entrega()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notas_entrega_reabrir_orden ON public.notas_entrega;
CREATE TRIGGER trg_notas_entrega_reabrir_orden
  AFTER UPDATE OF estado ON public.notas_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.reabrir_orden_por_anulacion_entrega();

-- -----------------------------------------------------------------------------
-- 4. Cierre administrativo: completa el de la entrega y cuenta solo vigentes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_orden_administrativa(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, estado_sii text, cerrada_admin_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_cerrar_admin') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;

  -- M5: una orden CERRADA por entrega total aún debe registrar el cierre
  -- administrativo (costo y margen). Si ya lo tiene, es un cierre duplicado.
  IF v_orden.estado_sii = 'CERRADA' THEN
    IF v_orden.cerrada_admin_en IS NOT NULL THEN
      RAISE EXCEPTION 'orden_ya_cerrada' USING ERRCODE = '23514';
    END IF;
  ELSIF v_orden.estado_sii NOT IN ('PRODUCCION_COMPLETADA') THEN
    RAISE EXCEPTION 'transicion_invalida' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;

  IF p_actualizado_en IS NULL OR v_orden.actualizado_en IS DISTINCT FROM p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'orden_sin_partidas' USING ERRCODE = '23514';
  END IF;

  -- Cierre administrativo = 100 % de las cantidades entregadas en notas
  -- vigentes; el cobro no participa (puede cerrarse con AR pendiente).
  IF privado.pendientes_entrega_orden(p_orden_id) <> 0 THEN
    RAISE EXCEPTION 'orden_no_entregada_completa' USING ERRCODE = '23514';
  END IF;

  UPDATE public.ordenes_produccion AS orden
  SET estado_sii = 'CERRADA',
      cerrada_admin_en = now(),
      cerrada_admin_por = p_actor_id
  WHERE orden.id = p_orden_id;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    p_orden_id,
    'cierre_administrativo',
    jsonb_build_object(
      'estado_anterior', v_orden.estado_sii,
      'estado_nuevo', 'CERRADA',
      'cierre_previo_por_entrega', v_orden.estado_sii = 'CERRADA'
    ),
    NULL, p_actor_id, p_correlation_id
  );

  RETURN QUERY
  SELECT orden.id, orden.estado_sii, orden.cerrada_admin_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid) IS
  'SII-B5.3 + C19/M5: completa el cierre administrativo al 100 % entregado (también sobre una orden ya CERRADA por la entrega total), separado del cobro y del cierre de producción. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_orden_administrativa(uuid, timestamptz, uuid, uuid)
  TO service_role;
