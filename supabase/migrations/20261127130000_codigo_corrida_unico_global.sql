-- =============================================================================
-- Migración: código de corrida único a nivel global
-- 2026-11-27 — autorizada por el Product Owner.
-- =============================================================================
-- ANTES: privado.corrida_siguiente_codigo calculaba el consecutivo con
--   WHERE orden_id = p_orden_id, y el constraint era UNIQUE (orden_id, codigo).
--   Cada orden emitía LAS01, así que una orden terminada y otra en curso
--   podían mostrarse con el mismo código.
-- DESPUÉS: el consecutivo es global por prefijo y el código es UNIQUE global.
--
-- Excepción documentada a la regla "no reescribir históricos": el PO autorizó
-- renumerar los códigos duplicados y dejar constancia en public.logs. Solo se
-- tocan las filas que repetían código; los códigos ya únicos no se modifican.
-- La firma de la RPC no cambia para no romper los llamadores ya migrados.
-- =============================================================================

-- 0. La renumeración y el cambio de constraint se aplican en ventana de
--    mantenimiento (sin escrituras concurrentes en public.corridas). El runner
--    de migraciones ejecuta cada sentencia fuera de un bloque explícito, así
--    que LOCK TABLE no es utilizable aquí; no se crean corridas durante la
--    aplicación de esta migración.

-- 1. Renumerar duplicados: los códigos repetidos conservan el primero por
--    creado_en/id y los siguientes reciben max(prefijo) + 1, +2, ... El orden
--    de los excedentes es GLOBAL por prefijo (no por código), así que LAS01 y
--    LAS02 duplicados no pueden asignar ambos el mismo número. Idempotente:
--    si no hay duplicados, el INSERT del log no produce filas.
WITH parsed AS (
  SELECT
    corrida.id,
    corrida.codigo,
    corrida.creado_en,
    (regexp_match(corrida.codigo, '^([A-Z]{2,6})([0-9]+)$'))[1] AS prefijo,
    (regexp_match(corrida.codigo, '^([A-Z]{2,6})([0-9]+)$'))[2]::integer AS numero
  FROM public.corridas AS corrida
  WHERE corrida.codigo ~ '^[A-Z]{2,6}[0-9]{2,}$'
), sobrantes AS (
  SELECT rankeados.id, rankeados.codigo, rankeados.prefijo, rankeados.creado_en
  FROM (
    SELECT
      parsed.*,
      row_number() OVER (
        PARTITION BY parsed.codigo ORDER BY parsed.creado_en, parsed.id
      ) AS orden_en_codigo
    FROM parsed
  ) AS rankeados
  WHERE rankeados.orden_en_codigo > 1
), excedentes AS (
  SELECT
    sobrantes.id,
    sobrantes.codigo,
    sobrantes.prefijo,
    row_number() OVER (
      PARTITION BY sobrantes.prefijo ORDER BY sobrantes.codigo, sobrantes.creado_en, sobrantes.id
    ) AS excedente
  FROM sobrantes
), maximos AS (
  SELECT parsed.prefijo, max(parsed.numero) AS max_numero
  FROM parsed
  GROUP BY parsed.prefijo
), renumerados AS (
  UPDATE public.corridas AS corrida
  SET codigo = excedentes.prefijo || lpad((maximos.max_numero + excedentes.excedente)::text, 2, '0')
  FROM excedentes
  JOIN maximos ON maximos.prefijo = excedentes.prefijo
  WHERE corrida.id = excedentes.id
  RETURNING corrida.id, excedentes.codigo AS codigo_anterior, corrida.codigo AS codigo_nuevo
)
INSERT INTO public.logs (
  usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id
)
SELECT
  NULL,
  'sistema',
  'admin',
  'renumerar_codigo_corrida',
  'produccion',
  'corridas',
  jsonb_build_object(
    'motivo', 'Codigo de corrida unico global: se renumeraron codigos duplicados entre ordenes',
    'cambios', jsonb_agg(
      jsonb_build_object('id', id, 'anterior', codigo_anterior, 'nuevo', codigo_nuevo)
      ORDER BY id, codigo_anterior, codigo_nuevo
    )
  ),
  '00000000-0000-4000-8000-000000001327'::uuid
FROM renumerados
HAVING count(*) > 0;

-- 2. Constraints: primero se garantiza que no haya duplicados, después se
--    reemplaza la unicidad por orden por unicidad global.
ALTER TABLE public.corridas DROP CONSTRAINT IF EXISTS corridas_orden_codigo_unico;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'corridas_codigo_unico'
      AND conrelid = 'public.corridas'::regclass
  ) THEN
    ALTER TABLE public.corridas ADD CONSTRAINT corridas_codigo_unico UNIQUE (codigo);
  END IF;
END $$;

-- 3. RPC: VOLATILE porque toma un advisory lock; el lock por prefijo evita
--    que dos creaciones concurrentes calculen el mismo consecutivo.
--    p_orden_id se mantiene en la firma por compatibilidad con los llamadores
--    existentes, pero ya no acota la búsqueda.
CREATE OR REPLACE FUNCTION privado.corrida_siguiente_codigo(p_orden_id uuid, p_prefijo text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_siguiente integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_prefijo));

  SELECT coalesce(max((regexp_match(corrida.codigo, '^' || p_prefijo || '([0-9]+)$'))[1]::integer), 0) + 1
  INTO v_siguiente
  FROM public.corridas AS corrida;

  -- Dos dígitos mínimos, sin truncar a partir de 100 (LAS01…LAS99, LAS100…).
  RETURN p_prefijo || CASE WHEN v_siguiente < 10
    THEN '0' || v_siguiente::text
    ELSE v_siguiente::text
  END;
END;
$$;

REVOKE ALL ON FUNCTION privado.corrida_siguiente_codigo(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION privado.corrida_siguiente_codigo(uuid, text) IS
  'Siguiente código <PREFIJO><NN> global por prefijo; p_orden_id se ignora por compatibilidad. El llamador mantiene la transacción abierta.';
COMMENT ON CONSTRAINT corridas_codigo_unico ON public.corridas IS
  'Un lote tiene un código único en toda la fábrica, aunque sea de otra orden.';
COMMENT ON COLUMN public.corridas.codigo IS
  '<PREFIJO_PROCESO><NN> global por prefijo (LAS01…LAS99, LAS100…): dos órdenes nunca comparten código.';
