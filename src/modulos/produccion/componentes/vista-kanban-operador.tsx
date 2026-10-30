'use client';

import {
  COLUMNAS_ESPACIO_OPERADOR,
  ETIQUETAS_COLUMNA,
  agruparProcesosPorOrden,
  type ColumnaEspacioOperador,
  type ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import { cn } from '@/compartido/utilidades/cn';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import { TarjetaOrdenOperador } from './tarjeta-orden-operador';

export interface PropsVistaKanbanOperador {
  procesos: ProcesoEspacioOperador[];
  hoy: string;
  soloLectura: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
}

const ESTILO_COLUMNA: Record<ColumnaEspacioOperador, string> = {
  aprobada: 'border-t-info bg-info-suave/30',
  bandeja: 'border-t-borde-fuerte bg-superficie-2/40',
  en_proceso: 'border-t-exito bg-exito-suave/30',
  pausada: 'border-t-advertencia bg-advertencia-suave/30',
  lista: 'border-t-exito bg-exito-suave/20',
};

/** C10: Kanban de 5 columnas del piso, agrupado por orden e ítem. */
export function VistaKanbanOperador({
  procesos,
  hoy,
  soloLectura,
  onAbrir,
}: PropsVistaKanbanOperador) {
  const ordenes = agruparProcesosPorOrden(procesos);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" data-testid="vista-kanban-operador">
      {COLUMNAS_ESPACIO_OPERADOR.map((columna) => {
        const ordenesDelEstado = ordenes.filter((grupo) => grupo.columna === columna);
        const procesosDelEstado = ordenesDelEstado.reduce(
          (total, grupo) => total + grupo.procesos.length,
          0,
        );
        const horas = ordenesDelEstado.reduce((total, grupo) => total + grupo.horas, 0);
        return (
          <section
            key={columna}
            className={cn(
              'flex w-[292px] shrink-0 flex-col gap-2 rounded-lg border border-t-4 border-borde p-2',
              ESTILO_COLUMNA[columna],
            )}
            aria-label={`${ETIQUETAS_COLUMNA[columna]}: ${ordenesDelEstado.length} órdenes, ${procesosDelEstado} procesos`}
            data-testid={`columna-${columna}`}
          >
            <header className="flex items-baseline justify-between gap-2 px-1">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-texto-primario">
                  {ETIQUETAS_COLUMNA[columna]}
                  <span className="ml-1.5 rounded-full bg-superficie px-1.5 py-0.5 text-xs tabular-nums text-texto-secundario">
                    {ordenesDelEstado.length}
                  </span>
                </h3>
                <p className="text-[11px] text-texto-tenue">
                  {ordenesDelEstado.length} orden{ordenesDelEstado.length === 1 ? '' : 'es'} ·{' '}
                  {procesosDelEstado} proceso{procesosDelEstado === 1 ? '' : 's'}
                </p>
              </div>
              <span className="text-xs tabular-nums text-texto-tenue">{horasLegibles(horas)}</span>
            </header>
            {ordenesDelEstado.length === 0 ? (
              <p className="rounded-md border border-dashed border-borde-fuerte/60 p-3 text-center text-xs text-texto-tenue">
                Sin órdenes
              </p>
            ) : (
              <ul className="grid min-w-0 gap-2">
                {ordenesDelEstado.map((grupo) => (
                  <li key={grupo.ordenId} className="min-w-0">
                    <TarjetaOrdenOperador
                      grupo={grupo}
                      hoy={hoy}
                      arrastrable={!soloLectura && columna !== 'lista'}
                      onAbrir={onAbrir}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
