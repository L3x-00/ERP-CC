-- =============================================================================
-- Fase 0 — Alinear el área de las máquinas del grupo CL1 con su proceso
--
-- El proceso CORTE_LASER pertenece al área LASER, cuya área de planeación es
-- `sheet_metal` («Corte y lámina»). Las tres máquinas del grupo CL1 quedaron
-- dadas de alta con `area = 'taller'`, por lo que la validación de inicio de
-- producción no encontraba ninguna máquina activa del grupo en el área
-- requerida.
--
-- Esta migración corrige solo el dato; no crea ni elimina máquinas y es
-- idempotente. La prevención (que el alta no vuelva a permitir el error) va en
-- el cambio de aplicación de la Fase 1.
-- =============================================================================

UPDATE public.recursos_planeacion AS r
   SET area = 'sheet_metal'
  FROM public.grupos_equipo AS g
 WHERE g.id = r.grupo_equipo_id
   AND g.codigo = 'CL1'
   AND r.area IS DISTINCT FROM 'sheet_metal';

-- Verificación de solo lectura. No falla en entornos sin el grupo o sin
-- máquinas (por ejemplo, una base local recién sembrada): solo avisa.
DO $$
DECLARE
  v_grupo uuid;
  v_equipos integer;
BEGIN
  SELECT id INTO v_grupo FROM public.grupos_equipo WHERE codigo = 'CL1';
  IF v_grupo IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_equipos
    FROM public.recursos_planeacion r
   WHERE r.grupo_equipo_id = v_grupo
     AND r.activo
     AND r.area = 'sheet_metal';

  IF v_equipos = 0 THEN
    RAISE WARNING 'CL1 no tiene equipos activos en sheet_metal en este entorno';
  END IF;
END;
$$;
