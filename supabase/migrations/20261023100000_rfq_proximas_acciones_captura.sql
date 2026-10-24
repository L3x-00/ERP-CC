-- =============================================================================
-- Obs. cliente 2026-10-23 — Próximas acciones para dejar un RFQ incompleto.
--
--   * Al pulsar «Finalizar más tarde» desde Ítems (o Archivos), el vendedor
--     registra la próxima acción, la fecha y el responsable para poder
--     retomar el RFQ desde la cola.
--   * Se agregan las opciones operativas que usa esa captura. «Otro» ya
--     existe y conserva la unicidad de `ux_proxima_accion_otro`.
--   * Aditiva e idempotente: solo inserta códigos ausentes; el trigger de
--     versionado de catálogos registra las filas nuevas.
-- =============================================================================

INSERT INTO public.catalogo_proximas_acciones (codigo, nombre, es_otro, orden) VALUES
  ('REQUEST_MISSING_INFO',  'Solicitar información faltante', false, 80),
  ('WAIT_CUSTOMER_FILE',    'Esperar archivo del cliente',     false, 90),
  ('CONFIRM_SPECIFICATION', 'Confirmar especificación',        false, 100),
  ('COMPLETE_RFQ',          'Completar RFQ',                   false, 110)
ON CONFLICT (codigo) DO NOTHING;
