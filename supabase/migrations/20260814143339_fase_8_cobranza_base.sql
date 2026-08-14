-- =============================================================================
-- Fase 8.1: Cuentas por cobrar y monedero de cliente.
--
-- Los montos de cada AR viven en la moneda de la cuenta. El monedero del
-- cliente se denomina siempre en MXN para no mezclar divisas en saldo_a_favor.
-- Todas las mutaciones posteriores quedan restringidas a RPCs service_role.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_recibo START 1001;

CREATE OR REPLACE FUNCTION public.generar_folio_recibo(p_prefijo text DEFAULT 'REC')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prefijo text := upper(trim(coalesce(p_prefijo, '')));
BEGIN
  IF v_prefijo <> 'REC' THEN
    RAISE EXCEPTION 'El prefijo de un recibo debe ser REC'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN 'REC-' || lpad(nextval('public.secuencia_folio_recibo')::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_recibo(text) IS
  'Genera folios REC-NNNNNN atómicos; solo service_role puede invocarla.';

REVOKE ALL ON SEQUENCE public.secuencia_folio_recibo FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.secuencia_folio_recibo TO service_role;
REVOKE EXECUTE ON FUNCTION public.generar_folio_recibo(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_recibo(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.cuentas_por_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL UNIQUE REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE RESTRICT,
  folio_factura_remision text,
  monto_total numeric(12, 4) NOT NULL CHECK (monto_total > 0),
  saldo_pendiente numeric(12, 4) NOT NULL CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto_total),
  moneda text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'MXN')),
  -- MXN por una unidad de la moneda de la cuenta. USD=18.50 significa 1 USD = 18.50 MXN.
  tipo_cambio_origen numeric(10, 4) NOT NULL DEFAULT 1.0000 CHECK (tipo_cambio_origen > 0),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'cancelado')),
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cuentas_por_cobrar_estado_saldo_coherente CHECK (
    (estado = 'pendiente' AND saldo_pendiente = monto_total)
    OR (estado = 'parcial' AND saldo_pendiente > 0 AND saldo_pendiente < monto_total)
    OR (estado = 'pagado' AND saldo_pendiente = 0)
    OR estado = 'cancelado'
  )
);

COMMENT ON TABLE public.cuentas_por_cobrar IS
  'Cuenta AR inmutable en importe original; saldo y estado solo cambian dentro de RPCs atómicas.';

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_cliente_estado_vencimiento
  ON public.cuentas_por_cobrar (cliente_id, estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_pendientes_vencimiento
  ON public.cuentas_por_cobrar (fecha_vencimiento, cliente_id)
  WHERE estado IN ('pendiente', 'parcial');

DROP TRIGGER IF EXISTS trigger_cuentas_por_cobrar_actualizado_en ON public.cuentas_por_cobrar;
CREATE TRIGGER trigger_cuentas_por_cobrar_actualizado_en
  BEFORE UPDATE ON public.cuentas_por_cobrar
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

CREATE TABLE IF NOT EXISTS public.pagos_ar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar (id) ON DELETE RESTRICT,
  folio_recibo text NOT NULL UNIQUE CHECK (folio_recibo ~ '^REC-[0-9]{6}$'),
  -- UUID de la intención del navegador: evita que un reintento o doble clic duplique un cobro.
  solicitud_id uuid NOT NULL UNIQUE,
  monto_pagado numeric(12, 4) NOT NULL CHECK (monto_pagado > 0),
  moneda_pago text NOT NULL CHECK (moneda_pago IN ('USD', 'MXN')),
  -- MXN por una unidad de moneda_pago.
  tipo_cambio_pago numeric(10, 4) NOT NULL DEFAULT 1.0000 CHECK (tipo_cambio_pago > 0),
  monto_aplicado_ar numeric(12, 4) NOT NULL CHECK (monto_aplicado_ar >= 0),
  monto_sobrepago_ar numeric(12, 4) NOT NULL DEFAULT 0 CHECK (monto_sobrepago_ar >= 0),
  metodo_pago text NOT NULL CHECK (metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'saldo_a_favor')),
  referencia_bancaria text,
  cuenta_bancaria_id uuid,
  notas text,
  creado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pagos_ar_distribucion_coherente CHECK (monto_aplicado_ar + monto_sobrepago_ar > 0)
);

COMMENT ON TABLE public.pagos_ar IS
  'Libro mayor inmutable de recibos; solicitud_id garantiza idempotencia financiera.';

CREATE INDEX IF NOT EXISTS idx_pagos_ar_cuenta_creado
  ON public.pagos_ar (ar_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_ar_creado_por
  ON public.pagos_ar (creado_por, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.movimientos_saldo_favor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE RESTRICT,
  ar_id_origen uuid REFERENCES public.cuentas_por_cobrar (id) ON DELETE RESTRICT,
  pago_ar_id uuid UNIQUE REFERENCES public.pagos_ar (id) ON DELETE RESTRICT,
  -- El monedero se expresa exclusivamente en MXN: positivo acredita, negativo aplica.
  monto numeric(12, 4) NOT NULL CHECK (monto <> 0),
  moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda = 'MXN'),
  tipo text NOT NULL CHECK (tipo IN ('credito_sobrepago', 'aplicacion_pago', 'ajuste_manual')),
  descripcion text NOT NULL CHECK (char_length(btrim(descripcion)) >= 3),
  creado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_saldo_favor_signo_coherente CHECK (
    (tipo = 'credito_sobrepago' AND monto > 0)
    OR (tipo = 'aplicacion_pago' AND monto < 0)
    OR tipo = 'ajuste_manual'
  )
);

COMMENT ON TABLE public.movimientos_saldo_favor IS
  'Libro mayor MXN del monedero; el saldo desnormalizado del cliente solo se ajusta junto al movimiento.';

CREATE INDEX IF NOT EXISTS idx_movimientos_saldo_favor_cliente_creado
  ON public.movimientos_saldo_favor (cliente_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_saldo_favor_ar
  ON public.movimientos_saldo_favor (ar_id_origen)
  WHERE ar_id_origen IS NOT NULL;

-- El alta se vuelve explícita porque Producción no persiste importes de venta.
-- Para evitar ciclos con Producción el orden de locks es partidas -> orden -> cliente.
CREATE OR REPLACE FUNCTION public.abrir_cuenta_por_cobrar(
  p_orden_id uuid,
  p_monto_total numeric,
  p_moneda text,
  p_tipo_cambio_origen numeric,
  p_fecha_vencimiento timestamptz,
  p_folio_factura_remision text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cliente_id uuid,
  saldo_pendiente numeric,
  moneda text,
  estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente_id uuid;
  v_estado_orden text;
BEGIN
  IF p_orden_id IS NULL
     OR p_monto_total IS NULL OR p_monto_total <= 0
     OR p_monto_total IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0
     OR p_tipo_cambio_origen IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_fecha_vencimiento IS NULL
     OR upper(trim(coalesce(p_moneda, ''))) NOT IN ('USD', 'MXN') THEN
    RAISE EXCEPTION 'datos_cuenta_por_cobrar_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;

  SELECT orden.cliente_id, orden.estado
  INTO v_cliente_id, v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_estado_orden <> 'completada' OR EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_no_lista_para_cobranza' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.clientes AS cliente
  WHERE cliente.id = v_cliente_id
    AND cliente.estado = 'activo'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.cuentas_por_cobrar (
    orden_id, cliente_id, folio_factura_remision, monto_total, saldo_pendiente,
    moneda, tipo_cambio_origen, estado, fecha_vencimiento
  ) VALUES (
    p_orden_id, v_cliente_id, NULLIF(btrim(p_folio_factura_remision), ''),
    round(p_monto_total, 4), round(p_monto_total, 4), upper(trim(p_moneda)),
    round(p_tipo_cambio_origen, 4), 'pendiente', p_fecha_vencimiento
  )
  RETURNING
    cuentas_por_cobrar.id,
    cuentas_por_cobrar.cliente_id,
    cuentas_por_cobrar.saldo_pendiente,
    cuentas_por_cobrar.moneda,
    cuentas_por_cobrar.estado;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'cuenta_por_cobrar_ya_existe' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)
  TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.cuentas_por_cobrar FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.pagos_ar FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.movimientos_saldo_favor FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cuentas_por_cobrar TO authenticated;
GRANT SELECT ON TABLE public.pagos_ar TO authenticated;
GRANT SELECT ON TABLE public.movimientos_saldo_favor TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cuentas_por_cobrar TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.pagos_ar TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.movimientos_saldo_favor TO service_role;

ALTER TABLE public.cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_ar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_saldo_favor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuentas_por_cobrar_seleccionar ON public.cuentas_por_cobrar;
CREATE POLICY cuentas_por_cobrar_seleccionar ON public.cuentas_por_cobrar
  FOR SELECT TO authenticated
  USING ((SELECT privado.es_admin()) OR (SELECT privado.usuario_tiene_permiso('ver_finanzas')));

DROP POLICY IF EXISTS pagos_ar_seleccionar ON public.pagos_ar;
CREATE POLICY pagos_ar_seleccionar ON public.pagos_ar
  FOR SELECT TO authenticated
  USING ((SELECT privado.es_admin()) OR (SELECT privado.usuario_tiene_permiso('ver_finanzas')));

DROP POLICY IF EXISTS movimientos_saldo_favor_seleccionar ON public.movimientos_saldo_favor;
CREATE POLICY movimientos_saldo_favor_seleccionar ON public.movimientos_saldo_favor
  FOR SELECT TO authenticated
  USING ((SELECT privado.es_admin()) OR (SELECT privado.usuario_tiene_permiso('ver_finanzas')));

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['cuentas_por_cobrar', 'pagos_ar', 'movimientos_saldo_favor']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$$;
