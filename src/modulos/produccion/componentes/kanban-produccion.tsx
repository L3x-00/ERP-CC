'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
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

function avanceOrden(orden: OrdenTableroProduccion): string {
  const solicitadas = orden.partidas.reduce((total, partida) => total + partida.cantidadSolicitada, 0);
  const producidas = orden.partidas.reduce((total, partida) => total + partida.cantidadProducida, 0);
  return `${producidas}/${solicitadas} piezas`;
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
        <h2 id="titulo-kanban-produccion" className="text-sm font-medium">Control de producción</h2>
        <p className="text-xs text-foreground/60" aria-live="polite">
          {actualizando ? 'Actualizando⬦' : `${ordenes.length} órdenes visibles`}
        </p>
      </div>
      <fieldset className="flex flex-wrap gap-2 text-xs">
        <legend className="sr-only">Filtrar columnas de producción</legend>
        {ESTADOS_KANBAN_PRODUCCION.map((estado) => (
          <label key={estado} className="flex items-center gap-1 rounded-base border border-foreground/10 px-2 py-1">
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
            <section key={estado} className="min-h-40 rounded-base border border-foreground/10 bg-foreground/[0.02] p-3" aria-label={ETIQUETAS_ESTADO[estado]}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {ETIQUETAS_ESTADO[estado]}
                </h3>
                <Badge variante={VARIANTES_ESTADO[estado]}>{ordenesColumna.length}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {ordenesColumna.map((orden) => (
                  <article
                    key={orden.id}
                    data-testid={`tarjeta-produccion-${orden.id}`}
                    className={
                      orden.id === ordenSeleccionadaId
                        ? 'rounded-base border border-primario/60 bg-primario/5 p-3'
                        : 'rounded-base border border-foreground/10 bg-background p-3'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm">{orden.folio}</strong>
                      <Badge variante={VARIANTES_ESTADO[estado]}>{ETIQUETAS_ESTADO[estado]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/70">{avanceOrden(orden)}</p>
                    <p className="mt-1 text-xs text-foreground/60">Compromiso: {new Date(orden.fechaCompromiso).toLocaleDateString('es-MX')}</p>
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      className="mt-3 w-full"
                      onClick={() => onSeleccionarOrden(orden.id)}
                    >
                      Operar orden
                    </Button>
                  </article>
                ))}
                {ordenesColumna.length === 0 ? (
                  <p className="py-4 text-center text-xs text-foreground/50">Sin órdenes</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
