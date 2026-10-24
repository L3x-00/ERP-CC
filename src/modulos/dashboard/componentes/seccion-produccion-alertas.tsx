import { Badge } from '@/compartido/componentes/ui/badge';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { ResumenOrdenesDashboard } from '@/modulos/dashboard/tipos/indice';

/** Alertas de producción del periodo, con estado semántico y conteo. */
export function SeccionProduccionAlertas({ ordenes }: { ordenes: ResumenOrdenesDashboard }) {
  return (
    <section aria-labelledby="titulo-produccion-dashboard" className="grid gap-3">
      <h2 id="titulo-produccion-dashboard" className="text-xl font-semibold">Alertas de producción</h2>
      <Tarjeta>
        <ul className="flex flex-col gap-0.5 p-2">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 transition-colors duration-150 hover:bg-superficie-2/60">
            <BadgeEstado estado="pendiente" etiqueta="Aprobaciones pendientes" />
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.aprobacionesPendientes}</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 transition-colors duration-150 hover:bg-superficie-2/60">
            <BadgeEstado estado="en_proceso" etiqueta="Órdenes activas" />
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.activas}</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 transition-colors duration-150 hover:bg-superficie-2/60">
            <BadgeEstado estado="vencida" etiqueta="Órdenes atrasadas" />
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.atrasadas}</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 transition-colors duration-150 hover:bg-superficie-2/60">
            <Badge variante="alerta">En riesgo (3 días)</Badge>
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.enRiesgo}</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 transition-colors duration-150 hover:bg-superficie-2/60">
            <BadgeEstado estado="completada" etiqueta="Completadas" />
            <span className="text-lg font-semibold tabular-nums text-texto-primario">{ordenes.completadas}</span>
          </li>
        </ul>
      </Tarjeta>
    </section>
  );
}
