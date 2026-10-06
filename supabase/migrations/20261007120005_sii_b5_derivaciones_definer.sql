-- =============================================================================
-- SII-B5 (ajuste de seguridad) — Triggers de avance con SECURITY DEFINER
--
-- Defecto: `privado.derivar_orden_completada()` es SECURITY INVOKER y llama a
-- `privado.orden_produccion_completa(uuid)`. Cuando un INSERT en
-- `registros_avance_partida` llega con `service_role` (PostgREST), el trigger
-- falla con "permission denied for schema privado" y el avance no se registra.
-- Los caminos de la app pasan por RPC SECURITY DEFINER, pero el contrato del
-- esquema debe ser robusto también para escrituras del servidor.
--
-- Se recrean ambos triggers de avance como SECURITY DEFINER con search_path=''
-- (mismo patrón que `privado.versionar_archivo`). Idempotente.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'estado_sii'
  ) THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007120001_sii_b5_orden_base antes';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.asignar_meta_final_avance_partida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.meta_proceso_id IS NULL THEN
    SELECT meta.id
    INTO NEW.meta_proceso_id
    FROM public.metas_proceso_partida AS meta
    WHERE meta.partida_id = NEW.partida_id
    ORDER BY meta.secuencia DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION privado.derivar_orden_completada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_orden_id uuid;
BEGIN
  SELECT partida.orden_id INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = NEW.partida_id;

  IF v_orden_id IS NOT NULL AND privado.orden_produccion_completa(v_orden_id) THEN
    UPDATE public.ordenes_produccion
    SET estado_sii = 'PRODUCCION_COMPLETADA'
    WHERE id = v_orden_id
      AND estado_sii IN ('CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION');
  END IF;

  RETURN NEW;
END;
$function$;
