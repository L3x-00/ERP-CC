-- A19: el CAS debe avanzar incluso si dos escrituras ocurren en una transacción.
-- El trigger genérico usa now(), constante durante toda la transacción.
CREATE OR REPLACE FUNCTION public.actualizar_gasto_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizado_en := greatest(clock_timestamp(), OLD.actualizado_en + interval '1 microsecond');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.actualizar_gasto_timestamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_gastos_actualizado_en ON public.gastos;
CREATE TRIGGER trigger_gastos_actualizado_en
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_gasto_timestamp();
