'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import {
  ETIQUETAS_COLUMNA,
  ETIQUETAS_URGENCIA,
  procesoRepresentativoItem,
  type GrupoOrdenEspacioOperador,
  type ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import {
  etiquetaDiaCorto,
  etiquetaDiaLargo,
  horasLegibles,
  textoCompromiso,
} from '@/modulos/produccion/utilidades/formato-operador';

export interface PropsDetalleOrdenOperador {
  orden: GrupoOrdenEspacioOperador | null;
  hoy: string;
  onCerrar: () => void;
  onAbrirProceso: (proceso: ProcesoEspacioOperador) => void;
}

function rutaDeItem(item: GrupoOrdenEspacioOperador['items'][number]): string {
  const representante = procesoRepresentativoItem(item);
  if (representante.procesosRuteo.length > 0) {
    return representante.procesosRuteo
      .map((paso, indice) => `${indice + 1}. ${paso.nombre}`)
      .join(' → ');
  }
  return item.procesos
    .map((proceso, indice) => `${indice + 1}. ${proceso.procesoNombre}`)
    .join(' → ');
}

/**
 * Detalle general de una orden del piso. Reúne todos sus ítems y permite bajar
 * al detalle de cada proceso; la tarjeta del tablero abre este resumen.
 */
export function DetalleOrdenOperador({
  orden,
  hoy,
  onCerrar,
  onAbrirProceso,
}: PropsDetalleOrdenOperador) {
  if (!orden) return null;

  const archivos = [...new Map(
    orden.procesos.flatMap((proceso) => proceso.archivos).map((archivo) => [archivo.id, archivo]),
  ).values()];

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-4 overflow-y-auto"
        data-testid="detalle-orden-operador"
        aria-label={`Detalle de la orden ${orden.folioOrden}`}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-texto-secundario">{orden.folioOrden}</span>
            <span>{orden.clienteNombre}</span>
            <Badge variante={orden.urgencia === 'vencida' || orden.urgencia === 'urgente' ? 'peligro' : orden.urgencia === 'proxima' ? 'alerta' : 'neutro'}>
              {ETIQUETAS_URGENCIA[orden.urgencia]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {orden.items.length} ítem{orden.items.length === 1 ? '' : 's'} ·{' '}
            {orden.procesos.length} proceso{orden.procesos.length === 1 ? '' : 's'} ·{' '}
            compromiso {etiquetaDiaCorto(orden.fechaCompromiso)} ({textoCompromiso(orden.fechaCompromiso, hoy)})
          </DialogDescription>
        </DialogHeader>

        <section className="grid grid-cols-2 gap-3 rounded-lg border border-borde p-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Estado</p>
            <p className="text-sm font-medium">{ETIQUETAS_COLUMNA[orden.columna]}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Avance</p>
            <p className="text-sm font-medium tabular-nums">
              {formatearNumero(orden.cantidadProducida, 0)}/{formatearNumero(orden.cantidadSolicitada, 0)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Fecha entrega</p>
            <p className="text-sm font-medium">{etiquetaDiaLargo(orden.fechaCompromiso)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Horas estimadas</p>
            <p className="text-sm font-medium">{horasLegibles(orden.horas)}</p>
          </div>
        </section>

        <section aria-label="Ítems de la orden" className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-semibold text-texto-primario">Qué fabricar</h3>
            <p className="text-xs text-texto-secundario">
              Abre un ítem para ver sus procesos, material y avance.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {orden.items.map((item) => {
              const representante = procesoRepresentativoItem(item);
              const ruta = rutaDeItem(item);
              const mostrarEstado = representante.columna !== orden.columna;
              return (
                <li
                  key={item.partidaId}
                  className="relative rounded-lg border border-borde bg-superficie-2/30 p-3 transition-colors hover:border-acento/50 hover:bg-superficie-2/60"
                  data-testid={`orden-item-${item.partidaId}`}
                >
                  <button
                    type="button"
                    onClick={() => onAbrirProceso(representante)}
                    className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                    aria-label={`Abrir ${item.codigoPieza} de ${orden.folioOrden}`}
                    data-testid={`abrir-item-orden-${item.partidaId}`}
                  />
                  <div className="pointer-events-none relative z-10 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-texto-primario">
                        {item.codigoPieza}
                        {item.descripcion ? (
                          <span className="font-normal text-texto-secundario"> · {item.descripcion}</span>
                        ) : null}
                      </p>
                      <p className="shrink-0 text-right text-xs tabular-nums text-texto-secundario">
                        {formatearNumero(item.cantidadProducida, 0)}/{formatearNumero(item.cantidadSolicitada, 0)}{' '}
                        {item.unidadMedida} · {Math.round(item.porcentaje)}%
                      </p>
                    </div>
                    <p className="truncate text-xs text-texto-tenue" title={ruta}>{ruta}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
                      {item.material ? (
                        <span className="truncate">{item.material.codigo} · {item.material.nombre}</span>
                      ) : null}
                      <span className="tabular-nums">{horasLegibles(representante.horasEstimadas)}</span>
                      {mostrarEstado ? (
                        <Badge variante="info">Ahora: {ETIQUETAS_COLUMNA[representante.columna]}</Badge>
                      ) : null}
                      {representante.etiquetas.includes('Sin piezas previas') ? (
                        <Badge variante="alerta">Sin piezas previas</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <BarraProgreso
                        valor={item.porcentaje}
                        tono="acento"
                        etiqueta={`Avance de ${item.codigoPieza}`}
                      />
                    </div>
                    <span className="text-xs font-medium text-acento-texto">Ver procesos de {item.codigoPieza} ›</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-borde p-3">
          <h3 className="text-sm font-semibold text-texto-primario">
            Archivos de la orden ({archivos.length})
          </h3>
          {archivos.length === 0 ? (
            <p className="mt-1 text-xs text-texto-secundario">Sin archivos vigentes.</p>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm">
              {archivos.map((archivo) => (
                <li key={archivo.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{archivo.nombre}</span>
                  <span className="shrink-0 text-xs text-texto-tenue">Disponible en el proceso</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar}>
            Cerrar orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
