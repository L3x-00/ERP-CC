-- =============================================================================
-- SII-B8 F5 (base) — Tesorería: saldos, transferencias internas y conciliación
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.2/§8.3 F5; decisiones PO 2026-10-06:
--   * saldo inicial por cuenta + saldo calculado con movimientos vivos MXN;
--   * efectivo como cuenta (tipo banco/efectivo);
--   * transferencias internas como par enlazado, misma moneda, fuera de KPIs;
--   * conciliación básica por marca manual auditada (sin importar extractos).
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- 1. Tipo de cuenta (banco/efectivo).
ALTER TABLE public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'banco';
ALTER TABLE public.cuentas_bancarias DROP CONSTRAINT IF EXISTS cuentas_bancarias_tipo_check;
ALTER TABLE public.cuentas_bancarias ADD CONSTRAINT cuentas_bancarias_tipo_check
  CHECK (tipo IN ('banco', 'efectivo'));
COMMENT ON COLUMN public.cuentas_bancarias.tipo IS
'SII-B8 F5: banco o efectivo; el efectivo se modela como una cuenta más (§8.2).';

-- 2. Saldo inicial por cuenta (registrable, con TC a MXN y auditoría).
CREATE TABLE IF NOT EXISTS public.saldos_iniciales_tesoreria (
  cuenta_id uuid PRIMARY KEY REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  monto numeric(14, 4) NOT NULL
    CONSTRAINT saldos_iniciales_monto_check CHECK (monto >= 0),
  moneda text NOT NULL
    CONSTRAINT saldos_iniciales_moneda_check CHECK (moneda IN ('MXN', 'USD')),
  tipo_cambio numeric(14, 4) NOT NULL DEFAULT 1
    CONSTRAINT saldos_iniciales_tc_check CHECK (tipo_cambio > 0 AND (moneda <> 'MXN' OR tipo_cambio = 1)),
  fecha date NOT NULL DEFAULT current_date,
  creado_por uuid REFERENCES public.usuarios(id),
  actualizado_por uuid REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saldos_iniciales_tesoreria IS
'SII-B8 F5: saldo inicial de tesorería por cuenta (en la moneda de la cuenta y su TC a MXN); editable con auditoría.';

DROP TRIGGER IF EXISTS trigger_saldos_iniciales_actualizado_en ON public.saldos_iniciales_tesoreria;
CREATE TRIGGER trigger_saldos_iniciales_actualizado_en
  BEFORE UPDATE ON public.saldos_iniciales_tesoreria
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- 3. Transferencias internas: par de movimientos enlazados (no ingreso/gasto).
CREATE TABLE IF NOT EXISTS public.movimientos_tesoreria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id),
  tipo text NOT NULL
    CONSTRAINT movimientos_tesoreria_tipo_check CHECK (tipo IN ('TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA')),
  monto numeric(14, 4) NOT NULL
    CONSTRAINT movimientos_tesoreria_monto_check CHECK (monto > 0),
  moneda text NOT NULL
    CONSTRAINT movimientos_tesoreria_moneda_check CHECK (moneda IN ('MXN', 'USD')),
  referencia text,
  par_movimiento_id uuid UNIQUE REFERENCES public.movimientos_tesoreria(id),
  creado_por uuid NOT NULL REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.movimientos_tesoreria IS
'SII-B8 F5: transferencias internas entre cuentas como par SALIDA/ENTRADA enlazado; excluidas de ingresos/gastos y KPIs.';

CREATE INDEX IF NOT EXISTS ix_movimientos_tesoreria_cuenta
  ON public.movimientos_tesoreria (cuenta_id, creado_en DESC);

-- 4. Conciliación básica: marca manual auditada por movimiento.
CREATE TABLE IF NOT EXISTS public.conciliaciones_tesoreria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id),
  entidad text NOT NULL
    CONSTRAINT conciliaciones_entidad_check CHECK (entidad IN ('cobro', 'pago_compra', 'gasto', 'transferencia')),
  entidad_id uuid NOT NULL,
  conciliado_por uuid NOT NULL REFERENCES public.usuarios(id),
  conciliado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conciliaciones_movimiento_unico UNIQUE (entidad, entidad_id)
);

COMMENT ON TABLE public.conciliaciones_tesoreria IS
'SII-B8 F5: marca de conciliación manual (quién y cuándo) de cobros, pagos a proveedor, gastos y transferencias; no importa extractos.';

CREATE INDEX IF NOT EXISTS ix_conciliaciones_cuenta
  ON public.conciliaciones_tesoreria (cuenta_id);

-- 5. RLS y privilegios (lectura con ver_finanzas; escritura solo por RPC).
ALTER TABLE public.saldos_iniciales_tesoreria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saldos_iniciales_seleccionar ON public.saldos_iniciales_tesoreria;
CREATE POLICY saldos_iniciales_seleccionar ON public.saldos_iniciales_tesoreria
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.saldos_iniciales_tesoreria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saldos_iniciales_tesoreria TO authenticated;
GRANT ALL ON public.saldos_iniciales_tesoreria TO service_role;

ALTER TABLE public.movimientos_tesoreria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimientos_tesoreria_seleccionar ON public.movimientos_tesoreria;
CREATE POLICY movimientos_tesoreria_seleccionar ON public.movimientos_tesoreria
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.movimientos_tesoreria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.movimientos_tesoreria TO authenticated;
GRANT ALL ON public.movimientos_tesoreria TO service_role;

ALTER TABLE public.conciliaciones_tesoreria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conciliaciones_seleccionar ON public.conciliaciones_tesoreria;
CREATE POLICY conciliaciones_seleccionar ON public.conciliaciones_tesoreria
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.conciliaciones_tesoreria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conciliaciones_tesoreria TO authenticated;
GRANT ALL ON public.conciliaciones_tesoreria TO service_role;
