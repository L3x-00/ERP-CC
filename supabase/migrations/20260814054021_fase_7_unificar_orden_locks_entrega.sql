-- Todas las rutas que modifican una partida de Produccion adquieren primero la
-- partida y luego su OP. Esta version evita el orden OP -> partida de la nota
-- de entrega, que podia competir con inicio/cierre de sesion.
CREATE OR REPLACE FUNCTION public.generar_nota_entrega(
  p_orden_id uuid,
  p_recibido_por text,
  p_firma_cliente_url text,
  p_creado_por uuid,
  p_partidas jsonb
)
RETURNS TABLE (
  id uuid,
  folio text,
  es_parcial boolean,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nota_id uuid;
  v_folio text;
  v_es_parcial boolean;
  v_cantidad_partidas integer;
BEGIN
  IF p_orden_id IS NULL
     OR p_creado_por IS NULL
     OR char_length(btrim(coalesce(p_recibido_por, ''))) < 3
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0
     OR jsonb_array_length(p_partidas) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_cantidad_partidas
  FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_partidas <> jsonb_array_length(p_partidas) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    WHERE entrada.partida_id IS NULL OR entrada.cantidad_entregada IS NULL OR entrada.cantidad_entregada <= 0
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT entrada.partida_id
      FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      GROUP BY entrada.partida_id
      HAVING count(*) > 1
    ) AS duplicada
  ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Orden global: partida (UUID ascendente) -> OP -> creador. Coincide con
  -- iniciar/cerrar sesion para que una entrega concurrente no forme un ciclo.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_partidas THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
    AND orden.estado IN ('en_proceso', 'completada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS creador
  WHERE creador.id = p_creado_por
    AND creador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_producida, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_producida
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = 'check_violation';
  END IF;

  v_folio := public.generar_folio_nota_entrega('NE');
  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, firma_cliente_url, recibido_por, creado_por
  ) VALUES (
    v_folio, p_orden_id, v_es_parcial, nullif(btrim(p_firma_cliente_url), ''),
    btrim(p_recibido_por), p_creado_por
  ) RETURNING notas_entrega.id INTO v_nota_id;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada
  )
  SELECT
    v_nota_id, partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;

  RETURN QUERY
  SELECT nota.id, nota.folio, nota.es_parcial, nota.creado_en
  FROM public.notas_entrega AS nota
  WHERE nota.id = v_nota_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) TO service_role;
