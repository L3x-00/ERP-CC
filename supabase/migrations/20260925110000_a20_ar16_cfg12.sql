-- A20/AR-16 + CFG-12
-- AR-16: anulación trazable de una AR (no borra pagos, reversos ni referencia).
-- CFG-12: consolidación administrativa de AR borradores faltantes en órdenes
-- comerciales, con vista previa y confirmación explícita; idempotente.
-- -----------------------------------------------------------------------------

ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL;

ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_anulacion_coherente;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_anulacion_coherente CHECK (
    (motivo_anulacion IS NULL AND anulada_en IS NULL)
    OR (estado = 'cancelado' AND length(btrim(motivo_anulacion)) BETWEEN 3 AND 300)
  );

CREATE OR REPLACE FUNCTION public.anular_cuenta_por_cobrar(
  p_ar_id uuid,
  p_actualizado_en timestamptz,
  p_motivo text,
  p_actor_id uuid
)
RETURNS TABLE (id uuid, estado text, saldo_pendiente numeric, motivo_anulacion text, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF p_ar_id IS NULL OR p_actualizado_en IS NULL OR p_actor_id IS NULL
     OR length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'anulacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_anular_cuenta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_ya_anulada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.actualizado_en <> p_actualizado_en THEN
    RAISE EXCEPTION 'cuenta_desactualizada' USING ERRCODE = 'check_violation';
  END IF;

  -- Solo se anula una cuenta sin cobros vigentes: los pagos reversados cuentan
  -- como evidencia y no bloquean; el anticipo heredado se conserva.
  IF EXISTS (
    SELECT 1 FROM public.pagos_ar AS pago
    WHERE pago.ar_id = p_ar_id
      AND NOT EXISTS (
        SELECT 1 FROM public.reversos_pago_ar AS reverso WHERE reverso.pago_id = pago.id
      )
  ) THEN
    RAISE EXCEPTION 'cuenta_con_cobros_vigentes' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.saldo_pendiente <> v_cuenta.monto_total - v_cuenta.abono_heredado THEN
    RAISE EXCEPTION 'cuenta_con_saldo_irregular' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    estado = 'cancelado',
    saldo_pendiente = 0,
    motivo_anulacion = v_motivo,
    anulada_en = now(),
    anulada_por = p_actor_id
  WHERE cuenta.id = p_ar_id;

  RETURN QUERY
  SELECT cuenta.id, cuenta.estado, cuenta.saldo_pendiente,
         cuenta.motivo_anulacion, cuenta.actualizado_en
  FROM public.cuentas_por_cobrar AS cuenta WHERE cuenta.id = p_ar_id;
EXCEPTION
  WHEN check_violation THEN
    RAISE;
  WHEN unique_violation THEN
    RAISE EXCEPTION 'cuenta_ya_anulada' USING ERRCODE = 'check_violation';
END;
$$;

-- CFG-12: elegibilidad y monto comercial de una orden sin AR (misma fórmula D-04).
CREATE OR REPLACE FUNCTION privado.monto_comercial_orden(p_orden_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN orden.cotizacion_id IS NULL OR orden.es_interna THEN NULL
    ELSE (
      SELECT round(
        base.valor * (1 + coalesce(pipeline.iva_porcentaje, 16) / 100), 2
      )
      FROM (
        SELECT
          coalesce(sum(CASE WHEN linea.es_descuento THEN 0 ELSE linea.cantidad * linea.precio_unitario END), 0)
          - coalesce(sum(CASE WHEN linea.es_descuento THEN linea.cantidad * linea.precio_unitario ELSE 0 END), 0)
        FROM public.cotizacion_lineas AS linea
        WHERE linea.pipeline_id = orden.cotizacion_id
      ) AS base(valor)
      JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
    )
  END
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;
$$;

REVOKE ALL ON FUNCTION privado.monto_comercial_orden(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.previsualizar_consolidacion_ar_faltantes()
RETURNS TABLE (
  orden_id uuid, folio text, cliente_nombre text, estado text,
  monto_total numeric, elegible boolean, motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    orden.id,
    orden.folio,
    coalesce(cliente.nombre_comercial, cliente.razon_social, 'Cliente'),
    orden.estado,
    privado.monto_comercial_orden(orden.id),
    privado.monto_comercial_orden(orden.id) IS NOT NULL
      AND privado.monto_comercial_orden(orden.id) > 0
      AND cliente.estado = 'activo'
      AND NOT EXISTS (SELECT 1 FROM public.cuentas_por_cobrar cuenta WHERE cuenta.orden_id = orden.id),
    CASE
      WHEN orden.es_interna THEN 'Trabajo interno: no genera cobranza'
      WHEN orden.cotizacion_id IS NULL THEN 'Sin cotización de origen'
      WHEN EXISTS (SELECT 1 FROM public.cuentas_por_cobrar cuenta WHERE cuenta.orden_id = orden.id)
        THEN 'Ya tiene cuenta por cobrar'
      WHEN privado.monto_comercial_orden(orden.id) IS NULL
        OR privado.monto_comercial_orden(orden.id) <= 0 THEN 'Sin precio comercial calculable'
      WHEN cliente.estado <> 'activo' THEN 'Cliente inactivo'
      ELSE NULL
    END
  FROM public.ordenes_produccion AS orden
  JOIN public.clientes AS cliente ON cliente.id = orden.cliente_id
  WHERE orden.estado <> 'cancelada'
  ORDER BY orden.creado_en, orden.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consolidar_ar_faltantes(
  p_orden_ids uuid[],
  p_actor_id uuid
)
RETURNS TABLE (orden_id uuid, creada boolean, motivo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_cliente_id uuid;
  v_es_interna boolean;
  v_cotizacion_id uuid;
  v_estado_orden text;
  v_estado_cliente text;
  v_moneda text;
  v_iva_pct numeric;
  v_tipo_cambio numeric;
  v_total numeric;
  v_base numeric;
  v_iva numeric;
  v_nueva_id uuid;
BEGIN
  IF p_orden_ids IS NULL OR p_actor_id IS NULL
     OR cardinality(p_orden_ids) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'consolidacion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_consolidar_ar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOREACH v_orden_id IN ARRAY p_orden_ids LOOP
    SELECT orden.cliente_id, orden.es_interna, orden.cotizacion_id, orden.estado,
           cliente.estado, pipeline.moneda, pipeline.iva_porcentaje
    INTO v_cliente_id, v_es_interna, v_cotizacion_id, v_estado_orden,
         v_estado_cliente, v_moneda, v_iva_pct
    FROM public.ordenes_produccion AS orden
    JOIN public.clientes AS cliente ON cliente.id = orden.cliente_id
    LEFT JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
    WHERE orden.id = v_orden_id
    FOR UPDATE OF orden;

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_orden_id, false, 'Orden inexistente'; CONTINUE;
    END IF;
    IF v_estado_orden = 'cancelada' THEN
      RETURN QUERY SELECT v_orden_id, false, 'Orden cancelada'; CONTINUE;
    END IF;
    IF v_es_interna OR v_cotizacion_id IS NULL THEN
      RETURN QUERY SELECT v_orden_id, false, 'Trabajo interno o sin cotización de origen'; CONTINUE;
    END IF;
    IF v_estado_cliente <> 'activo' THEN
      RETURN QUERY SELECT v_orden_id, false, 'Cliente inactivo'; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.cuentas_por_cobrar AS cuenta WHERE cuenta.orden_id = v_orden_id) THEN
      RETURN QUERY SELECT v_orden_id, false, 'Ya tiene cuenta por cobrar'; CONTINUE;
    END IF;

    v_total := privado.monto_comercial_orden(v_orden_id);
    IF v_total IS NULL OR v_total <= 0 OR v_total > 99999999.9999 THEN
      RETURN QUERY SELECT v_orden_id, false, 'Sin precio comercial calculable'; CONTINUE;
    END IF;
    IF v_moneda = 'USD' THEN
      SELECT config.tipo_cambio_usd INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config LIMIT 1;
      IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
        RETURN QUERY SELECT v_orden_id, false, 'Tipo de cambio USD no configurado'; CONTINUE;
      END IF;
    ELSE
      v_moneda := 'MXN';
      v_tipo_cambio := 1;
    END IF;

    v_base := round(v_total / (1 + coalesce(v_iva_pct, 16) / 100), 2);
    v_iva := round(v_total - v_base, 2);

    BEGIN
      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
        tipo_cambio_origen, estado, monto_subtotal, monto_iva
      ) VALUES (
        v_orden_id, v_cliente_id, round(v_total, 4), round(v_total, 4), v_moneda,
        round(v_tipo_cambio, 4), 'pendiente', v_base, v_iva
      )
      RETURNING cuentas_por_cobrar.id INTO v_nueva_id;
      RETURN QUERY SELECT v_orden_id, true, NULL::text;
    EXCEPTION
      WHEN unique_violation THEN
        RETURN QUERY SELECT v_orden_id, false, 'Ya tiene cuenta por cobrar';
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.anular_cuenta_por_cobrar(uuid, timestamptz, text, uuid) IS
  'AR-16: anula con CAS una AR sin cobros vigentes, conservando pagos e historial; solo service_role.';
COMMENT ON FUNCTION public.previsualizar_consolidacion_ar_faltantes() IS
  'CFG-12: vista previa de órdenes comerciales sin AR con elegibilidad y monto sugerido.';
COMMENT ON FUNCTION public.consolidar_ar_faltantes(uuid[], uuid) IS
  'CFG-12: crea AR borradores faltantes de forma idempotente para las órdenes confirmadas; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.anular_cuenta_por_cobrar(uuid, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.previsualizar_consolidacion_ar_faltantes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consolidar_ar_faltantes(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_cuenta_por_cobrar(uuid, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.previsualizar_consolidacion_ar_faltantes() TO service_role;
GRANT EXECUTE ON FUNCTION public.consolidar_ar_faltantes(uuid[], uuid) TO service_role;
