-- A20/PRD-15: reactivación administrativa de una orden «Lista» (completada).
-- Devuelve la orden a operación sin borrar sesiones, avances, programaciones ni
-- pagos. Se prohíbe si ya hubo entrega o si la cuenta por cobrar es exigible o
-- tiene cobros, para no reabrir documentos financieros por accidente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reactivar_orden_op(
  p_orden_id uuid,
  p_actualizado_en timestamptz,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  estado text,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_actualizado_en IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'reactivacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_reactivar_orden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- CAS: una pantalla obsoleta no revive una orden que cambió después.
  IF v_orden.actualizado_en <> p_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_orden.estado <> 'completada' THEN
    RAISE EXCEPTION 'orden_no_reactivable' USING ERRCODE = 'check_violation';
  END IF;

  -- Una orden entregada o archivada conserva su cierre: reabrirla alteraría la
  -- nota de entrega y la facturación ya emitida.
  IF v_orden.archivada_en IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.notas_entrega AS nota WHERE nota.orden_id = p_orden_id)
     OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar AS cuenta
       WHERE cuenta.orden_id = p_orden_id
         AND (
           cuenta.cobrable_desde IS NOT NULL
           OR cuenta.estado IN ('parcial', 'pagado')
           OR cuenta.saldo_pendiente < cuenta.monto_total
         )
     ) THEN
    RAISE EXCEPTION 'orden_entregada_no_reactivable' USING ERRCODE = 'check_violation';
  END IF;

  -- Solo cambia el estado y el cierre; sesiones, avances, programaciones,
  -- metas y partidas se conservan intactos.
  UPDATE public.ordenes_produccion AS orden
  SET estado = 'en_proceso', fecha_fin = NULL, actualizado_en = clock_timestamp()
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  SELECT orden.id, orden.estado, orden.fecha_inicio, orden.fecha_fin, orden.actualizado_en
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
END;
$$;

COMMENT ON FUNCTION public.reactivar_orden_op(uuid, timestamptz, uuid) IS
  'PRD-15: devuelve a operación una OP completada sin entrega/cobros, con CAS; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.reactivar_orden_op(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reactivar_orden_op(uuid, timestamptz, uuid)
  TO service_role;
