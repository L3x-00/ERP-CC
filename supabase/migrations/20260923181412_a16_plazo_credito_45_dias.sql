-- A16/AR-04: corregir únicamente el plazo de la condición crédito para futuras
-- activaciones. Las AR ya cobrables conservan su vencimiento histórico.
CREATE OR REPLACE FUNCTION public.archivar_orden_al_entregar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_pendientes integer;
BEGIN
  SELECT nota.orden_id INTO v_orden_id
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF v_orden_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_orden_id
    AND coalesce(
      (
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        WHERE renglon.partida_id = partida.id
      ),
      0
    ) < partida.cantidad_solicitada;

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = coalesce(archivada_en, now())
    WHERE id = v_orden_id;

    -- D-04: la entrega total vuelve cobrable la AR aún no cobrable. Plazo del
    -- cliente: contado 0; 15_dias 15; 30_dias 30; credito 45;
    -- sin captura o condición desconocida conserva el fallback histórico 30.
    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      cobrable_desde = now(),
      fecha_vencimiento = now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN 'credito' THEN 45
        ELSE 30
      END)
    FROM public.clientes AS cliente
    WHERE cuenta.orden_id = v_orden_id
      AND cuenta.cliente_id = cliente.id
      AND cuenta.cobrable_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archivar_orden_al_entregar() IS
  'OBS-21/D-04/AR-04: archiva al entregar totalmente y activa AR pendiente; crédito vence a 45 días, otras condiciones mantienen su plazo; AR ya cobrables conservan historia.';

REVOKE EXECUTE ON FUNCTION public.archivar_orden_al_entregar()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_orden_al_entregar() TO service_role;
