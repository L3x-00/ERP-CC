-- =============================================================================
-- SII-B8 F3 (base) — Aplicaciones many-to-many y promesas de pago
-- Plan: docs/plan-erp-sii/08-finanzas.md §8.2/§8.3 F3; decisiones PO 2026-10-06:
--   * un recibo RP puede aplicarse a varias facturas del mismo cliente;
--   * recibos repartidos usan RP-MMYY_0000-YY (contador global del periodo);
--   * promesas con aviso 2 días antes y al vencer; CUMPLIDA automática al pagar.
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- 1. Aplicaciones de un recibo sobre una o varias AR (N:M).
CREATE TABLE IF NOT EXISTS public.aplicaciones_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id uuid NOT NULL REFERENCES public.pagos_ar(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  monto numeric(14, 4) NOT NULL CONSTRAINT aplicaciones_pago_monto_check CHECK (monto > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aplicaciones_pago_pago_cuenta_unica UNIQUE (pago_id, cuenta_id)
);

COMMENT ON TABLE public.aplicaciones_pago IS
'SII-B8 F3: reparto de un recibo (pago) entre una o varias cuentas por cobrar del mismo cliente; monto en la moneda de la AR.';

CREATE INDEX IF NOT EXISTS ix_aplicaciones_cuenta ON public.aplicaciones_pago (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago ON public.aplicaciones_pago (pago_id);

-- 2. El recibo puede existir sin una AR única (cobros repartidos).
ALTER TABLE public.pagos_ar ALTER COLUMN ar_id DROP NOT NULL;
COMMENT ON COLUMN public.pagos_ar.ar_id IS
'SII-B8 F3: AR principal cuando el recibo aplica a una sola cuenta; NULL en cobros repartidos (ver aplicaciones_pago).';

ALTER TABLE public.reversos_pago_ar ALTER COLUMN ar_id DROP NOT NULL;
COMMENT ON COLUMN public.reversos_pago_ar.ar_id IS
'SII-B8 F3: AR principal del recibo (NULL en cobros repartidos; el detalle vive en aplicaciones_pago).';

-- 3. Backfill: cada pago histórico con AR queda con su aplicación única.
INSERT INTO public.aplicaciones_pago (pago_id, cuenta_id, monto)
SELECT pago.id, pago.ar_id, pago.monto_aplicado_ar
FROM public.pagos_ar AS pago
WHERE pago.ar_id IS NOT NULL AND pago.monto_aplicado_ar > 0
ON CONFLICT (pago_id, cuenta_id) DO NOTHING;

-- 4. Promesas de pago (una activa por AR; recordatorios idempotentes).
CREATE TABLE IF NOT EXISTS public.promesas_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  fecha_prometida date NOT NULL,
  monto numeric(14, 4) NOT NULL CONSTRAINT promesas_pago_monto_check CHECK (monto > 0),
  estado text NOT NULL DEFAULT 'VIGENTE'
    CONSTRAINT promesas_pago_estado_check CHECK (estado IN ('VIGENTE', 'CUMPLIDA', 'VENCIDA', 'CANCELADA')),
  motivo_cancelacion text,
  recordatorio_previo_en timestamptz,
  recordatorio_vencida_en timestamptz,
  creado_por uuid NOT NULL REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promesas_pago_cancelada_completa CHECK (
    estado <> 'CANCELADA'
    OR nullif(btrim(coalesce(motivo_cancelacion, '')), '') IS NOT NULL)
);

COMMENT ON TABLE public.promesas_pago IS
'SII-B8 F3: promesa de pago de una AR (VIGENTE→CUMPLIDA/VENCIDA/CANCELADA) con recordatorios idempotentes 2 días antes y al vencer.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_promesas_activa_por_cuenta
  ON public.promesas_pago (cuenta_id)
  WHERE estado IN ('VIGENTE', 'VENCIDA');
CREATE INDEX IF NOT EXISTS ix_promesas_estado_fecha
  ON public.promesas_pago (estado, fecha_prometida);

DROP TRIGGER IF EXISTS trigger_promesas_pago_actualizado_en ON public.promesas_pago;
CREATE TRIGGER trigger_promesas_pago_actualizado_en
  BEFORE UPDATE ON public.promesas_pago
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- 5. RLS y privilegios (lectura con ver_finanzas; escritura solo por RPC).
ALTER TABLE public.aplicaciones_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aplicaciones_pago_seleccionar ON public.aplicaciones_pago;
CREATE POLICY aplicaciones_pago_seleccionar ON public.aplicaciones_pago
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.aplicaciones_pago FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aplicaciones_pago TO authenticated;
GRANT ALL ON public.aplicaciones_pago TO service_role;

ALTER TABLE public.promesas_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promesas_pago_seleccionar ON public.promesas_pago;
CREATE POLICY promesas_pago_seleccionar ON public.promesas_pago
  FOR SELECT TO authenticated
  USING (privado.es_admin() OR privado.usuario_tiene_permiso('ver_finanzas'));
REVOKE ALL ON public.promesas_pago FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.promesas_pago TO authenticated;
GRANT ALL ON public.promesas_pago TO service_role;
