-- C3: la primera pieza se aprueba por ítem. Se mantiene la firma de un solo
-- argumento para no tocar a los llamadores; ahora una corrida con varios
-- corrida_items solo se libera cuando CADA ítem tiene su aprobación. Las
-- aprobaciones antiguas sin partida siguen cubriendo corridas de un solo ítem.
CREATE OR REPLACE FUNCTION privado.primera_pieza_aprobada(p_corrida_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.corrida_items AS item
      WHERE item.corrida_id = p_corrida_id
    )
    THEN NOT EXISTS (
      SELECT 1
      FROM public.corrida_items AS item
      WHERE item.corrida_id = p_corrida_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.inspecciones_calidad AS inspeccion
          WHERE inspeccion.corrida_id = p_corrida_id
            AND inspeccion.tipo = 'PRIMERA_PIEZA'
            AND inspeccion.resultado = 'APROBADA'
            AND (
              inspeccion.partida_id = item.partida_id
              OR (
                inspeccion.partida_id IS NULL
                AND (SELECT count(*) FROM public.corrida_items AS unico
                     WHERE unico.corrida_id = p_corrida_id) = 1
              )
            )
        )
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.inspecciones_calidad AS inspeccion
      WHERE inspeccion.corrida_id = p_corrida_id
        AND inspeccion.tipo = 'PRIMERA_PIEZA'
        AND inspeccion.resultado = 'APROBADA'
    )
  END;
$$;

COMMENT ON FUNCTION privado.primera_pieza_aprobada(uuid) IS
  'C3: true solo si todos los ítems de la corrida tienen su primera pieza aprobada; corridas de un ítem aceptan aprobaciones históricas sin partida.';

REVOKE ALL ON FUNCTION privado.primera_pieza_aprobada(uuid) FROM PUBLIC, anon, authenticated, service_role;
