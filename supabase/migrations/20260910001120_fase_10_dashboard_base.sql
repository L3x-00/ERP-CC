-- =============================================================================
-- Fase 10: Dashboard por rol y métricas operativas/financieras.
--
-- Las métricas se calculan en una sola lectura consistente dentro de RPCs
-- `SECURITY DEFINER`. No se usan vistas materializadas: el dashboard debe
-- reflejar cambios Realtime sin depender de una tarea de refresco que pueda
-- quedar atrasada. Las tablas de origen ya tienen índices por estado/fecha y
-- cada función limita explícitamente el rango solicitado.
--
-- Ninguna de estas funciones queda disponible para el navegador. Las Server
-- Actions resuelven sesión y permisos, y después llaman al cliente service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Configuración explícita de metas y comisión por vendedor.
--    Sin esta tabla una meta tendría que quedar hardcodeada en el RPC, lo que
--    impediría auditar cambios de objetivos. `mes` siempre representa el primer
--    día del mes en UTC.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metas_vendedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  mes date NOT NULL,
  meta_mensual_mxn numeric(14, 4) NOT NULL DEFAULT 0,
  porcentaje_comision numeric(7, 4) NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_vendedor_mes_inicio CHECK (mes = date_trunc('month', mes)::date),
  CONSTRAINT metas_vendedor_meta_valida CHECK (
    meta_mensual_mxn >= 0
    AND meta_mensual_mxn NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT metas_vendedor_comision_valida CHECK (
    porcentaje_comision >= 0
    AND porcentaje_comision <= 100
    AND porcentaje_comision NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT metas_vendedor_vendedor_mes_unico UNIQUE (vendedor_id, mes)
);

COMMENT ON TABLE public.metas_vendedor IS
  'Meta mensual y porcentaje de comisión auditables por vendedor; solo se exponen mediante métricas autorizadas.';

CREATE INDEX IF NOT EXISTS idx_metas_vendedor_mes
  ON public.metas_vendedor (vendedor_id, mes DESC);

-- Índices de lectura para los rangos que recorren las RPC. Las tablas ya
-- tienen índices de relación/estado; estos evitan secuencias completas al
-- cambiar el periodo del dashboard conforme crecen los datos ficticios y
-- después los operativos.
CREATE INDEX IF NOT EXISTS idx_pipeline_dashboard_creado
  ON public.pipeline (creado_en);
CREATE INDEX IF NOT EXISTS idx_pipeline_dashboard_vendedor_creado
  ON public.pipeline (vendedor_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_dashboard_creado
  ON public.ordenes_produccion (creado_en);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_dashboard_emision
  ON public.cuentas_por_cobrar (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_pagos_ar_dashboard_creado
  ON public.pagos_ar (creado_en);
CREATE INDEX IF NOT EXISTS idx_gastos_dashboard_fecha
  ON public.gastos (fecha_gasto);
CREATE INDEX IF NOT EXISTS idx_sesiones_trabajo_dashboard_actualizado
  ON public.sesiones_trabajo (estado_sesion, actualizado_en);

DROP TRIGGER IF EXISTS trigger_metas_vendedor_actualizado_en ON public.metas_vendedor;
CREATE TRIGGER trigger_metas_vendedor_actualizado_en
  BEFORE UPDATE ON public.metas_vendedor
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

REVOKE ALL PRIVILEGES ON TABLE public.metas_vendedor FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.metas_vendedor TO service_role;
GRANT SELECT ON TABLE public.metas_vendedor TO authenticated;
ALTER TABLE public.metas_vendedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metas_vendedor_seleccionar ON public.metas_vendedor;
CREATE POLICY metas_vendedor_seleccionar
  ON public.metas_vendedor
  FOR SELECT
  TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    OR (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'metas_vendedor'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_vendedor;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Métricas ejecutivas. El intervalo es semiabierto [inicio, fin) y el
--    periodo anterior conserva exactamente la misma duración.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.obtener_metricas_dashboard_ejecutivo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_ahora timestamptz := now();
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_dashboard_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= p_fecha_inicio
      AND cuenta.fecha_emision < p_fecha_fin
  ), cotizado AS (
    SELECT COALESCE(SUM(linea.cantidad * linea.precio_unitario), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= p_fecha_inicio
      AND pipeline.creado_en < p_fecha_fin
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= p_fecha_inicio
      AND orden.creado_en < p_fecha_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= p_fecha_inicio AND consumo.creado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= p_fecha_inicio AND sesion.actualizado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
      'totalCotizado', round(cotizado.monto, 4),
      'porcentajeConversion', CASE WHEN cotizado.oportunidades > 0
        THEN round(cotizado.ganadas::numeric / cotizado.oportunidades * 100, 4) ELSE 0 END
    ),
    'ordenes', jsonb_build_object(
      'activas', ordenes.activas,
      'completadas', ordenes.completadas,
      'aprobacionesPendientes', ordenes.aprobaciones_pendientes,
      'atrasadas', ordenes.atrasadas,
      'enRiesgo', ordenes.en_riesgo
    ),
    'finanzas', jsonb_build_object(
      'arPendiente', round(finanzas.ar_pendiente, 4),
      'arVencido', round(finanzas.ar_vencido, 4),
      'cxpPendiente', round(finanzas.cxp_pendiente, 4),
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
    )
  )
  INTO v_actual
  FROM ingresos, cotizado, ordenes, costos, finanzas;

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= v_anterior_inicio
      AND cuenta.fecha_emision < v_anterior_fin
  ), cotizado AS (
    SELECT COALESCE(SUM(linea.cantidad * linea.precio_unitario), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= v_anterior_inicio
      AND pipeline.creado_en < v_anterior_fin
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= v_anterior_inicio
      AND orden.creado_en < v_anterior_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= v_anterior_inicio AND consumo.creado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= v_anterior_inicio AND sesion.actualizado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
      'totalCotizado', round(cotizado.monto, 4),
      'porcentajeConversion', CASE WHEN cotizado.oportunidades > 0
        THEN round(cotizado.ganadas::numeric / cotizado.oportunidades * 100, 4) ELSE 0 END
    ),
    'ordenes', jsonb_build_object(
      'activas', ordenes.activas,
      'completadas', ordenes.completadas,
      'aprobacionesPendientes', ordenes.aprobaciones_pendientes,
      'atrasadas', ordenes.atrasadas,
      'enRiesgo', ordenes.en_riesgo
    ),
    'finanzas', jsonb_build_object(
      'arPendiente', round(finanzas.ar_pendiente, 4),
      'arVencido', round(finanzas.ar_vencido, 4),
      'cxpPendiente', round(finanzas.cxp_pendiente, 4),
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
    )
  )
  INTO v_anterior
  FROM ingresos, cotizado, ordenes, costos, finanzas;

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz) IS
  'Consolida ventas, órdenes y finanzas en MXN para el intervalo solicitado y su periodo anterior.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Métricas de vendedor y configuración mensual. La función solo acepta un
--    perfil activo con rol vendedor; aun service_role no puede consultar la
--    cartera de otro rol por accidente.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.obtener_metricas_vendedor(
  p_usuario_id uuid,
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_mes_actual date;
  v_mes_anterior date;
  v_meta_actual numeric := 0;
  v_meta_anterior numeric := 0;
  v_comision_actual numeric := 0;
  v_comision_anterior numeric := 0;
  v_real_actual numeric := 0;
  v_real_anterior numeric := 0;
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_usuario_id IS NULL
     OR p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_vendedor_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS usuario
  WHERE usuario.id = p_usuario_id
    AND usuario.rol = 'vendedor'
    AND usuario.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendedor_no_activo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;
  v_mes_actual := date_trunc('month', (p_fecha_fin - interval '1 microsecond'))::date;
  v_mes_anterior := date_trunc('month', (v_anterior_fin - interval '1 microsecond'))::date;

  SELECT COALESCE(meta.meta_mensual_mxn, 0), COALESCE(meta.porcentaje_comision, 0)
  INTO v_meta_actual, v_comision_actual
  FROM public.metas_vendedor AS meta
  WHERE meta.vendedor_id = p_usuario_id AND meta.mes = v_mes_actual;
  SELECT COALESCE(meta.meta_mensual_mxn, 0), COALESCE(meta.porcentaje_comision, 0)
  INTO v_meta_anterior, v_comision_anterior
  FROM public.metas_vendedor AS meta
  WHERE meta.vendedor_id = p_usuario_id AND meta.mes = v_mes_anterior;

  SELECT COALESCE(SUM(
    CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
         ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
  ), 0)
  INTO v_real_actual
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  INNER JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
  WHERE pipeline.vendedor_id = p_usuario_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.fecha_emision >= p_fecha_inicio
    AND cuenta.fecha_emision < p_fecha_fin;

  SELECT COALESCE(SUM(
    CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
         ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
  ), 0)
  INTO v_real_anterior
  FROM public.cuentas_por_cobrar AS cuenta
  INNER JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  INNER JOIN public.pipeline AS pipeline ON pipeline.id = orden.cotizacion_id
  WHERE pipeline.vendedor_id = p_usuario_id
    AND cuenta.estado <> 'cancelado'
    AND cuenta.fecha_emision >= v_anterior_inicio
    AND cuenta.fecha_emision < v_anterior_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE pipeline.etapa = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE pipeline.etapa = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE pipeline.etapa = 'cotizado'),
      'negociacion', COUNT(*) FILTER (WHERE pipeline.etapa = 'negociacion'),
      'ganada', COUNT(*) FILTER (WHERE pipeline.etapa = 'ganada'),
      'perdida', COUNT(*) FILTER (WHERE pipeline.etapa = 'perdida')
    ),
    'cotizacionesSinSeguimiento', COUNT(*) FILTER (
      WHERE pipeline.etapa IN ('cotizado', 'negociacion')
        AND pipeline.fecha_envio_cotizacion IS NOT NULL
        AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
          < p_fecha_fin - interval '3 days'
    ),
    'metaMensual', jsonb_build_object(
      'metaMxn', round(v_meta_actual, 4),
      'realMxn', round(v_real_actual, 4),
      'porcentajeCumplimiento', CASE WHEN v_meta_actual > 0
        THEN round(v_real_actual / v_meta_actual * 100, 4) ELSE 0 END
    ),
    'comisionAcumuladaMxn', round(v_real_actual * v_comision_actual / 100, 4)
  ) INTO v_actual
  FROM public.pipeline AS pipeline
  WHERE pipeline.vendedor_id = p_usuario_id
    AND pipeline.creado_en >= p_fecha_inicio
    AND pipeline.creado_en < p_fecha_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE pipeline.etapa = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE pipeline.etapa = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE pipeline.etapa = 'cotizado'),
      'negociacion', COUNT(*) FILTER (WHERE pipeline.etapa = 'negociacion'),
      'ganada', COUNT(*) FILTER (WHERE pipeline.etapa = 'ganada'),
      'perdida', COUNT(*) FILTER (WHERE pipeline.etapa = 'perdida')
    ),
    'cotizacionesSinSeguimiento', COUNT(*) FILTER (
      WHERE pipeline.etapa IN ('cotizado', 'negociacion')
        AND pipeline.fecha_envio_cotizacion IS NOT NULL
        AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
          < v_anterior_fin - interval '3 days'
    ),
    'metaMensual', jsonb_build_object(
      'metaMxn', round(v_meta_anterior, 4),
      'realMxn', round(v_real_anterior, 4),
      'porcentajeCumplimiento', CASE WHEN v_meta_anterior > 0
        THEN round(v_real_anterior / v_meta_anterior * 100, 4) ELSE 0 END
    ),
    'comisionAcumuladaMxn', round(v_real_anterior * v_comision_anterior / 100, 4)
  ) INTO v_anterior
  FROM public.pipeline AS pipeline
  WHERE pipeline.vendedor_id = p_usuario_id
    AND pipeline.creado_en >= v_anterior_inicio
    AND pipeline.creado_en < v_anterior_fin;

  RETURN jsonb_build_object(
    'version', 1,
    'usuarioId', p_usuario_id,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz) IS
  'Métricas del pipeline, seguimiento, meta y comisión de un vendedor activo, sin acceso cruzado.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Pipeline de equipo para gerencia. Se mantiene separado de la función
--    ejecutiva para no transportar finanzas a un rol sin `ver_finanzas`.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.obtener_metricas_pipeline_equipo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_ahora timestamptz := now();
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_equipo_invalido' USING ERRCODE = 'check_violation';
  END IF;
  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE pipeline.etapa = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE pipeline.etapa = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE pipeline.etapa = 'cotizado'),
      'negociacion', COUNT(*) FILTER (WHERE pipeline.etapa = 'negociacion'),
      'ganada', COUNT(*) FILTER (WHERE pipeline.etapa = 'ganada'),
      'perdida', COUNT(*) FILTER (WHERE pipeline.etapa = 'perdida')
    ),
     'cotizacionesSinSeguimiento', COUNT(*) FILTER (
       WHERE pipeline.etapa IN ('cotizado', 'negociacion')
         AND pipeline.fecha_envio_cotizacion IS NOT NULL
         AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
           < p_fecha_fin - interval '3 days'
     ),
     'ordenes', (
       SELECT jsonb_build_object(
         'activas', COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado = 'completada'),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado = 'borrador'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         )
       )
       FROM public.ordenes_produccion AS orden
       WHERE orden.creado_en >= p_fecha_inicio AND orden.creado_en < p_fecha_fin
     )
  ) INTO v_actual
  FROM public.pipeline AS pipeline
  WHERE pipeline.creado_en >= p_fecha_inicio AND pipeline.creado_en < p_fecha_fin;

  SELECT jsonb_build_object(
    'pipelinePorEtapa', jsonb_build_object(
      'prospecto', COUNT(*) FILTER (WHERE pipeline.etapa = 'prospecto'),
      'contactado', COUNT(*) FILTER (WHERE pipeline.etapa = 'contactado'),
      'cotizado', COUNT(*) FILTER (WHERE pipeline.etapa = 'cotizado'),
      'negociacion', COUNT(*) FILTER (WHERE pipeline.etapa = 'negociacion'),
      'ganada', COUNT(*) FILTER (WHERE pipeline.etapa = 'ganada'),
      'perdida', COUNT(*) FILTER (WHERE pipeline.etapa = 'perdida')
    ),
     'cotizacionesSinSeguimiento', COUNT(*) FILTER (
       WHERE pipeline.etapa IN ('cotizado', 'negociacion')
         AND pipeline.fecha_envio_cotizacion IS NOT NULL
         AND COALESCE(pipeline.fecha_ultimo_contacto, pipeline.fecha_envio_cotizacion)
           < v_anterior_fin - interval '3 days'
     ),
     'ordenes', (
       SELECT jsonb_build_object(
         'activas', COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada')),
         'completadas', COUNT(*) FILTER (WHERE orden.estado = 'completada'),
         'aprobacionesPendientes', COUNT(*) FILTER (WHERE orden.estado = 'borrador'),
         'atrasadas', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso < v_ahora
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         ),
         'enRiesgo', COUNT(*) FILTER (
           WHERE orden.fecha_compromiso >= v_ahora
             AND orden.fecha_compromiso < v_ahora + interval '3 days'
             AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
         )
       )
       FROM public.ordenes_produccion AS orden
       WHERE orden.creado_en >= v_anterior_inicio AND orden.creado_en < v_anterior_fin
     )
  ) INTO v_anterior
  FROM public.pipeline AS pipeline
  WHERE pipeline.creado_en >= v_anterior_inicio AND pipeline.creado_en < v_anterior_fin;

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz) IS
  'Consolida el pipeline y seguimientos del equipo sin transportar datos financieros.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_pipeline_equipo(timestamptz, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Métricas de Contabilidad. Se mantienen separadas de la vista ejecutiva para
--    que el contador reciba CxC/CxP y flujo de caja sin recibir el margen global.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_metricas_contador(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.obtener_metricas_contador(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_ahora timestamptz := now();
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_contador_invalido' USING ERRCODE = 'check_violation';
  END IF;
  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  WITH pagos AS (
    SELECT COALESCE(SUM(pago.monto_pagado * pago.tipo_cambio_pago), 0)::numeric AS cobrado
    FROM public.pagos_ar AS pago
    WHERE pago.creado_en >= p_fecha_inicio AND pago.creado_en < p_fecha_fin
  ), cartera AS (
    SELECT
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS pendiente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora
      ), 0)::numeric AS vencido,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento >= v_ahora
      ), 0)::numeric AS corriente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora
          AND cuenta.fecha_vencimiento >= v_ahora - interval '30 days'
      ), 0)::numeric AS uno_treinta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '30 days'
          AND cuenta.fecha_vencimiento >= v_ahora - interval '60 days'
      ), 0)::numeric AS treinta_sesenta,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '60 days'
          AND cuenta.fecha_vencimiento >= v_ahora - interval '90 days'
      ), 0)::numeric AS sesenta_noventa,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (
        WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora - interval '90 days'
      ), 0)::numeric AS mayor_noventa
    FROM public.cuentas_por_cobrar AS cuenta
  ), cxp AS (
    SELECT
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS pendiente,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.fecha_vencimiento >= v_ahora), 0)::numeric AS por_vencer,
      COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FILTER (WHERE gasto.estado_pago = 'pendiente' AND gasto.fecha_vencimiento < v_ahora), 0)::numeric AS vencido
    FROM public.gastos AS gasto
  ), salidas AS (
    SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)::numeric AS monto
    FROM public.gastos AS gasto
    WHERE gasto.estado_pago <> 'cancelado'
      AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin
  )
  SELECT jsonb_build_object(
    'cobranza', jsonb_build_object(
      'cobradoMxn', round(pagos.cobrado, 4),
      'arPendienteMxn', round(cartera.pendiente, 4),
      'arVencidoMxn', round(cartera.vencido, 4)
    ),
    'aging', jsonb_build_object(
      'corrienteMxn', round(cartera.corriente, 4),
      'unoTreintaMxn', round(cartera.uno_treinta, 4),
      'treintaSesentaMxn', round(cartera.treinta_sesenta, 4),
      'sesentaNoventaMxn', round(cartera.sesenta_noventa, 4),
      'mayorNoventaMxn', round(cartera.mayor_noventa, 4)
    ),
    'cxp', jsonb_build_object(
      'pendienteMxn', round(cxp.pendiente, 4),
      'porVencerMxn', round(cxp.por_vencer, 4),
      'vencidoMxn', round(cxp.vencido, 4)
    ),
    'flujoCaja', jsonb_build_object(
      'entradasMxn', round(pagos.cobrado, 4),
      'salidasMxn', round(salidas.monto, 4),
      'netoMxn', round(pagos.cobrado - salidas.monto, 4)
    )
  )
  INTO v_actual
  FROM pagos, cartera, cxp, salidas;

  WITH pagos AS (
    SELECT COALESCE(SUM(pago.monto_pagado * pago.tipo_cambio_pago), 0)::numeric AS cobrado
    FROM public.pagos_ar AS pago
    WHERE pago.creado_en >= v_anterior_inicio AND pago.creado_en < v_anterior_fin
  ), salidas AS (
    SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)::numeric AS monto
    FROM public.gastos AS gasto
    WHERE gasto.estado_pago <> 'cancelado'
      AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin
  ), cartera AS (
    SELECT
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS pendiente,
      COALESCE(SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END) FILTER (WHERE cuenta.estado IN ('pendiente', 'parcial') AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS vencido
    FROM public.cuentas_por_cobrar AS cuenta
  ), cxp AS (
    SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
      FILTER (WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS pendiente
    FROM public.gastos AS gasto
  )
  SELECT jsonb_build_object(
    'cobranza', jsonb_build_object(
      'cobradoMxn', round(pagos.cobrado, 4),
      'arPendienteMxn', round(cartera.pendiente, 4),
      'arVencidoMxn', round(cartera.vencido, 4)
    ),
    'aging', jsonb_build_object(
      'corrienteMxn', 0,
      'unoTreintaMxn', 0,
      'treintaSesentaMxn', 0,
      'sesentaNoventaMxn', 0,
      'mayorNoventaMxn', round(cartera.vencido, 4)
    ),
    'cxp', jsonb_build_object(
      'pendienteMxn', round(cxp.pendiente, 4),
      'porVencerMxn', 0,
      'vencidoMxn', 0
    ),
    'flujoCaja', jsonb_build_object(
      'entradasMxn', round(pagos.cobrado, 4),
      'salidasMxn', round(salidas.monto, 4),
      'netoMxn', round(pagos.cobrado - salidas.monto, 4)
    )
  )
  INTO v_anterior
  FROM pagos, cartera, cxp, salidas;

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz) IS
  'Consolida CxC, aging, CxP y flujo de caja para el rol contador, sin margen ejecutivo.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_contador(timestamptz, timestamptz)
  TO service_role;
