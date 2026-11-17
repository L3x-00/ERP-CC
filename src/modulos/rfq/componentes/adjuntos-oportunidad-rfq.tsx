'use client';

import { PanelAdjuntos } from '@/modulos/pipeline/componentes/panel-adjuntos';

/**
 * La vista histórica de «adjuntos de la oportunidad» lee los mismos archivos
 * `rfq/<id>/…` que la pestaña Archivos del RFQ. Se monta aquí, en solo lectura,
 * para que las acciones ya existentes dejen de ser código inalcanzable sin
 * duplicar la captura canónica ni introducir otra ruta.
 */
export function AdjuntosOportunidadRfq({ pipelineId }: { pipelineId: string }) {
  return (
    <details
      data-testid="adjuntos-oportunidad-rfq"
      className="rounded-lg border border-borde bg-superficie p-3"
    >
      <summary className="cursor-pointer text-sm font-semibold text-texto-primario">
        Adjuntos de la oportunidad (vista histórica)
      </summary>
      <p className="mt-2 text-xs text-texto-secundario">
        Los archivos se administran arriba, en la pestaña Archivos del RFQ. Esta vista solo
        consulta los mismos adjuntos.
      </p>
      <div className="mt-2">
        <PanelAdjuntos pipelineId={pipelineId} soloLectura />
      </div>
    </details>
  );
}
