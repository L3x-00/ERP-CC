-- =============================================================================
-- B6 - Fechas de negocio, Realtime y seguridad (AUD-12, AUD-13, AUD-16)
--
-- Alcance estricto:
--   * AUD-13: publicar en `supabase_realtime` las cuatro tablas de producción
--     que ya muestra el tablero y que su sincronizador existente aún no cubre.
--   * AUD-16: cerrar la autorización laxa de dos RPC de lectura C13 que
--     aceptaban a cualquier usuario activo sin permiso.
--
-- No crea notificaciones, no agrega módulos ni tablas y no cambia reglas de
-- roles, caducidad de PIN ni el alcance de lectura RLS (esas decisiones siguen
-- pendientes del cliente). No toca C14, costos, entregas ni cancelaciones.
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUD-13 - Publicación Realtime de las tablas que ya usa el tablero de
--    Producción. Idempotente: solo agrega si falta.
-- -----------------------------------------------------------------------------
DO $b6_realtime$
DECLARE
  v_tabla text;
  v_tablas text[] := ARRAY[
    'retrabajos_produccion',
    'inspecciones_calidad',
    'consumos_material_cliente',
    'sesion_item_tiempos'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'b6_sin_publicacion_realtime';
  END IF;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$b6_realtime$;

-- -----------------------------------------------------------------------------
-- 2. AUD-16 - `obtener_material_cliente_orden`: exigir permiso real o vínculo
--    operativo con la orden (operador de la sesión o asignado a la partida).
--    Antes: `NOT EXISTS(usuario activo) AND NOT (permiso A OR permiso B)`, de
--    modo que cualquier usuario activo sin permiso pasaba. Se conserva la firma
--    y el resultado; solo se corrige la condición.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_material_cliente_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  codigo_pieza text,
  material_id uuid,
  material_codigo text,
  material_nombre text,
  unidad_base text,
  declarado numeric,
  consumido numeric,
  saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'material_cliente_invalido' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
    OR EXISTS (
      SELECT 1
      FROM public.sesiones_trabajo AS sesion
      WHERE sesion.orden_id = p_orden_id
        AND sesion.operador_id = p_actor_id
        AND sesion.estado_sesion IN ('activa', 'pausada')
    )
    OR EXISTS (
      SELECT 1
      FROM public.partidas_orden_produccion AS partida
      WHERE partida.orden_id = p_orden_id
        AND partida.operador_asignado_id = p_actor_id
    )
  ) THEN
    RAISE EXCEPTION 'sin_permiso_material_cliente' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
  IF NOT FOUND OR v_orden.propuesta_revision_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT partida.id, partida.codigo_pieza, material.material_id,
    catalogo.codigo, catalogo.nombre, catalogo.unidad_base,
    material.cantidad,
    coalesce((
      SELECT sum(consumo.cantidad_usada + consumo.cantidad_scrap)
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.partida_id = partida.id AND consumo.material_id = material.material_id
    ), 0),
    material.cantidad - coalesce((
      SELECT sum(consumo.cantidad_usada + consumo.cantidad_scrap)
      FROM public.consumos_material_cliente AS consumo
      WHERE consumo.partida_id = partida.id AND consumo.material_id = material.material_id
    ), 0)
  FROM public.partidas_orden_produccion AS partida
  JOIN public.material_cliente_item AS material
    ON material.propuesta_revision_id = v_orden.propuesta_revision_id
   AND material.codigo_item = partida.codigo_pieza
  JOIN public.catalogo_materiales AS catalogo ON catalogo.id = material.material_id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.codigo_pieza, catalogo.codigo;
END;
$function$;

COMMENT ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid) IS
  'C13.3 + AUD-16: material del cliente por partida; exige gestionar_produccion, ver_finanzas o vínculo operativo con la orden. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. AUD-16 - `obtener_items_corrida`: exigir permiso o ser el operador de la
--    sesión de esa corrida. Incluye la lectura correcta de la meta/operación
--    (AUD-09, entregada en B4) para no revertirla al aplicarse después de B4.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_items_corrida(
  p_corrida_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  codigo_pieza text,
  meta_proceso_id uuid,
  cantidad_solicitada numeric,
  cantidad_producida numeric,
  disponible numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_corrida_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'corrida_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR EXISTS (
      SELECT 1
      FROM public.sesiones_trabajo AS sesion
      WHERE sesion.corrida_id = p_corrida_id
        AND sesion.operador_id = p_actor_id
        AND sesion.estado_sesion IN ('activa', 'pausada')
    )
  ) THEN
    RAISE EXCEPTION 'sin_permiso_corrida' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT partida.id, partida.codigo_pieza, meta.id,
    partida.cantidad_solicitada, partida.cantidad_producida,
    CASE WHEN meta.id IS NULL THEN NULL
         ELSE privado.piezas_disponibles_proceso(meta.id) END
  FROM public.corrida_items AS item
  JOIN public.corridas AS corrida ON corrida.id = item.corrida_id
  JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = item.partida_id
  LEFT JOIN LATERAL (
    SELECT candidata.id
    FROM public.metas_proceso_partida AS candidata
    WHERE candidata.partida_id = partida.id
      AND (
        lower(btrim(candidata.nombre)) = lower(btrim(proceso.nombre))
        OR lower(btrim(candidata.nombre)) = lower(btrim(proceso.codigo))
        OR (
          SELECT count(*) FROM public.metas_proceso_partida AS total
          WHERE total.partida_id = partida.id
        ) = 1
      )
    ORDER BY candidata.secuencia
    LIMIT 1
  ) AS meta ON true
  WHERE item.corrida_id = p_corrida_id
  ORDER BY partida.codigo_pieza;
END;
$function$;

COMMENT ON FUNCTION public.obtener_items_corrida(uuid, uuid) IS
  'C13.4 + AUD-09 + AUD-16: ítems de la corrida con meta real; exige gestionar_produccion o ser el operador de la sesión. Solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_items_corrida(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_material_cliente_orden(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_items_corrida(uuid, uuid) TO service_role;
