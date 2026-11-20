-- C31/A12 (2026-11-20): motivo cuando una sesión supera el tiempo estimado.
--
-- El cierre ya permite corregir la hora real (C20) y justificar el exceso de
-- jornada (C15). Faltaba registrar por qué la operación tardó más de lo
-- estimado cuando ese exceso no llega a la jornada del día.
--
-- No se cambia la firma de ninguna RPC de cierre: el motivo se registra antes,
-- con una RPC auxiliar idempotente, y el cierre sigue su camino normal.
--
-- Aplicar solo en local; el remoto lo controla el PO.
-- =============================================================================

ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS motivo_exceso text,
  ADD COLUMN IF NOT EXISTS motivo_exceso_detalle text;

COMMENT ON COLUMN public.sesiones_trabajo.motivo_exceso IS
  'C31/A12: OLVIDE_CERRAR u OTRO; explica por qué la sesión superó el tiempo estimado de la operación.';
COMMENT ON COLUMN public.sesiones_trabajo.motivo_exceso_detalle IS
  'C31/A12: hora real corregida o motivo libre del exceso sobre el estimado.';

-- C4.3/C20: authenticated tiene GRANT SELECT por columnas en esta tabla.
GRANT SELECT (motivo_exceso, motivo_exceso_detalle) ON TABLE public.sesiones_trabajo TO authenticated;

DROP FUNCTION IF EXISTS public.registrar_motivo_exceso_sesion(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.registrar_motivo_exceso_sesion(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_motivo text,
  p_detalle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_motivo text := upper(btrim(coalesce(p_motivo, '')));
  v_detalle text := btrim(coalesce(p_detalle, ''));
  v_ya_aplicado boolean := false;
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL
     OR v_motivo NOT IN ('OLVIDE_CERRAR', 'OTRO')
     OR char_length(v_detalle) < 3 OR char_length(v_detalle) > 270 THEN
    RAISE EXCEPTION 'motivo_exceso_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_sesion.operador_id <> p_operador_id
     OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- Doble pulsación: el mismo motivo y detalle no se vuelven a escribir.
  IF v_sesion.motivo_exceso = v_motivo
     AND v_sesion.motivo_exceso_detalle = v_detalle THEN
    v_ya_aplicado := true;
  ELSE
    UPDATE public.sesiones_trabajo AS sesion
    SET motivo_exceso = v_motivo,
        motivo_exceso_detalle = v_detalle,
        actualizado_en = now()
    WHERE sesion.id = p_sesion_id;
  END IF;

  RETURN jsonb_build_object(
    'sesion_id', p_sesion_id,
    'motivo_exceso', v_motivo,
    'motivo_exceso_detalle', v_detalle,
    'ya_aplicado', v_ya_aplicado
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_motivo_exceso_sesion(uuid, uuid, text, text) IS
  'C31/A12: registra de forma idempotente el motivo por el que una sesión superó el tiempo estimado. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_motivo_exceso_sesion(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_motivo_exceso_sesion(uuid, uuid, text, text)
  TO service_role;
