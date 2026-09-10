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
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="titulo-pipeline-dashboard" className="text-xl font-semibold">{titulo}</h2><span className="text-sm text-foreground/65">{cotizacionesSinSeguimiento} cotizaciones sin seguimiento</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ETAPAS.map(([etapa, etiqueta]) => <article key={etapa} className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">{etiqueta}</p><p className="mt-1 text-2xl font-bold tabular-nums">{pipeline[etapa]}</p></article>)}
      </div>
    </section>
  );
}
