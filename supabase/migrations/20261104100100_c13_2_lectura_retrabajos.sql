-- C13.2 - Lectura de retrabajos por orden para la vista administrativa.
CREATE OR REPLACE FUNCTION public.obtener_retrabajos_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  material_codigo text,
  material_nombre text,
  unidad_control text,
  codigo_pieza text,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  notas text,
  registrado_por_nombre text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'retrabajo_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id, retrabajo.material_id,
    material.codigo, material.nombre, material.unidad_control,
    partida.codigo_pieza,
    retrabajo.cantidad_usada, retrabajo.cantidad_scrap, retrabajo.minutos,
    retrabajo.causa, retrabajo.motivo, retrabajo.notas,
    coalesce(usuario.nombre_completo, 'Administración'),
    retrabajo.creado_en
  FROM public.retrabajos_produccion AS retrabajo
  JOIN public.materiales AS material ON material.id = retrabajo.material_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = retrabajo.partida_id
  LEFT JOIN public.usuarios AS usuario ON usuario.id = retrabajo.registrado_por
  WHERE retrabajo.orden_id = p_orden_id
  ORDER BY retrabajo.creado_en DESC;
END;
$$;

COMMENT ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid) IS
  'C13.2: lista los retrabajos de una orden con material, pieza y autor. Solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid) TO service_role;
