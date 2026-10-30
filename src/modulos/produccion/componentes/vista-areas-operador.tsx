'use client';

import type {
  GrupoAreaEspacioOperador,
  ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import { agruparProcesosPorOrden } from '@/modulos/produccion/tipos/indice';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import { TarjetaOrdenOperador } from './tarjeta-orden-operador';

export interface PropsVistaAreasOperador {
  grupos: GrupoAreaEspacioOperador[];
  hoy: string;
  soloLectura: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAbrirOrden: (ordenId: string) => void;
}

/**
 * C10: vista por área macro. Agrupa las operaciones por la raíz del catálogo
 * de taller para que cada célula vea qué fabricar y con cuántas horas.
 */
export function VistaAreasOperador({
  grupos,
  hoy,
  soloLectura,
  onAbrir,
  onAbrirOrden,
}: PropsVistaAreasOperador) {
  if (grupos.length === 0) {
    return (
      <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-secundario">
        No hay procesos pendientes por área.
      </p>
    );
  }

  return (
    <div className="grid gap-4" data-testid="vista-areas-operador">
      {grupos.map((grupo) => {
        const ordenes = agruparProcesosPorOrden(grupo.procesos);
        return (
          <section
            key={grupo.codigo ?? 'sin-area'}
            className="rounded-lg border border-borde bg-superficie p-3"
            aria-label={`Área ${grupo.nombre}`}
            data-testid={`area-${grupo.codigo ?? 'sin-area'}`}
          >
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: grupo.colorHex ?? 'var(--acento)' }}
                />
                <h3 className="text-sm font-semibold text-texto-primario">{grupo.nombre}</h3>
                <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs tabular-nums text-texto-secundario">
                  {ordenes.length} órdenes · {grupo.procesos.length} procesos
                </span>
                {grupo.urgentes > 0 ? (
                  <span className="rounded-full bg-peligro-suave px-2 py-0.5 text-xs font-medium text-peligro-texto">
                    {grupo.urgentes} urgente{grupo.urgentes === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <span className="text-xs tabular-nums text-texto-secundario">
                {horasLegibles(grupo.horas)} estimadas
              </span>
            </header>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ordenes.map((orden) => (
                <li key={orden.ordenId} className="min-w-0">
                  <TarjetaOrdenOperador
                    grupo={orden}
                    hoy={hoy}
                    arrastrable={!soloLectura}
                    onAbrir={onAbrir}
                    onAbrirOrden={onAbrirOrden}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
