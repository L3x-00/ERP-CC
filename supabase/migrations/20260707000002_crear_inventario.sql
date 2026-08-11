-- =============================================================================
-- Migración: Inventario / Compras — Sub-fase 4.1 (ORCA MFG ERP). Idempotente.
--
-- Tablas: proveedores, materiales, movimientos_inventario, reservas_material.
-- Folio atómico de inventario vía SEQUENCE + función SECURITY DEFINER, con
-- EXECUTE revocado de PUBLIC (solo service_role, igual que los folios OP/CNC).
--
-- Modelo de seguridad (consistente con clientes/pipeline): las MUTACIONES corren
-- en Server Actions con cliente admin (service_role, que bypasa RLS) y verifican
-- permisos en el servidor (Sub-fase 4.2). Por eso NO hay políticas de
-- INSERT/UPDATE/DELETE para `authenticated` — nada de `WITH CHECK (true)`: abrir
-- escritura directa por PostgREST saltaría el control de stock/costos/folios.
-- SELECT: cualquier autenticado (el inventario es dato de referencia del taller).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Folio de inventario: secuencia global atómica (nextval nunca duplica) +
--    función que la envuelve. El prefijo (p. ej. 'ENT', 'AJU') lo pasa la acción.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_inventario START 1;

-- Reconciliación de drift: si existe una versión previa creada fuera de migración
-- (p. ej. con el parámetro en inglés `p_prefix`), CREATE OR REPLACE no puede
-- renombrar el parámetro (SQLSTATE 42P13). Se elimina y se recrea con el nombre
-- en español. DROP idempotente.
DROP FUNCTION IF EXISTS public.generar_folio_inventario(text);

CREATE OR REPLACE FUNCTION public.generar_folio_inventario(p_prefijo text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(p_prefijo) || '-' ||
         lpad(nextval('public.secuencia_folio_inventario')::text, 6, '0');
$$;

COMMENT ON FUNCTION public.generar_folio_inventario(text) IS
  'Genera folio de inventario <PREFIJO>-NNNNNN de forma atómica. Solo service_role.';

-- EXECUTE se otorga a PUBLIC por defecto y anon/authenticated heredan de PUBLIC:
-- se revoca de PUBLIC y se re-otorga solo a service_role.
REVOKE EXECUTE ON FUNCTION public.generar_folio_inventario(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_inventario(text) TO service_role;

-- La secuencia tampoco debe ser consumible por RPC directa (nextval) de un
-- autenticado; solo la usa la función (que corre como su dueño) o service_role.
REVOKE ALL ON SEQUENCE public.secuencia_folio_inventario FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.secuencia_folio_inventario TO service_role;

-- -----------------------------------------------------------------------------
-- 2. proveedores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial text NOT NULL,
  razon_social text,
  rfc text UNIQUE,
  contacto_nombre text NOT NULL,
  correo text NOT NULL,
  telefono text NOT NULL,
  direccion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.proveedores IS 'Proveedores de materiales/insumos.';

DROP TRIGGER IF EXISTS trigger_proveedores_actualizado_en ON public.proveedores;
CREATE TRIGGER trigger_proveedores_actualizado_en
  BEFORE UPDATE ON public.proveedores
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 3. materiales
--   factor_conversion: unidades de control por cada unidad de compra
--   (p. ej. m² por hoja). stock_* en unidad de control.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materiales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  categoria text NOT NULL
    CHECK (categoria IN ('materia_prima', 'insumo', 'semiterminado', 'terminado')),
  unidad_compra text NOT NULL
    CHECK (unidad_compra IN ('hoja', 'barra', 'rollo', 'pieza')),
  unidad_control text NOT NULL
    CHECK (unidad_control IN ('m2', 'ml', 'pieza', 'kg')),
  factor_conversion numeric(14, 4) NOT NULL CHECK (factor_conversion > 0),
  costo_unitario_compra numeric(14, 4) NOT NULL DEFAULT 0 CHECK (costo_unitario_compra >= 0),
  costo_unitario_control numeric(14, 4) NOT NULL DEFAULT 0 CHECK (costo_unitario_control >= 0),
  stock_actual_control numeric(14, 4) NOT NULL DEFAULT 0,
  stock_reservado_control numeric(14, 4) NOT NULL DEFAULT 0 CHECK (stock_reservado_control >= 0),
  stock_minimo_control numeric(14, 4) NOT NULL DEFAULT 0 CHECK (stock_minimo_control >= 0),
  proveedor_id uuid REFERENCES public.proveedores (id) ON DELETE SET NULL,
  factor_merma_porcentaje numeric(5, 2) NOT NULL DEFAULT 8
    CHECK (factor_merma_porcentaje >= 0 AND factor_merma_porcentaje <= 100),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.materiales IS 'Catálogo de materiales con doble unidad (compra/control) y stock.';

CREATE INDEX IF NOT EXISTS idx_materiales_categoria ON public.materiales (categoria);
CREATE INDEX IF NOT EXISTS idx_materiales_proveedor ON public.materiales (proveedor_id);

DROP TRIGGER IF EXISTS trigger_materiales_actualizado_en ON public.materiales;
CREATE TRIGGER trigger_materiales_actualizado_en
  BEFORE UPDATE ON public.materiales
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 4. movimientos_inventario (libro mayor inmutable: sin actualizado_en).
--   orden_id sin FK: la tabla `ordenes` llega en Fase 5.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  material_id uuid NOT NULL REFERENCES public.materiales (id) ON DELETE RESTRICT,
  tipo_movimiento text NOT NULL
    CHECK (tipo_movimiento IN ('entrada_compra', 'salida_produccion', 'ajuste_inventario', 'devolucion')),
  cantidad_compra numeric(14, 4) NOT NULL,
  cantidad_control numeric(14, 4) NOT NULL,
  costo_unitario_momento numeric(14, 4) NOT NULL CHECK (costo_unitario_momento >= 0),
  orden_id uuid,
  operador_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  referencia_externa text,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.movimientos_inventario IS 'Kardex: cada entrada/salida/ajuste de material. Inmutable.';

CREATE INDEX IF NOT EXISTS idx_movimientos_material ON public.movimientos_inventario (material_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON public.movimientos_inventario (tipo_movimiento);

-- -----------------------------------------------------------------------------
-- 5. reservas_material (bloqueo de stock por orden; orden_id sin FK hasta Fase 5).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservas_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materiales (id) ON DELETE RESTRICT,
  orden_id uuid NOT NULL,
  cantidad_reservada numeric(14, 4) NOT NULL CHECK (cantidad_reservada > 0),
  estado text NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'consumida', 'cancelada')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reservas_material IS 'Reservas de stock por orden de producción.';

CREATE INDEX IF NOT EXISTS idx_reservas_material ON public.reservas_material (material_id);
CREATE INDEX IF NOT EXISTS idx_reservas_orden ON public.reservas_material (orden_id);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
--   SELECT: cualquier autenticado (referencia del taller).
--   Escritura: sin políticas → solo service_role (Server Actions de la 4.2).
-- -----------------------------------------------------------------------------
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas_material ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proveedores_seleccionar ON public.proveedores;
CREATE POLICY proveedores_seleccionar
  ON public.proveedores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS materiales_seleccionar ON public.materiales;
CREATE POLICY materiales_seleccionar
  ON public.materiales FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS movimientos_inventario_seleccionar ON public.movimientos_inventario;
CREATE POLICY movimientos_inventario_seleccionar
  ON public.movimientos_inventario FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reservas_material_seleccionar ON public.reservas_material;
CREATE POLICY reservas_material_seleccionar
  ON public.reservas_material FOR SELECT TO authenticated USING (true);
