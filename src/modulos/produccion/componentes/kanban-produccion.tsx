'use client';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { cn } from '@/compartido/utilidades/cn';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';
import {
  ESTADOS_KANBAN_PRODUCCION,
  type EstadoKanbanProduccion,
} from '@/modulos/produccion/tipos/indice';

const ETIQUETAS_ESTADO: Record<EstadoKanbanProduccion, string> = {
  bandeja: 'Bandeja',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  lista: 'Lista',
  entregada: 'Entregada',
};

const VARIANTES_ESTADO: Record<EstadoKanbanProduccion, 'neutro' | 'info' | 'alerta' | 'exito'> = {
  bandeja: 'neutro',
  en_proceso: 'info',
  pausada: 'alerta',
  lista: 'info',
  entregada: 'exito',
};

export interface PropsKanbanProduccion {
  ordenes: readonly OrdenTableroProduccion[];
  ordenSeleccionadaId: string | null;
  estadosActivos: readonly EstadoKanbanProduccion[];
  actualizando: boolean;
  onSeleccionarOrden: (ordenId: string) => void;
  onAlternarEstado: (estado: EstadoKanbanProduccion) => void;
}

function totalesAvance(orden: OrdenTableroProduccion): { producidas: number; solicitadas: number } {
  return orden.partidas.reduce(
    (total, partida) => ({
      producidas: total.producidas + partida.cantidadProducida,
      solicitadas: total.solicitadas + partida.cantidadSolicitada,
    }),
    { producidas: 0, solicitadas: 0 },
  );
}

function avanceOrden(orden: OrdenTableroProduccion): string {
  const { producidas, solicitadas } = totalesAvance(orden);
  return `${producidas}/${solicitadas} piezas`;
}

function porcentajeOrden(orden: OrdenTableroProduccion): number {
  const { producidas, solicitadas } = totalesAvance(orden);
  return solicitadas > 0 ? (producidas / solicitadas) * 100 : 0;
}

/** Kanban derivado: las columnas no escriben ningún estado en la base de datos. */
export function KanbanProduccion({
  ordenes,
  ordenSeleccionadaId,
  estadosActivos,
  actualizando,
  onSeleccionarOrden,
  onAlternarEstado,
}: PropsKanbanProduccion) {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="titulo-kanban-produccion">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-kanban-produccion" className="text-base font-semibold text-texto-primario">
          Control de producción
        </h2>
        <p className="text-sm text-texto-secundario" aria-live="polite">
          {actualizando ? 'Actualizando…' : `${ordenes.length} órdenes visibles`}
        </p>
      </div>
      <fieldset className="flex flex-wrap gap-2 text-sm">
        <legend className="sr-only">Filtrar columnas de producción</legend>
        {ESTADOS_KANBAN_PRODUCCION.map((estado) => (
          <label
            key={estado}
            className="flex min-h-11 items-center gap-2 rounded-md border border-borde px-3"
          >
            <input
              type="checkbox"
              checked={estadosActivos.includes(estado)}
              onChange={() => onAlternarEstado(estado)}
            />
            {ETIQUETAS_ESTADO[estado]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 xl:grid-cols-5" data-testid="kanban-produccion">
        {ESTADOS_KANBAN_PRODUCCION.map((estado) => {
          const ordenesColumna = ordenes.filter((orden) => orden.estadoKanban === estado);
          return (
            <section
              key={estado}
              className="min-h-40 rounded-lg border border-borde bg-superficie-2/40 p-3"
              aria-label={ETIQUETAS_ESTADO[estado]}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                  {ETIQUETAS_ESTADO[estado]}
                </h3>
                <Badge variante={VARIANTES_ESTADO[estado]}>{ordenesColumna.length}</Badge>
              </div>
              <div className="flex flex-col gap-3">
                {ordenesColumna.map((orden) => (
                  <article
                    key={orden.id}
                    data-testid={`tarjeta-produccion-${orden.id}`}
                    className={cn(
                      'flex min-h-[200px] flex-col gap-2 rounded-lg border p-4',
                      orden.id === ordenSeleccionadaId
                        ? 'border-acento/60 bg-acento-suave'
                        : 'border-borde bg-superficie',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <strong className="font-mono text-base font-semibold text-texto-primario">
                          {orden.folio}
                        </strong>
                        {orden.esInterna && (
                          <span
                            className="rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold text-texto-secundario"
                            title="Trabajo interno (TI): no genera cobranza ni cuenta como venta"
                          >
                            TI
                          </span>
                        )}
                      </div>
                      <BadgeEstado
                        estado={orden.estadoKanban}
                        etiqueta={ETIQUETAS_ESTADO[orden.estadoKanban]}
                      />
                    </div>
                    <p className="text-sm font-medium text-texto-secundario">{avanceOrden(orden)}</p>
                    <BarraProgreso
                      valor={porcentajeOrden(orden)}
                      mostrarPorcentaje
                      etiqueta={`Avance de ${orden.folio}`}
                    />
                    <p className="text-sm text-texto-secundario">
                      Compromiso: <span className="whitespace-nowrap">{new Date(orden.fechaCompromiso).toLocaleDateString('es-MX')}</span>
                    </p>
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="lg"
                      className="mt-auto w-full"
                      onClick={() => onSeleccionarOrden(orden.id)}
                    >
                      Operar orden
                    </Button>
                  </article>
                ))}
                {ordenesColumna.length === 0 ? (
                  <p className="py-4 text-center text-sm text-texto-tenue">Sin órdenes</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
