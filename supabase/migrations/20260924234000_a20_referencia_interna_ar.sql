-- A20/AR-01: referencia propia de la cuenta; no sustituye el folio fiscal.
-- El backfill asigna una referencia a cada AR existente sin modificar importes,
-- saldos, vencimientos, pagos ni su vinculación a la orden.
CREATE SEQUENCE IF NOT EXISTS public.secuencia_referencia_ar START WITH 1;

CREATE OR REPLACE FUNCTION public.generar_referencia_ar()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_numero bigint;
BEGIN
  v_numero := nextval('public.secuencia_referencia_ar'::regclass);
  IF v_numero > 9999999 THEN
    RAISE EXCEPTION 'referencia_ar_agotada' USING ERRCODE = 'check_violation';
  END IF;
  RETURN 'INVCNC-' || lpad(v_numero::text, 7, '0');
END;
$$;

REVOKE ALL ON SEQUENCE public.secuencia_referencia_ar FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_referencia_ar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_referencia_ar() TO service_role;

ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS referencia_interna text;

UPDATE public.cuentas_por_cobrar
SET referencia_interna = public.generar_referencia_ar()
WHERE referencia_interna IS NULL;

ALTER TABLE public.cuentas_por_cobrar
  ALTER COLUMN referencia_interna SET DEFAULT public.generar_referencia_ar(),
  ALTER COLUMN referencia_interna SET NOT NULL;

ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_referencia_formato;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_referencia_formato
  CHECK (referencia_interna ~ '^INVCNC-[0-9]{7}$');

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_por_cobrar_referencia_interna_unica
  ON public.cuentas_por_cobrar (referencia_interna);

COMMENT ON COLUMN public.cuentas_por_cobrar.referencia_interna IS
  'AR-01: identificador interno INVCNC-NNNNNNN; independiente del folio fiscal opcional.';

CREATE OR REPLACE FUNCTION privado.impedir_cambio_referencia_ar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.referencia_interna IS DISTINCT FROM OLD.referencia_interna THEN
    RAISE EXCEPTION 'referencia_ar_inmutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION privado.impedir_cambio_referencia_ar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS impedir_cambio_referencia_ar ON public.cuentas_por_cobrar;
CREATE TRIGGER impedir_cambio_referencia_ar
  BEFORE UPDATE OF referencia_interna ON public.cuentas_por_cobrar
  FOR EACH ROW EXECUTE FUNCTION privado.impedir_cambio_referencia_ar();
