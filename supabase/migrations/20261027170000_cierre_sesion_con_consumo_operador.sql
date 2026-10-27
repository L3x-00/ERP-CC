CREATE FUNCTION public.cerrar_sesion_con_consumo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_meta_proceso_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  horas_brutas numeric,
  horas_netas numeric,
  piezas_producidas numeric,
  cantidad_producida_partida numeric,
  estado_orden text,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_partida_id uuid;
BEGIN
  IF p_sesion_id IS NULL
     OR p_operador_id IS NULL
     OR p_material_id IS NULL
     OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0
     OR p_cantidad_usada IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0
     OR p_cantidad_scrap < 0
     OR p_cantidad_usada + p_cantidad_scrap <= 0
  THEN
    RAISE EXCEPTION 'cierre_consumo_invalido'
      USING ERRCODE = '23514';
  END IF;

  -- Comprobación inicial sin alterar el orden de bloqueos
  -- que utiliza la función original de cierre.
  SELECT sesion.partida_id
  INTO v_partida_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
    AND sesion.operador_id = p_operador_id
    AND sesion.estado_sesion = 'activa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa'
      USING ERRCODE = '23514';
  END IF;

  -- Primer paso: registrar consumo con las validaciones existentes.
  PERFORM 1
  FROM public.registrar_consumo_material_operador_op(
    v_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap,
    p_operador_id
  );

  -- Segundo paso: cerrar usando toda la lógica original.
  RETURN QUERY
  SELECT cierre.*
  FROM public.cerrar_sesion_trabajo_operador(
    p_sesion_id,
    p_operador_id,
    p_piezas_producidas,
    'finalizada',
    NULL::text,
    p_notas,
    p_meta_proceso_id
  ) AS cierre;
END;
$function$;

COMMENT ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) IS
  'C10: registra consumo y cierra una sesión finalizada en una única transacción. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) TO service_role;
