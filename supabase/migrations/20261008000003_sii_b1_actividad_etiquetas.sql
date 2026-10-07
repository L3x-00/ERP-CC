-- =============================================================================
-- SII-B1 / H-B1-39 -- etiquetas legibles en Actividad para flujos SII
-- Documento: seccion 15.3; plan 01-sistema-catalogos.md seccion 1.10.
--
-- Conserva la firma publica de `obtener_actividad` y amplia solamente la
-- resolucion de lectura para RFQ, Propuestas, Produccion y Tesoreria. No toma
-- locks ni modifica registros de negocio. Aplicar SOLO local hasta autorizacion.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.obtener_actividad(
  p_actor_id uuid,
  p_usuario_id uuid DEFAULT NULL,
  p_modulo text DEFAULT NULL,
  p_accion text DEFAULT NULL,
  p_actor_texto text DEFAULT NULL,
  p_recurso_id text DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL,
  p_hasta timestamptz DEFAULT NULL,
  p_limite integer DEFAULT 30,
  p_cursor_creado timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  creado_en timestamptz,
  correlation_id uuid,
  nombre_usuario text,
  rol text,
  accion text,
  modulo text,
  recurso_id text,
  contexto jsonb,
  recurso_etiqueta text,
  entidad text,
  hay_mas boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_es_admin boolean;
  v_limite integer;
BEGIN
  SELECT u.* INTO v_actor
  FROM public.usuarios AS u
  WHERE u.id = p_actor_id;

  IF NOT FOUND OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso_actividad' USING ERRCODE = '42501';
  END IF;

  v_es_admin := v_actor.rol = 'admin';

  IF NOT v_es_admin AND NOT EXISTS (
    SELECT 1
    FROM public.permisos_rol AS pr
    WHERE pr.rol = v_actor.rol
      AND pr.permiso = 'actividad_vista'
  ) THEN
    RAISE EXCEPTION 'sin_permiso_actividad' USING ERRCODE = '42501';
  END IF;

  IF (p_cursor_creado IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'cursor_invalido' USING ERRCODE = '22023';
  END IF;

  v_limite := least(greatest(coalesce(p_limite, 30), 1), 100);

  RETURN QUERY
  WITH base AS (
    SELECT
      l.id,
      l.creado_en,
      l.correlation_id,
      l.nombre_usuario,
      l.rol,
      l.accion,
      l.modulo,
      l.recurso_id,
      l.detalles,
      CASE
        WHEN l.recurso_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN l.recurso_id::uuid
      END AS recurso_uuid
    FROM public.logs AS l
    WHERE (p_usuario_id IS NULL OR l.usuario_id = p_usuario_id)
      AND (p_modulo IS NULL OR l.modulo = p_modulo)
      AND (p_accion IS NULL OR l.accion = p_accion)
      AND (
        NULLIF(btrim(p_actor_texto), '') IS NULL
        OR l.nombre_usuario ILIKE '%'
          || replace(replace(replace(btrim(p_actor_texto), '\', '\\'), '%', '\%'), '_', '\_')
          || '%'
      )
      AND (p_recurso_id IS NULL OR l.recurso_id = p_recurso_id)
      AND (p_desde IS NULL OR l.creado_en >= p_desde)
      AND (p_hasta IS NULL OR l.creado_en <= p_hasta)
      AND (
        p_cursor_creado IS NULL
        OR (l.creado_en, l.id) < (p_cursor_creado, p_cursor_id)
      )
  ),
  paginados AS (
    SELECT
      b.id,
      b.creado_en,
      b.correlation_id,
      b.nombre_usuario,
      b.rol,
      b.accion,
      b.modulo,
      b.recurso_id,
      b.detalles,
      CASE
        WHEN p.id IS NOT NULL THEN coalesce(p.folio_rfq, p.folio_cnc, p.folio_op)
        WHEN c.id IS NOT NULL THEN coalesce(c.folio, c.razon_social)
        WHEN o.id IS NOT NULL THEN coalesce(o.folio_sii, o.folio)
        WHEN revision.id IS NOT NULL THEN revision.folio_revision
        WHEN propuesta.id IS NOT NULL THEN propuesta.folio_cnc
        WHEN item.id IS NOT NULL THEN revision_item.folio_revision || ' · ' || item.codigo
        WHEN rfq_propuesta.id IS NOT NULL THEN coalesce(
          rfq_propuesta.folio_rfq, rfq_propuesta.folio_cnc, rfq_propuesta.folio_op)
        WHEN orden_produccion.id IS NOT NULL THEN coalesce(
          orden_produccion.folio_sii, orden_produccion.folio)
        WHEN sesion.id IS NOT NULL THEN
          coalesce(orden_sesion.folio_sii, orden_sesion.folio) || ' · Sesión de trabajo'
        WHEN nota.id IS NOT NULL THEN nota.folio
        WHEN corrida.id IS NOT NULL THEN
          coalesce(orden_corrida.folio_sii, orden_corrida.folio) || ' · ' || corrida.codigo
        WHEN cuenta.id IS NOT NULL THEN
          cuenta.banco || ' · •••' || right(cuenta.numero_cuenta, 4) || ' · ' || cuenta.moneda
        WHEN movimiento.id IS NOT NULL THEN
          initcap(lower(replace(movimiento.tipo, '_', ' '))) || ' · '
          || cuenta_movimiento.banco || ' · •••' || right(cuenta_movimiento.numero_cuenta, 4)
        WHEN pago_ar.id IS NOT NULL THEN pago_ar.folio_recibo
        WHEN pago_compra.id IS NOT NULL THEN compra_pago.folio_sii
        WHEN gasto.id IS NOT NULL THEN coalesce(gasto.folio_sii, gasto.folio)
        ELSE NULL
      END AS recurso_etiqueta,
      CASE
        WHEN p.id IS NOT NULL THEN 'pipeline'
        WHEN c.id IS NOT NULL THEN 'cliente'
        WHEN o.id IS NOT NULL THEN 'orden'
        WHEN revision.id IS NOT NULL OR propuesta.id IS NOT NULL
          OR item.id IS NOT NULL OR rfq_propuesta.id IS NOT NULL THEN 'propuesta'
        WHEN orden_produccion.id IS NOT NULL OR sesion.id IS NOT NULL
          OR nota.id IS NOT NULL OR corrida.id IS NOT NULL THEN 'produccion'
        WHEN cuenta.id IS NOT NULL OR movimiento.id IS NOT NULL
          OR pago_ar.id IS NOT NULL OR pago_compra.id IS NOT NULL
          OR gasto.id IS NOT NULL THEN 'tesoreria'
        ELSE 'otro'
      END AS entidad
    FROM base AS b
    LEFT JOIN public.pipeline AS p
      ON b.modulo = 'pipeline' AND p.id = b.recurso_uuid
    LEFT JOIN public.clientes AS c
      ON b.modulo = 'clientes' AND c.id = b.recurso_uuid
    LEFT JOIN public.ordenes_produccion AS o
      ON b.modulo = 'ordenes' AND o.id = b.recurso_uuid

    LEFT JOIN public.propuesta_revisiones AS revision
      ON b.modulo = 'propuestas' AND revision.id = b.recurso_uuid
    LEFT JOIN public.propuestas AS propuesta
      ON b.modulo = 'propuestas' AND propuesta.id = b.recurso_uuid
    LEFT JOIN public.propuesta_items AS item
      ON b.modulo = 'propuestas' AND item.id = b.recurso_uuid
    LEFT JOIN public.propuesta_revisiones AS revision_item
      ON revision_item.id = item.revision_id
    LEFT JOIN public.pipeline AS rfq_propuesta
      ON b.modulo = 'propuestas' AND rfq_propuesta.id = b.recurso_uuid

    LEFT JOIN public.ordenes_produccion AS orden_produccion
      ON b.modulo = 'produccion' AND orden_produccion.id = b.recurso_uuid
    LEFT JOIN public.sesiones_trabajo AS sesion
      ON b.modulo = 'produccion' AND sesion.id = b.recurso_uuid
    LEFT JOIN public.ordenes_produccion AS orden_sesion
      ON orden_sesion.id = sesion.orden_id
    LEFT JOIN public.notas_entrega AS nota
      ON b.modulo = 'produccion' AND nota.id = b.recurso_uuid
    LEFT JOIN public.corridas AS corrida
      ON b.modulo = 'produccion' AND corrida.id = b.recurso_uuid
    LEFT JOIN public.ordenes_produccion AS orden_corrida
      ON orden_corrida.id = corrida.orden_id

    LEFT JOIN public.cuentas_bancarias AS cuenta
      ON b.modulo = 'tesoreria' AND cuenta.id = b.recurso_uuid
    LEFT JOIN public.movimientos_tesoreria AS movimiento
      ON b.modulo = 'tesoreria' AND movimiento.id = b.recurso_uuid
    LEFT JOIN public.cuentas_bancarias AS cuenta_movimiento
      ON cuenta_movimiento.id = movimiento.cuenta_id
    LEFT JOIN public.pagos_ar AS pago_ar
      ON b.modulo = 'tesoreria' AND pago_ar.id = b.recurso_uuid
    LEFT JOIN public.pagos_compra AS pago_compra
      ON b.modulo = 'tesoreria' AND pago_compra.id = b.recurso_uuid
    LEFT JOIN public.compras AS compra_pago
      ON compra_pago.id = pago_compra.compra_id
    LEFT JOIN public.gastos AS gasto
      ON b.modulo = 'tesoreria' AND gasto.id = b.recurso_uuid

    ORDER BY b.creado_en DESC, b.id DESC
    LIMIT v_limite + 1
  )
  SELECT
    pg.id,
    pg.creado_en,
    pg.correlation_id,
    pg.nombre_usuario,
    pg.rol,
    pg.accion,
    pg.modulo,
    pg.recurso_id,
    CASE WHEN v_es_admin THEN pg.detalles ELSE NULL END,
    pg.recurso_etiqueta,
    pg.entidad,
    (count(*) OVER ()) > v_limite
  FROM paginados AS pg
  ORDER BY pg.creado_en DESC, pg.id DESC
  LIMIT v_limite;
END;
$$;

COMMENT ON FUNCTION public.obtener_actividad(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid
) IS
  'Actividad operativa: valida actor, oculta contexto por rol, resuelve etiquetas visibles de RFQ, clientes, propuestas, ordenes, produccion y tesoreria, y pagina por cursor. Solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_actividad(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_actividad(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid
) TO service_role;
