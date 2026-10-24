import { SincronizadorPipelineRealtime } from '@/modulos/pipeline/componentes/sincronizador-pipeline-realtime';
import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';
import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

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
  const continuar = parametros.continuar === '1';

  if (rfqId) {
    return (
      <>
        <SincronizadorPipelineRealtime />
        <FichaRfq rfqId={rfqId} continuar={continuar} />
      </>
    );
  }

  const usuario = await obtenerUsuarioServidor();

  return (
    <div className="flex flex-col gap-5">
      <SincronizadorPipelineRealtime />
      {/* La cabecera de página y «Nuevo RFQ» viven en `ColaRfq` para compartir fila. */}
      <ColaRfq
        responsableActual={
          usuario ? { id: usuario.id, nombre: usuario.nombreCompleto } : undefined
        }
      />
    </div>
  );
}
