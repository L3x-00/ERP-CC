-- =============================================================================
-- Migración: Órdenes de producción — Sub-fase 5.1 (ORCA MFG ERP).
-- Modelo seguro e idempotente: folios atómicos en Postgres, RLS de lectura y
-- mutaciones exclusivas de Server Actions con service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Folios OP: una SEQUENCE delega la concurrencia a Postgres. Los huecos por
-- rollback son aceptables: la invariante es unicidad, no consecutividad absoluta.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_orden START 1001;

DROP FUNCTION IF EXISTS public.generar_folio_orden(text);

CREATE OR REPLACE FUNCTION public.generar_folio_orden(p_prefijo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prefijo text := upper(trim(coalesce(p_prefijo, '')));
BEGIN
  IF v_prefijo <> 'OP' THEN
    RAISE EXCEPTION 'El prefijo de una orden de producción debe ser OP'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN 'OP-' || lpad(nextval('public.secuencia_folio_orden')::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_orden(text) IS
  'Genera folios OP-NNNNNN de forma atómica; disponible solo para service_role.';

REVOKE EXECUTE ON FUNCTION public.generar_folio_orden(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_orden(text) TO service_role;

REVOKE ALL ON SEQUENCE public.secuencia_folio_orden FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.secuencia_folio_orden TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Cabecera de orden. `cotizacion_id` referencia `pipeline`: ésa es la tabla
-- que representa una cotización en las fases previas del proyecto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordenes_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE RESTRICT,
  cotizacion_id uuid REFERENCES public.pipeline (id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'programada', 'en_proceso', 'pausada', 'completada', 'cancelada')),
  prioridad text NOT NULL DEFAULT 'normal'
    CHECK (prioridad IN ('baja', 'normal', 'alta', 'urgente')),
  fecha_compromiso timestamptz NOT NULL,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ordenes_produccion_folio_formato_valido
    CHECK (folio ~ '^OP-[0-9]{6}$'),
  CONSTRAINT ordenes_produccion_fechas_coherentes
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE public.ordenes_produccion IS
  'Cabecera de órdenes de producción con folio OP atómico.';
COMMENT ON COLUMN public.ordenes_produccion.cotizacion_id IS
  'Referencia opcional a la oportunidad cotizada en pipeline.';

-- Si la tabla hubiera sido creada fuera de la historia de migraciones, añade el
-- guardia de formato al reejecutar el archivo sin tocar datos ya válidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ordenes_produccion'::regclass
      AND conname = 'ordenes_produccion_folio_formato_valido'
  ) THEN
    ALTER TABLE public.ordenes_produccion
      ADD CONSTRAINT ordenes_produccion_folio_formato_valido
      CHECK (folio ~ '^OP-[0-9]{6}$');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_cliente
  ON public.ordenes_produccion (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_cotizacion
  ON public.ordenes_produccion (cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_estado
  ON public.ordenes_produccion (estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_fecha_compromiso
  ON public.ordenes_produccion (fecha_compromiso);

DROP TRIGGER IF EXISTS trigger_ordenes_produccion_actualizado_en
  ON public.ordenes_produccion;
CREATE TRIGGER trigger_ordenes_produccion_actualizado_en
  BEFORE UPDATE ON public.ordenes_produccion
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 3. Partidas: cada fila representa una pieza/operación planificada de una OP.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partidas_orden_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE CASCADE,
  codigo_pieza text NOT NULL,
  descripcion text,
  cantidad_solicitada numeric(14, 4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_producida numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
  cantidad_scrap numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_scrap >= 0),
  unidad_medida text NOT NULL,
  material_id uuid REFERENCES public.materiales (id) ON DELETE RESTRICT,
  tiempo_estimado_minutos numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (tiempo_estimado_minutos >= 0),
  tiempo_real_minutos numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tiempo_real_minutos >= 0),
  maquina_asignada text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partidas_orden_produccion IS
  'Partidas de fabricación de una orden de producción.';

CREATE INDEX IF NOT EXISTS idx_partidas_orden_produccion_orden
  ON public.partidas_orden_produccion (orden_id);
CREATE INDEX IF NOT EXISTS idx_partidas_orden_produccion_material
  ON public.partidas_orden_produccion (material_id);

DROP TRIGGER IF EXISTS trigger_partidas_orden_produccion_actualizado_en
  ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_partidas_orden_produccion_actualizado_en
  BEFORE UPDATE ON public.partidas_orden_produccion
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 4. Bitácora de piso. Se agregan creado_en/actualizado_en para aplicar la
-- invariante solicitada de timestamp a todas las tablas nuevas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registros_tiempo_operador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE CASCADE,
  operador_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  accion text NOT NULL CHECK (accion IN ('inicio', 'pausa', 'fin')),
  fecha_registro timestamptz NOT NULL DEFAULT now(),
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.registros_tiempo_operador IS
  'Eventos de inicio, pausa y fin registrados por operadores de taller.';

CREATE INDEX IF NOT EXISTS idx_registros_tiempo_operador_partida
  ON public.registros_tiempo_operador (partida_id);
CREATE INDEX IF NOT EXISTS idx_registros_tiempo_operador_operador
  ON public.registros_tiempo_operador (operador_id);
CREATE INDEX IF NOT EXISTS idx_registros_tiempo_operador_fecha
  ON public.registros_tiempo_operador (fecha_registro);

DROP TRIGGER IF EXISTS trigger_registros_tiempo_operador_actualizado_en
  ON public.registros_tiempo_operador;
CREATE TRIGGER trigger_registros_tiempo_operador_actualizado_en
  BEFORE UPDATE ON public.registros_tiempo_operador
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 5. Acceso: lectura autenticada para el taller; ninguna escritura directa por
-- Data API. Las Server Actions de la siguiente sub-fase usarán service_role.
-- -----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.ordenes_produccion
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.partidas_orden_produccion
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.registros_tiempo_operador
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ordenes_produccion TO authenticated;
GRANT SELECT ON TABLE public.partidas_orden_produccion TO authenticated;
GRANT SELECT ON TABLE public.registros_tiempo_operador TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.ordenes_produccion TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.partidas_orden_produccion TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.registros_tiempo_operador TO service_role;

ALTER TABLE public.ordenes_produccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas_orden_produccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_tiempo_operador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordenes_produccion_seleccionar ON public.ordenes_produccion;
CREATE POLICY ordenes_produccion_seleccionar
  ON public.ordenes_produccion FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS partidas_orden_produccion_seleccionar
  ON public.partidas_orden_produccion;
CREATE POLICY partidas_orden_produccion_seleccionar
  ON public.partidas_orden_produccion FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS registros_tiempo_operador_seleccionar
  ON public.registros_tiempo_operador;
CREATE POLICY registros_tiempo_operador_seleccionar
  ON public.registros_tiempo_operador FOR SELECT TO authenticated USING (true);
