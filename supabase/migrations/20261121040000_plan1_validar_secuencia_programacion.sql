-- PLAN-1: exposición controlada de la disponibilidad de piezas del proceso
-- previo para que Planeación pueda validar antes de programar.
--
-- La regla ya existe en Producción (privado.piezas_disponibles_proceso) y la
-- función privada no es ejecutable por service_role. Este wrapper de solo
-- lectura devuelve la secuencia y el nombre de la operación junto con las
-- piezas disponibles, sin mutar nada ni relajar permisos.

CREATE OR REPLACE FUNCTION public.obtener_piezas_disponibles_proceso(
  p_meta_proceso_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta public.metas_proceso_partida%ROWTYPE;
BEGIN
  IF p_meta_proceso_id IS NULL THEN
    RETURN jsonb_build_object('secuencia', 1, 'nombre', null, 'disponibles', null);
  END IF;

  SELECT * INTO v_meta
  FROM public.metas_proceso_partida AS meta
  WHERE meta.id = p_meta_proceso_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meta_proceso_no_corresponde' USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'secuencia', v_meta.secuencia,
    'nombre', v_meta.nombre,
    'disponibles', privado.piezas_disponibles_proceso(p_meta_proceso_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_piezas_disponibles_proceso(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_piezas_disponibles_proceso(uuid) TO service_role;

COMMENT ON FUNCTION public.obtener_piezas_disponibles_proceso(uuid) IS
  'PLAN-1: disponibilidad de piezas del previo para validar programaciones desde Planeación. Solo service_role.';
