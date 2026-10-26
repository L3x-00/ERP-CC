'use client';

import dynamic from 'next/dynamic';
import { Badge } from '@/compartido/componentes/ui/badge';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { MarcadorCargaGrafica } from '@/modulos/dashboard/componentes/marcador-carga-grafica';
import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { ResumenOrdenesDashboard } from '@/modulos/dashboard/tipos/indice';
import { crearSerieOrdenesDashboard } from '@/modulos/dashboard/utilidades/graficas-dashboard';

const GraficaBarrasDashboard = dynamic(
  () => import('@/modulos/dashboard/componentes/grafica-barras-dashboard').then((modulo) => modulo.GraficaBarrasDashboard),
  { ssr: false, loading: MarcadorCargaGrafica },
);

/** Alertas de producción del periodo, con estado semántico y conteo. */
export function SeccionProduccionAlertas({ ordenes }: { ordenes: ResumenOrdenesDashboard }) {
  const serie = crearSerieOrdenesDashboard(ordenes);
  const alertasCriticas = ordenes.atrasadas + ordenes.enRiesgo;

  return (
    <section aria-labelledby="titulo-produccion-dashboard" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-produccion-dashboard" className="text-xl font-semibold">Alertas de producción</h2>
          <p className="text-sm text-texto-secundario">Estado de las órdenes dentro del período seleccionado.</p>
        </div>
        <span className={alertasCriticas > 0
          ? 'rounded-full bg-peligro-suave px-3 py-1 text-xs font-semibold text-peligro-texto'
          : 'rounded-full bg-exito-suave px-3 py-1 text-xs font-semibold text-exito-texto'}
        >
          {ordenes.atrasadas} atrasadas · {ordenes.enRiesgo} en riesgo
        </span>
      </div>
      <Tarjeta className="p-3 sm:p-4">
        <GraficaBarrasDashboard
          datos={serie}
          tono={alertasCriticas > 0 ? 'advertencia' : 'acento'}
          descripcion="Producción: conteo por estado del período seleccionado."
        />
      </Tarjeta>
      <PanelDesplegable
        titulo="Ver desglose de producción"
        descripcion="Incluye las aprobaciones, órdenes activas, alertas y completadas."
        resumen={`${ordenes.activas} órdenes activas`}
        nivelTitulo="h3"
      >
        <ul className="grid gap-1" aria-label="Desglose de producción">
          <FilaAlerta etiqueta="Aprobaciones pendientes" estado="pendiente" valor={ordenes.aprobacionesPendientes} />
          <FilaAlerta etiqueta="Órdenes activas" estado="en_proceso" valor={ordenes.activas} />
          <FilaAlerta etiqueta="Órdenes atrasadas" estado="vencida" valor={ordenes.atrasadas} />
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-superficie-2/60">
            <Badge variante="alerta">En riesgo (3 días)</Badge>
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.enRiesgo}</span>
          </li>
          <FilaAlerta etiqueta="Completadas" estado="completada" valor={ordenes.completadas} />
        </ul>
      </PanelDesplegable>
    </section>
  );
}

function FilaAlerta({ etiqueta, estado, valor }: { etiqueta: string; estado: string; valor: number }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-superficie-2/60">
      <BadgeEstado estado={estado} etiqueta={etiqueta} />
      <span className="text-lg font-semibold tabular-nums text-texto-primario">{valor}</span>
    </li>
  );
}
