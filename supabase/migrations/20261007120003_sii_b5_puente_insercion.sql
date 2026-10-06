-- =============================================================================
-- SII-B5 (ajuste) — Puente estado_sii ↔ estado también en INSERT
--
-- Defecto detectado: las órdenes insertadas por caminos legacy/manuales (o
-- fixtures) traen `estado` explícito (p. ej. 'en_proceso') pero `estado_sii`
-- toma el valor por defecto 'CONFIRMADA'. Con el puente solo en UPDATE, el
-- trigger de planificación (programacion→PLANIFICADA) cambiaba `estado_sii`
-- y el puente pisaba `estado` a 'programada', rompiendo el flujo de piso.
--
-- Corrección: BEFORE INSERT OR UPDATE. En INSERT, si solo un lado viene
-- explícito se deriva el otro; si ambos vienen explícitos, manda `estado_sii`
-- (fuente SII) y se sincroniza el legacy.
-- Idempotente: CREATE OR REPLACE + DROP/CREATE TRIGGER.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_produccion' AND column_name = 'estado_sii'
  ) THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007120001_sii_b5_orden_base antes';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION privado.sincronizar_estado_orden_sii()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_legacy_desde_sii text;
  v_sii_desde_legacy text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_sii_desde_legacy := CASE NEW.estado
      WHEN 'borrador' THEN 'CONFIRMADA'
      WHEN 'programada' THEN 'PLANIFICADA'
      WHEN 'en_proceso' THEN 'EN_PRODUCCION'
      WHEN 'pausada' THEN 'EN_PRODUCCION'
      WHEN 'completada' THEN 'PRODUCCION_COMPLETADA'
      WHEN 'cancelada' THEN 'CANCELADA'
      ELSE 'CONFIRMADA'
    END;
    v_legacy_desde_sii := CASE NEW.estado_sii
      WHEN 'CONFIRMADA' THEN 'borrador'
      WHEN 'PLANIFICADA' THEN 'programada'
      WHEN 'LISTA' THEN 'programada'
      WHEN 'EN_PRODUCCION' THEN 'en_proceso'
      WHEN 'PRODUCCION_COMPLETADA' THEN 'completada'
      WHEN 'CERRADA' THEN 'completada'
      WHEN 'CANCELADA' THEN 'cancelada'
      ELSE NEW.estado
    END;

    IF NEW.estado IS DISTINCT FROM 'borrador' AND NEW.estado_sii = 'CONFIRMADA' THEN
      -- Solo el legacy vino explícito: el SII se deriva.
      NEW.estado_sii := v_sii_desde_legacy;
    ELSIF NEW.estado_sii IS DISTINCT FROM 'CONFIRMADA' AND NEW.estado = 'borrador' THEN
      -- Solo el SII vino explícito: el legacy se deriva.
      NEW.estado := v_legacy_desde_sii;
    ELSE
      -- Ambos explícitos (o ambos por defecto): manda SII.
      NEW.estado := v_legacy_desde_sii;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado_sii IS DISTINCT FROM OLD.estado_sii THEN
    NEW.estado := CASE NEW.estado_sii
      WHEN 'CONFIRMADA' THEN 'borrador'
      WHEN 'PLANIFICADA' THEN 'programada'
      WHEN 'LISTA' THEN 'programada'
      WHEN 'EN_PRODUCCION' THEN 'en_proceso'
      WHEN 'PRODUCCION_COMPLETADA' THEN 'completada'
      WHEN 'CERRADA' THEN 'completada'
      WHEN 'CANCELADA' THEN 'cancelada'
      ELSE NEW.estado
    END;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.estado_sii := CASE NEW.estado
      WHEN 'borrador' THEN 'CONFIRMADA'
      WHEN 'programada' THEN 'PLANIFICADA'
      WHEN 'en_proceso' THEN 'EN_PRODUCCION'
      WHEN 'pausada' THEN 'EN_PRODUCCION'
      WHEN 'completada' THEN 'PRODUCCION_COMPLETADA'
      WHEN 'cancelada' THEN 'CANCELADA'
      ELSE NEW.estado_sii
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_ordenes_sincronizar_estado_sii ON public.ordenes_produccion;
CREATE TRIGGER trigger_ordenes_sincronizar_estado_sii
  BEFORE INSERT OR UPDATE OF estado, estado_sii ON public.ordenes_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.sincronizar_estado_orden_sii();
