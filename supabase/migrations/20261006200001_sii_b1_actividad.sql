-- =============================================================================
-- SII-B1.10 — Actividad: correlation_id, índice y RPC de consulta legible
-- Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.10 (ADR-SII-08)
-- Documento del cliente: §15.3 (Actividad / auditoría), §17 (UX)
--
-- Entrega:
--   * `logs.correlation_id` + índice parcial para agrupar eventos de una acción
--   * RPC `obtener_actividad(...)` (SECURITY DEFINER, solo service_role) con:
--       - validación del actor (activo + `actividad_vista` o admin)
--       - resolución de etiquetas legibles en SQL (folio CNC/OP, razón social,
--         folio de orden) y entidad para que la UI construya el enlace
--       - `contexto` (detalles) solo para admin; null para el resto
--       - paginación estable por (creado_en desc, id desc) con cursor
--       - tope duro de 100 filas (default 30)
--
-- Idempotente y no destructiva. Aplicar SOLO local hasta autorización del PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columna de correlación (aditiva; los eventos antiguos quedan en null)
-- -----------------------------------------------------------------------------
ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS correlation_id uuid;

COMMENT ON COLUMN public.logs.correlation_id IS
  'Agrupa los eventos de una misma acción de negocio (ADR-SII-08). Null en eventos sueltos e históricos.';

CREATE INDEX IF NOT EXISTS ix_logs_correlation
  ON public.logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. RPC de consulta operativa de Actividad
--    Lock order: solo lectura; no toma locks de fila.
-- -----------------------------------------------------------------------------
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
  -- Actor válido: activo y con `actividad_vista` o admin (defensa en profundidad).
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

  -- El cursor viaja completo (creado_en + id) o no viaja.
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
      -- Cast seguro: solo se convierte a uuid cuando el texto tiene forma de uuid.
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
        WHEN p.id IS NOT NULL THEN coalesce(p.folio_cnc, p.folio_op)
        WHEN c.id IS NOT NULL THEN c.razon_social
        WHEN o.id IS NOT NULL THEN o.folio
        ELSE NULL
      END AS recurso_etiqueta,
      CASE
        WHEN p.id IS NOT NULL THEN 'pipeline'
        WHEN c.id IS NOT NULL THEN 'cliente'
        WHEN o.id IS NOT NULL THEN 'orden'
        ELSE 'otro'
      END AS entidad
    FROM base AS b
    LEFT JOIN public.pipeline AS p
      ON b.modulo = 'pipeline' AND p.id = b.recurso_uuid
    LEFT JOIN public.clientes AS c
      ON b.modulo = 'clientes' AND c.id = b.recurso_uuid
    LEFT JOIN public.ordenes_produccion AS o
      ON b.modulo = 'ordenes' AND o.id = b.recurso_uuid
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
  'Vista operativa de Actividad (ADR-SII-08): valida actor activo con actividad_vista o admin, resuelve etiquetas legibles sin exponer UUID técnicos, oculta `contexto` a no-admin y pagina por (creado_en, id) con cursor. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. Privilegios de ejecución (solo servidor)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.obtener_actividad(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_actividad(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid
) TO service_role;
