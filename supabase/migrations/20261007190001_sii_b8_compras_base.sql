-- =============================================================================
-- SII-B8 F4 (base) — Compras/CxP con folio CG-MMYY_#### y pagos a proveedores
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.2/§8.3 F4; decisiones PO 2026-10-06:
--   * compra = cabecera (proveedor, orden opcional, montos, vencimiento);
--   * serie CG-MMYY_#### compartida entre compras y gastos nuevos;
--   * pagos parciales con saldo (pendiente/parcial/pagada);
--   * las compras no entran a la rentabilidad (el costo sigue viniendo de gastos).
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- 1. Compras (orden de compra / CxP formal).
CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_sii text NOT NULL
    CONSTRAINT compras_folio_formato CHECK (folio_sii ~ '^CG-[0-9]{4}_[0-9]{4,}$'),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  orden_id uuid REFERENCES public.ordenes_produccion(id),
  estado text NOT NULL DEFAULT 'BORRADOR'
    CONSTRAINT compras_estado_check CHECK (estado IN ('BORRADOR', 'CONFIRMADA', 'RECIBIDA', 'PAGADA', 'CANCELADA')),
  monto_subtotal numeric(14, 4) NOT NULL
    CONSTRAINT compras_subtotal_check CHECK (monto_subtotal >= 0),
  monto_iva numeric(14, 4) NOT NULL DEFAULT 0
    CONSTRAINT compras_iva_check CHECK (monto_iva >= 0),
  monto_total numeric(14, 4) NOT NULL
    CONSTRAINT compras_total_coherente CHECK (monto_total = round(monto_subtotal + monto_iva, 4)),
  moneda text NOT NULL DEFAULT 'MXN'
    CONSTRAINT compras_moneda_check CHECK (moneda IN ('MXN', 'USD')),
  tipo_cambio numeric(14, 4) NOT NULL DEFAULT 1
    CONSTRAINT compras_tipo_cambio_check CHECK (tipo_cambio > 0 AND (moneda <> 'MXN' OR tipo_cambio = 1)),
  saldo_pendiente numeric(14, 4) NOT NULL
    CONSTRAINT compras_saldo_check CHECK (saldo_pendiente >= 0),
  fecha_compra timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento date,
  notas text,
  motivo_cancelacion text,
  cancelada_en timestamptz,
  creado_por uuid NOT NULL REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compras_vencimiento_coherente CHECK (
    fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_compra::date),
  CONSTRAINT compras_cancelada_completa CHECK (
    estado <> 'CANCELADA' OR (cancelada_en IS NOT NULL
      AND nullif(btrim(coalesce(motivo_cancelacion, '')), '') IS NOT NULL))
);

COMMENT ON TABLE public.compras IS
'SII-B8 F4: compra/orden de compra con folio CG-MMYY_####, CxP por saldo y pagos parciales a proveedores; no entra a rentabilidad de órdenes.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_compras_folio_sii ON public.compras (folio_sii);
CREATE INDEX IF NOT EXISTS ix_compras_estado ON public.compras (estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_compras_proveedor ON public.compras (proveedor_id);

DROP TRIGGER IF EXISTS trigger_compras_actualizado_en ON public.compras;
CREATE TRIGGER trigger_compras_actualizado_en
  BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- 2. Pagos a proveedores (parciales, moneda de la compra).
CREATE TABLE IF NOT EXISTS public.pagos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE RESTRICT,
  monto numeric(14, 4) NOT NULL CONSTRAINT pagos_compra_monto_check CHECK (monto > 0),
  fecha_pago timestamptz NOT NULL DEFAULT now(),
  metodo_pago text NOT NULL
    CONSTRAINT pagos_compra_metodo_check CHECK (metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'tarjeta')),
  referencia text,
  cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id),
  notas text,
  creado_por uuid NOT NULL REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pagos_compra IS
'SII-B8 F4: pago (parcial/total) de una compra en la moneda de la compra; reduce saldo_pendiente y deriva PAGADA.';

CREATE INDEX IF NOT EXISTS ix_pagos_compra_compra ON public.pagos_compra (compra_id);

-- 3. Gastos nuevos con folio CG compartido (históricos conservan GTO).
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS folio_sii text;
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_folio_sii_formato;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_folio_sii_formato
  CHECK (folio_sii IS NULL OR folio_sii ~ '^CG-[0-9]{4}_[0-9]{4,}$');
CREATE UNIQUE INDEX IF NOT EXISTS ux_gastos_folio_sii
  ON public.gastos (folio_sii) WHERE folio_sii IS NOT NULL;
COMMENT ON COLUMN public.gastos.folio_sii IS
'SII-B8 F4: folio CG-MMYY_#### de la serie compartida compras/gastos; NULL en históricos con folio GTO.';

-- 4. Generador CG compartido (máximo real entre gastos y compras del periodo).
CREATE OR REPLACE FUNCTION privado.siguiente_folio_cg()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_periodo text := to_char(now(), 'MMYY');
  v_max integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('folio-cg:' || v_periodo, 0));

  SELECT greatest(coalesce(max(documento.ultimo), 0), 0)
  INTO v_max
  FROM (
    SELECT split_part(gasto.folio_sii, '_', 2)::integer AS ultimo
    FROM public.gastos AS gasto
    WHERE gasto.folio_sii ~ ('^CG-' || v_periodo || '_[0-9]{4,}$')
    UNION ALL
    SELECT split_part(compra.folio_sii, '_', 2)::integer AS ultimo
    FROM public.compras AS compra
    WHERE compra.folio_sii ~ ('^CG-' || v_periodo || '_[0-9]{4,}$')
  ) AS documento;

  v_max := v_max + 1;
  RETURN 'CG-' || v_periodo || '_' ||
    CASE WHEN v_max < 10000 THEN lpad(v_max::text, 4, '0') ELSE v_max::text END;
END;
$function$;

COMMENT ON FUNCTION privado.siguiente_folio_cg() IS
'SII-B8 F4: CG-MMYY_#### compartido por gastos y compras (máximo real del periodo con advisory lock; CASE para 10000+).';

REVOKE ALL ON FUNCTION privado.siguiente_folio_cg()
  FROM PUBLIC, anon, authenticated, service_role;

-- 5. RLS y privilegios.
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_seleccionar ON public.compras;
CREATE POLICY compras_seleccionar ON public.compras
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.compras FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.compras TO authenticated;
GRANT ALL ON public.compras TO service_role;

ALTER TABLE public.pagos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_compra_seleccionar ON public.pagos_compra;
CREATE POLICY pagos_compra_seleccionar ON public.pagos_compra
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.pagos_compra FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pagos_compra TO authenticated;
GRANT ALL ON public.pagos_compra TO service_role;
