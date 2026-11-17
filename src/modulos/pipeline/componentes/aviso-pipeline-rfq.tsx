/**
 * Aclaración para quien llega desde `/pipeline` o desde un enlace histórico
 * `?oportunidad=<id>`. La oportunidad ES el RFQ: las etapas de `pipeline` son
 * una columna histórica (grandfathering) y el avance se gobierna con las
 * acciones de estado del RFQ. No introduce estados ni botones nuevos.
 */
export function AvisoPipelineRfq() {
  return (
    <div
      role="note"
      data-testid="aviso-pipeline-rfq"
      className="rounded-lg border border-acento/40 bg-acento-suave px-4 py-3"
    >
      <p className="text-sm font-semibold text-acento-texto">
        La oportunidad se gestiona en el RFQ
      </p>
      <p className="mt-1 text-xs text-texto-secundario">
        Las etapas comerciales son históricas y no se editan. El avance se controla con las
        acciones de estado del RFQ («Marcar listo», «Poner en espera», «Cerrar» o «Cancelar»).
        Los planos y adjuntos se administran en la pestaña «Archivos» y se heredan en la
        propuesta y en la orden.
      </p>
    </div>
  );
}
