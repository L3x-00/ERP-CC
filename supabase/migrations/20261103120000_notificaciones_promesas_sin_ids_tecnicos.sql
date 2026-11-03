-- =============================================================================
-- Notificaciones de promesas de pago legibles para el usuario final
--
-- Los recordatorios exponían `cuentas_por_cobrar.id` (UUID) como si fuera el
-- número de cuenta, además de montos con 4 decimales y fechas ISO. El usuario
-- final no reconoce esos datos técnicos. Ahora el mensaje usa la referencia
-- interna visible en Cobranza (INVCNC-NNNNNNN), el cliente, fecha dd/mm/aaaa y
-- el monto con 2 decimales.
--
-- Aplicar SOLO local; el remoto lo aplica el PO.
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
      AND fecha_prometida < current_date
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
'SII-B8 F3: marca promesas cumplidas/vencidas y genera recordatorios internos idempotentes (2 dias antes y al vencer). Solo service_role.';

REVOKE ALL ON FUNCTION public.procesar_recordatorios_promesas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_recordatorios_promesas(uuid) TO service_role;

-- Renueva los avisos ya emitidos que aún muestran el UUID de la cuenta. El
-- texto anterior es estable ("(cuenta <uuid>)"), así que el reemplazo es
-- quirúrgico y conserva el resto del mensaje.
UPDATE public.notificaciones_usuario AS aviso
SET mensaje = replace(
  aviso.mensaje,
  '(cuenta ' || cuenta.id::text || ')',
  '(cuenta ' || cuenta.referencia_interna || ' · ' || coalesce(
    nullif(btrim(cliente.nombre_comercial), ''),
    cliente.razon_social,
    'Cliente'
  ) || ')'
)
FROM public.cuentas_por_cobrar AS cuenta
JOIN public.clientes AS cliente ON cliente.id = cuenta.cliente_id
WHERE aviso.tipo IN ('alerta_sistema', 'promesa_pago')
  AND aviso.mensaje LIKE '%(cuenta ' || cuenta.id::text || ')%';

-- Normaliza los montos con 4 decimales y las fechas ISO de los avisos ya
-- emitidos ('$186000.0000', '2026-10-31') al formato visible en la app.
UPDATE public.notificaciones_usuario AS aviso
SET mensaje = regexp_replace(
  regexp_replace(aviso.mensaje, '\$([0-9]+)\.([0-9]{2})[0-9]{2}', '$\1.\2', 'g'),
  '([0-9]{4})-([0-9]{2})-([0-9]{2})', '\3/\2/\1', 'g'
)
WHERE aviso.tipo IN ('alerta_sistema', 'promesa_pago')
  AND aviso.titulo IN ('Promesa de pago por vencer', 'Promesa de pago vencida')
  AND (
    aviso.mensaje ~ '\$[0-9]+\.[0-9]{4}'
    OR aviso.mensaje ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'
  );
