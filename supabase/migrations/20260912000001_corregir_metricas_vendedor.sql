-- =============================================================================
-- Corrección: obtener_metricas_vendedor fallaba en tiempo de ejecución
--
-- El cuerpo de la función usa `FOR KEY SHARE` sobre el perfil del vendedor,
-- pero estaba marcada `STABLE`: PostgreSQL rechaza los bloqueos de fila dentro
-- de funciones no volátiles con
--   "SELECT FOR KEY SHARE is not allowed in a non-volatile function".
--
-- Solo cambia la volatilidad; firma, contrato JSON, grants y resultados quedan
-- idénticos. Es la ruta que servía el dashboard del rol vendedor.
-- =============================================================================

ALTER FUNCTION public.obtener_metricas_vendedor(uuid, timestamptz, timestamptz) VOLATILE;
