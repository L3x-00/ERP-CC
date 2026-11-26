-- Evita crear dos lotes en curso con la misma pieza y el mismo proceso.
-- La sugerencia de la terminal se oculta cuando la operación ya está en un
-- lote, pero la base también debe rechazar un doble clic o una llamada directa.
CREATE OR REPLACE FUNCTION public.validar_corrida_item_sin_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proceso_id uuid;
  v_lote record;
BEGIN
  SELECT corrida.proceso_id INTO v_proceso_id
  FROM public.corridas AS corrida
  WHERE corrida.id = NEW.corrida_id;

  IF v_proceso_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serializa por pieza: dos creaciones concurrentes no pueden pasar a la vez.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.partida_id::text)::bigint);

  SELECT corrida.codigo INTO v_lote
  FROM public.corrida_items AS item
  JOIN public.corridas AS corrida ON corrida.id = item.corrida_id
  WHERE item.partida_id = NEW.partida_id
    AND item.corrida_id <> NEW.corrida_id
    AND corrida.proceso_id = v_proceso_id
    AND corrida.estado IN ('PLANIFICADA', 'EN_PROCESO', 'PAUSADA')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'corrida_partida_ya_en_lote: La pieza % ya está en el lote %. Espera a que termine o cancela ese lote antes de crear otro.',
      COALESCE(NEW.codigo_item, 'de la orden'), v_lote.codigo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS corrida_item_sin_duplicado ON public.corrida_items;
CREATE TRIGGER corrida_item_sin_duplicado
  BEFORE INSERT ON public.corrida_items
  FOR EACH ROW EXECUTE FUNCTION public.validar_corrida_item_sin_duplicado();

REVOKE ALL ON FUNCTION public.validar_corrida_item_sin_duplicado() FROM PUBLIC;
