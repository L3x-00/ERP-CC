-- =============================================================================
-- Migración: área/departamento, trabajo externo y línea de descuento (RFQ-05/06,
-- y la línea de descuento de RFQ-03)
-- ORCA MFG ERP — Pipeline / cotizaciones + Producción
--
-- RFQ-05: cada línea de cotización puede pertenecer a un área/departamento
--         (código de `areas_trabajo_config`) y llevar procesos; las líneas de
--         descuento se excluyen de las partidas fabricables.
-- RFQ-06: una línea puede marcarse como trabajo externo (EXT) con proveedor
--         externo de texto libre; esos datos acompañan la partida generada.
-- RFQ-03: el descuento del cliente se representa como una línea identificable
--         (es_descuento), que se puede quitar y afecta los totales.
--
-- Se añaden las mismas dimensiones a `partidas_orden_produccion` para que la
-- generación de la orden pueda arrastrar el área/externo/proveedor de la línea
-- a la partida. La LÓGICA de generación (RPC de creación de orden) NO se toca
-- aquí: es parte de la reconciliación de arquitectura v2 que trabaja Codex.
-- Esta migración solo establece el esquema (columnas), de forma aditiva.
--
-- `area_trabajo_codigo` se guarda como texto (código), en línea con cómo el
-- resto del sistema referencia áreas por código; no se añade FK para no acoplar
-- el borrado ni exigir un índice único preexistente. Todo aditivo y con default
-- constante: no reescribe tablas (PG11+), no cambia RLS ni grants (las columnas
-- nuevas heredan las políticas de fila vigentes). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Líneas de cotización
-- -----------------------------------------------------------------------------
ALTER TABLE public.cotizacion_lineas
  ADD COLUMN IF NOT EXISTS area_trabajo_codigo text,
  ADD COLUMN IF NOT EXISTS es_externo          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proveedor_externo   text,
  ADD COLUMN IF NOT EXISTS es_descuento        boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cotizacion_lineas.area_trabajo_codigo IS
  'RFQ-05: código de área/departamento (areas_trabajo_config.codigo) de la línea.';
COMMENT ON COLUMN public.cotizacion_lineas.es_externo IS
  'RFQ-06: la línea es trabajo externo (EXT); su proveedor va en proveedor_externo.';
COMMENT ON COLUMN public.cotizacion_lineas.proveedor_externo IS
  'RFQ-06: proveedor externo (texto libre) cuando es_externo = true.';
COMMENT ON COLUMN public.cotizacion_lineas.es_descuento IS
  'RFQ-03/05: línea de descuento del cliente; se excluye de las partidas fabricables.';

-- -----------------------------------------------------------------------------
-- Partidas de orden de producción (destino de los datos de la línea al generar)
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS area_trabajo_codigo text,
  ADD COLUMN IF NOT EXISTS procesos            text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS es_externo          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proveedor_externo   text;

COMMENT ON COLUMN public.partidas_orden_produccion.area_trabajo_codigo IS
  'RFQ-05: área/departamento heredada de la línea de cotización de origen.';
COMMENT ON COLUMN public.partidas_orden_produccion.procesos IS
  'RFQ-05: procesos de la partida, heredados de la línea de cotización.';
COMMENT ON COLUMN public.partidas_orden_produccion.es_externo IS
  'RFQ-06: la partida corresponde a trabajo externo (EXT).';
COMMENT ON COLUMN public.partidas_orden_produccion.proveedor_externo IS
  'RFQ-06: proveedor externo (texto libre) de la partida externa.';
