-- C14.1 (2026-11-13): repara las partidas que ya nacieron con la secuencia
-- invertida (Doblado antes que Corte).
--
-- La migración C14 corrige la captura y el ruteo de propuestas nuevas, pero no
-- reescribe órdenes ya creadas: su snapshot y sus metas pueden tener avance.
-- Esta reparación actúa solo sobre partidas demostrablemente vírgenes:
--   * sin registros de avance, sesiones, reclamos ni programación (ni cancelada),
--   * con todas las metas en la cantidad solicitada (sin metas ajustadas),
--   * en una orden no completada ni cancelada.
-- En esas partidas se reasigna el nombre de cada meta según la familia técnica
-- (corte → doblado → …) conservando sus secuencias, y se reordena la lista de
-- procesos de la partida. Se permutan nombres, no secuencias: `(partida_id,
-- secuencia)` es único y `secuencia` está acotada a 1..20, así que mover las
-- filas chocaría contra la restricción. Como las metas vírgenes comparten la
-- misma cantidad y nada las referencia, el resultado es equivalente.
--
-- Las partidas con historial se dejan intactas y se avisan por NOTICE para que
-- el PO decida cómo tratarlas.

DO $$
BEGIN
  IF to_regprocedure('privado.rango_proceso_canonico(text,text)') IS NULL THEN
    RAISE EXCEPTION 'C14.1: falta aplicar la migración C14 (privado.rango_proceso_canonico)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION privado.reparar_orden_invertida_partidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invertidas uuid[];
  v_seguras uuid[];
  v_omitidas text;
BEGIN
  WITH metas AS (
    SELECT meta.partida_id,
           privado.rango_proceso_canonico(NULL, meta.nombre) AS rango,
           lag(privado.rango_proceso_canonico(NULL, meta.nombre))
             OVER (PARTITION BY meta.partida_id ORDER BY meta.secuencia, meta.id) AS rango_previo
    FROM public.metas_proceso_partida AS meta
  )
  SELECT array_agg(DISTINCT partida_id) INTO v_invertidas
  FROM metas
  WHERE rango_previo IS NOT NULL
    AND rango < rango_previo;

  IF v_invertidas IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(partida.id) INTO v_seguras
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE partida.id = ANY(v_invertidas)
    AND orden.estado NOT IN ('completada', 'cancelada')
    AND NOT EXISTS (
      SELECT 1 FROM public.registros_avance_partida AS avance
      WHERE avance.partida_id = partida.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.partida_id = partida.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.programacion_areas AS programa
      WHERE programa.partida_id = partida.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reclamos_proceso_operador AS reclamo
      WHERE reclamo.partida_id = partida.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = partida.id
        AND meta.meta_piezas <> partida.cantidad_solicitada
    );

  IF v_seguras IS NOT NULL THEN
    WITH origen AS (
      SELECT meta.id,
             meta.partida_id,
             meta.nombre,
             row_number() OVER (
               PARTITION BY meta.partida_id ORDER BY meta.secuencia, meta.id
             ) AS posicion_secuencia,
             row_number() OVER (
               PARTITION BY meta.partida_id
               ORDER BY privado.rango_proceso_canonico(NULL, meta.nombre),
                        meta.secuencia,
                        meta.id
             ) AS posicion_canonica
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = ANY(v_seguras)
    ),
    asignacion AS (
      SELECT destino.id, canonica.nombre
      FROM origen AS destino
      JOIN origen AS canonica
        ON canonica.partida_id = destino.partida_id
       AND canonica.posicion_canonica = destino.posicion_secuencia
    )
    UPDATE public.metas_proceso_partida AS meta
    SET nombre = asignacion.nombre
    FROM asignacion
    WHERE meta.id = asignacion.id
      AND meta.nombre IS DISTINCT FROM asignacion.nombre;

    UPDATE public.partidas_orden_produccion AS partida
    SET procesos = (
      SELECT array_agg(meta.nombre ORDER BY meta.secuencia)
      FROM public.metas_proceso_partida AS meta
      WHERE meta.partida_id = partida.id
    )
    WHERE partida.id = ANY(v_seguras);
  END IF;

  SELECT string_agg(orden.folio || ' / ' || partida.codigo_pieza, ', ')
  INTO v_omitidas
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE partida.id = ANY(v_invertidas)
    AND partida.id <> ALL (coalesce(v_seguras, '{}'::uuid[]));

  IF v_omitidas IS NOT NULL THEN
    RAISE NOTICE 'C14.1: partidas con secuencia invertida sin reparar (avance, sesiones, reclamos, programación o metas ajustadas): %', v_omitidas;
  END IF;

  RETURN coalesce(cardinality(v_seguras), 0);
END;
$$;

COMMENT ON FUNCTION privado.reparar_orden_invertida_partidas() IS
  'C14.1: reordena por familia las partidas invertidas y vírgenes (sin avance, sesiones, reclamos, programación ni metas ajustadas); devuelve cuántas reparó.';

REVOKE ALL ON FUNCTION privado.reparar_orden_invertida_partidas()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_reparadas integer;
BEGIN
  v_reparadas := privado.reparar_orden_invertida_partidas();
  RAISE NOTICE 'C14.1: % partidas reparadas', v_reparadas;
END;
$$;
