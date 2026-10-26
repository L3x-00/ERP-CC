'use client';

import dynamic from 'next/dynamic';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { MarcadorCargaGrafica } from '@/modulos/dashboard/componentes/marcador-carga-grafica';
import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { PipelinePorEtapa } from '@/modulos/dashboard/tipos/indice';
import { crearSeriePipelineDashboard } from '@/modulos/dashboard/utilidades/graficas-dashboard';

const GraficaBarrasDashboard = dynamic(
  () => import('@/modulos/dashboard/componentes/grafica-barras-dashboard').then((modulo) => modulo.GraficaBarrasDashboard),
  { ssr: false, loading: MarcadorCargaGrafica },
);

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
  identificador?: string;
}

/** Resumen de embudo propio o de equipo, sin exponer importes no autorizados. */
export function SeccionVentasPipeline({
  pipeline,
  cotizacionesSinSeguimiento,
  titulo = 'Pipeline de ventas',
  identificador = 'pipeline',
}: SeccionVentasPipelineProps) {
  const serie = crearSeriePipelineDashboard(pipeline);
  const total = serie.reduce((acumulado, dato) => acumulado + dato.valor, 0);
  const tienePendientes = cotizacionesSinSeguimiento > 0;

  return (
    <section aria-labelledby={`titulo-${identificador}-dashboard`} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`titulo-${identificador}-dashboard`} className="text-xl font-semibold">{titulo}</h2>
          <p className="text-sm text-texto-secundario">{total} oportunidades distribuidas por etapa.</p>
        </div>
        <span
          className={tienePendientes
            ? 'rounded-full bg-advertencia-suave px-3 py-1 text-xs font-semibold text-advertencia-texto'
            : 'rounded-full bg-exito-suave px-3 py-1 text-xs font-semibold text-exito-texto'}
        >
          {cotizacionesSinSeguimiento} cotizaciones sin seguimiento
        </span>
      </div>
      <Tarjeta className="p-3 sm:p-4">
        <GraficaBarrasDashboard
          datos={serie}
          tono="info"
          descripcion={`${titulo}: oportunidades por etapa del período seleccionado.`}
        />
      </Tarjeta>
      <PanelDesplegable
        titulo="Ver desglose del pipeline"
        descripcion="Las seis etapas permanecen disponibles sin cambiar los datos comerciales."
        resumen={`${total} oportunidades en total`}
        nivelTitulo="h3"
      >
        <ul className="grid gap-1" aria-label={`Desglose de ${titulo}`}>
          {ETAPAS.map(([etapa, etiqueta]) => (
            <li key={etapa} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-superficie-2/60">
              <BadgeEstado estado={etapa} etiqueta={etiqueta} />
              <span className="text-sm font-semibold tabular-nums text-texto-primario">{pipeline[etapa]}</span>
            </li>
          ))}
        </ul>
      </PanelDesplegable>
    </section>
  );
}
