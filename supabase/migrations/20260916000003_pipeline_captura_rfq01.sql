-- =============================================================================
-- Migración: campos de captura de la solicitud comercial (RFQ-01)
-- ORCA MFG ERP — Pipeline / cotizaciones
--
-- Añade a `pipeline` los datos de captura que aún no tenían columna propia:
-- orden de compra del cliente (PO), fecha requerida de entrega, horas estimadas
-- y notas generales. El resto de RFQ-01 ya existe: cliente (cliente_id),
-- contacto (nombre_contacto), prioridad, moneda, condiciones (condiciones_pago),
-- responsable (vendedor_id), estado (etapa), etiquetas y líneas.
--
-- Todo aditivo y nullable: ADD COLUMN IF NOT EXISTS con default constante no
-- reescribe la tabla (PG11+) y no afecta filas existentes. No cambia RLS ni
-- grants (son a nivel de fila; las columnas nuevas heredan las políticas
-- vigentes de `pipeline`). Idempotente.
-- =============================================================================

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS po_cliente       text,
  ADD COLUMN IF NOT EXISTS fecha_requerida  timestamptz,
  ADD COLUMN IF NOT EXISTS horas_estimadas  numeric(10, 2)
    CHECK (horas_estimadas IS NULL OR horas_estimadas >= 0),
  ADD COLUMN IF NOT EXISTS notas            text;

COMMENT ON COLUMN public.pipeline.po_cliente IS
  'RFQ-01: número de orden de compra (PO) del cliente para esta solicitud.';
COMMENT ON COLUMN public.pipeline.fecha_requerida IS
  'RFQ-01: fecha requerida de entrega solicitada por el cliente.';
COMMENT ON COLUMN public.pipeline.horas_estimadas IS
  'RFQ-01: horas estimadas de trabajo capturadas en la solicitud comercial.';
COMMENT ON COLUMN public.pipeline.notas IS
  'RFQ-01: notas generales de la oportunidad (distintas de notas_perdida).';
