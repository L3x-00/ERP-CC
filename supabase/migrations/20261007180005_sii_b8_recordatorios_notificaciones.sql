-- =============================================================================
-- SII-B8 F3 (ajuste) - Recordatorios compatibles con los CHECK de notificaciones
--
-- notificaciones_usuario exige tipo del catalogo (mencion/comentario_orden/
-- estado_orden/alerta_sistema) y enlace interno a /ordenes|/pipeline|/clientes.
-- Los recordatorios usan alerta_sistema y enlazan a la orden de la AR.
-- Aplicar SOLO local; el remoto lo aplica el PO (después de 20261007180002).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.procesar_recordatorios_promesas(
  p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cumplidas integer,
  vencidas integer,
  recordatorios_previos integer,
  recordatorios_vencidas integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cumplidas integer := 0;
  v_vencidas integer := 0;
  v_previos integer := 0;
  v_vencidas_notificadas integer := 0;
BEGIN
  IF p_actor_id IS NOT NULL
     AND NOT privado.actor_con_permiso(p_actor_id, 'registrar_pagos')
     AND NOT privado.actor_con_permiso(p_actor_id, 'ver_finanzas') THEN
    RAISE EXCEPTION 'sin_permiso_promesas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- CUMPLIDA automática: la AR quedó pagada.
  UPDATE public.promesas_pago AS promesa
  SET estado = 'CUMPLIDA'
  FROM public.cuentas_por_cobrar AS cuenta
  WHERE promesa.cuenta_id = cuenta.id
    AND promesa.estado IN ('VIGENTE', 'VENCIDA')
    AND cuenta.estado = 'pagado';
  GET DIAGNOSTICS v_cumplidas = ROW_COUNT;

  -- Recordatorio 2 días antes (una vez por promesa y destinatario).
  WITH objetivo AS (
    UPDATE public.promesas_pago
    SET recordatorio_previo_en = now()
    WHERE estado = 'VIGENTE'
      AND recordatorio_previo_en IS NULL
      AND fecha_prometida >= current_date
      AND fecha_prometida <= current_date + 2
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           cuenta.orden_id, destino.usuario_id
    FROM objetivo
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = objetivo.cuenta_id
    CROSS JOIN LATERAL (
      SELECT objetivo.creado_por AS usuario_id
      UNION
      SELECT usuario.id
      FROM public.usuarios AS usuario
      JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
      WHERE usuario.activo AND permiso.permiso = 'registrar_pagos'
    ) AS destino
  )
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, enlace)
  SELECT destino.usuario_id, 'alerta_sistema', 'Promesa de pago por vencer',
    'La promesa de $' || destino.monto::text || ' vence el ' || destino.fecha_prometida::text
      || ' (cuenta ' || destino.cuenta_id::text || ').',
    '/ordenes?ordenId=' || destino.orden_id::text
  FROM destinos AS destino;
  GET DIAGNOSTICS v_previos = ROW_COUNT;

  -- Vencidas: transición única (la bandera evita re-notificar).
  WITH objetivo AS (
    UPDATE public.promesas_pago
    SET estado = 'VENCIDA', recordatorio_vencida_en = now()
    WHERE estado = 'VIGENTE'
      AND fecha_prometida < current_date
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           cuenta.orden_id, destino.usuario_id
    FROM objetivo
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = objetivo.cuenta_id
    CROSS JOIN LATERAL (
      SELECT objetivo.creado_por AS usuario_id
      UNION
      SELECT usuario.id
      FROM public.usuarios AS usuario
      JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
      WHERE usuario.activo AND permiso.permiso = 'registrar_pagos'
    ) AS destino
  )
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, enlace)
  SELECT destino.usuario_id, 'alerta_sistema', 'Promesa de pago vencida',
    'La promesa de $' || destino.monto::text || ' venció el ' || destino.fecha_prometida::text
      || ' y la cuenta sigue con saldo (cuenta ' || destino.cuenta_id::text || ').',
    '/ordenes?ordenId=' || destino.orden_id::text
  FROM destinos AS destino;
  GET DIAGNOSTICS v_vencidas_notificadas = ROW_COUNT;

  SELECT count(*)::integer INTO v_vencidas
  FROM public.promesas_pago AS promesa
  WHERE promesa.estado = 'VENCIDA';

  RETURN QUERY SELECT v_cumplidas, v_vencidas, v_previos, v_vencidas_notificadas;
END;
$function$;
COMMENT ON FUNCTION public.procesar_recordatorios_promesas(uuid) IS
'SII-B8 F3: marca promesas cumplidas/vencidas y genera recordatorios internos idempotentes (2 dias antes y al vencer). Solo service_role.';

REVOKE ALL ON FUNCTION public.procesar_recordatorios_promesas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_recordatorios_promesas(uuid) TO service_role;
