import { SincronizadorPipelineRealtime } from '@/modulos/pipeline/componentes/sincronizador-pipeline-realtime';
import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';
import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';

type ParametrosPaginaRfq = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Cola y ficha RFQ (plan §3.8). Conserva los deep-links `?rfq=<id>` y el
 * histórico `?oportunidad=<id>` (historial del cliente).
 */
export default async function PaginaRfq({ searchParams }: ParametrosPaginaRfq) {
  const parametros = searchParams ? await searchParams : {};
  const rfqId =
    typeof parametros.rfq === 'string'
      ? parametros.rfq
      : typeof parametros.oportunidad === 'string'
        ? parametros.oportunidad
        : undefined;

  if (rfqId) {
    return (
      <>
        <SincronizadorPipelineRealtime />
        <FichaRfq rfqId={rfqId} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SincronizadorPipelineRealtime />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">RFQ</h1>
        <p className="text-sm text-texto-secundario">
          Solicitudes de cotización: captura, ítems ITxx, archivos y gate LISTO.
        </p>
      </header>
      <ColaRfq />
    </div>
  );
}
