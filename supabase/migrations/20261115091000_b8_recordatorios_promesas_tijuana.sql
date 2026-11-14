-- =============================================================================
-- B8 — Recordatorios de promesas con el "hoy" del negocio
--
-- Pendiente anotado en el corte AUD-12: las ventanas de
-- `procesar_recordatorios_promesas` comparaban `fecha_prometida` con
-- `current_date` (UTC). Por la tarde en Tijuana una promesa de hoy quedaba
-- fuera de la ventana de "por vencer" y una de ayer podía no marcarse VENCIDA
-- hasta el día siguiente.
--
-- Ahora la ventana usa `(now() AT TIME ZONE 'America/Tijuana')::date`.
-- Aditiva: redefinición sin cambiar firma ni permisos. Aplicar solo en local.
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
  v_hoy date := (now() AT TIME ZONE 'America/Tijuana')::date;
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
      AND fecha_prometida >= v_hoy
      AND fecha_prometida <= v_hoy + 2
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           cuenta.orden_id, cuenta.referencia_interna,
           coalesce(
             nullif(btrim(cliente.nombre_comercial), ''),
             cliente.razon_social,
             'Cliente'
           ) AS cliente_nombre,
           destino.usuario_id
    FROM objetivo
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = objetivo.cuenta_id
    JOIN public.clientes AS cliente ON cliente.id = cuenta.cliente_id
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
    'La promesa de $' || round(destino.monto, 2)::text
      || ' vence el ' || to_char(destino.fecha_prometida, 'DD/MM/YYYY')
      || ' (cuenta ' || destino.referencia_interna
      || ' · ' || destino.cliente_nombre || ').',
    '/ordenes?ordenId=' || destino.orden_id::text
  FROM destinos AS destino;
  GET DIAGNOSTICS v_previos = ROW_COUNT;

  -- Vencidas: transición única (la bandera evita re-notificar).
  WITH objetivo AS (
    UPDATE public.promesas_pago
    SET estado = 'VENCIDA', recordatorio_vencida_en = now()
    WHERE estado = 'VIGENTE'
      AND fecha_prometida < v_hoy
    RETURNING id, cuenta_id, fecha_prometida, monto, creado_por
  ), destinos AS (
    SELECT objetivo.id, objetivo.cuenta_id, objetivo.fecha_prometida, objetivo.monto,
           cuenta.orden_id, cuenta.referencia_interna,
           coalesce(
             nullif(btrim(cliente.nombre_comercial), ''),
             cliente.razon_social,
             'Cliente'
           ) AS cliente_nombre,
           destino.usuario_id
    FROM objetivo
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = objetivo.cuenta_id
    JOIN public.clientes AS cliente ON cliente.id = cuenta.cliente_id
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
    'La promesa de $' || round(destino.monto, 2)::text
      || ' venció el ' || to_char(destino.fecha_prometida, 'DD/MM/YYYY')
      || '. La cuenta ' || destino.referencia_interna
      || ' de ' || destino.cliente_nombre || ' sigue con saldo.',
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
  'SII-B8 F3: marca promesas cumplidas/vencidas y genera recordatorios internos idempotentes (2 dias antes y al vencer) con el hoy de America/Tijuana (AUD-12). Solo service_role.';

REVOKE ALL ON FUNCTION public.procesar_recordatorios_promesas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_recordatorios_promesas(uuid) TO service_role;
