import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { PipelinePorEtapa } from '@/modulos/dashboard/tipos/indice';

const ETAPAS: readonly [keyof PipelinePorEtapa, string][] = [
  ['prospecto', 'Prospecto'],
  ['contactado', 'Contactado'],
  ['cotizado', 'Cotizado'],
  ['negociacion', 'Negociación'],
  ['ganada', 'Ganada'],
  ['perdida', 'Perdida'],
];

export interface SeccionVentasPipelineProps {
  pipeline: PipelinePorEtapa;
  cotizacionesSinSeguimiento: number;
  titulo?: string;
}

/** Resumen de embudo propio o de equipo, sin exponer importes no autorizados. */
export function SeccionVentasPipeline({ pipeline, cotizacionesSinSeguimiento, titulo = 'Pipeline de ventas' }: SeccionVentasPipelineProps) {
  return (
    <section aria-labelledby="titulo-pipeline-dashboard" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="titulo-pipeline-dashboard" className="text-xl font-semibold">{titulo}</h2><span className="text-sm text-texto-secundario">{cotizacionesSinSeguimiento} cotizaciones sin seguimiento</span></div>
      <Tarjeta>
        <ul className="divide-y divide-borde">
          {ETAPAS.map(([etapa, etiqueta]) => (
            <li key={etapa} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
              <BadgeEstado estado={etapa} etiqueta={etiqueta} />
              <span className="text-sm font-semibold tabular-nums text-texto-primario">{pipeline[etapa]}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </section>
  );
}
