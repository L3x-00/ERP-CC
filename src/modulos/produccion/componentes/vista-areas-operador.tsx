'use client';

import type {
  GrupoAreaEspacioOperador,
  ProcesoEspacioOperador,
  TipoAccionTarjeta,
} from '@/modulos/produccion/tipos/indice';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import { TarjetaProceso } from './tarjeta-proceso';

export interface PropsVistaAreasOperador {
  grupos: GrupoAreaEspacioOperador[];
  hoy: string;
  soloLectura: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAccion: (proceso: ProcesoEspacioOperador, accion: TipoAccionTarjeta) => void;
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
  onAccion,
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
      {grupos.map((grupo) => (
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
                {grupo.procesos.length}
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
            {grupo.procesos.map((proceso) => (
              <li key={proceso.id} className="min-w-0">
                <TarjetaProceso
                  proceso={proceso}
                  hoy={hoy}
                  arrastrable={!soloLectura}
                  onAbrir={onAbrir}
                  onAccion={onAccion}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
