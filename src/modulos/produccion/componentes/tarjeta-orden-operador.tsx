'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import { cn } from '@/compartido/utilidades/cn';
import {
  ETIQUETAS_COLUMNA,
  ETIQUETAS_URGENCIA,
  procesoRepresentativoItem,
  type GrupoOrdenEspacioOperador,
  type ProcesoEspacioOperador,
  type UrgenciaProceso,
} from '@/modulos/produccion/tipos/indice';
import {
  etiquetaDiaCorto,
  horasLegibles,
  textoCompromiso,
} from '@/modulos/produccion/utilidades/formato-operador';

const BORDE_URGENCIA: Record<UrgenciaProceso, string> = {
  vencida: 'border-l-peligro',
  urgente: 'border-l-peligro',
  proxima: 'border-l-advertencia',
  normal: 'border-l-borde',
};

const VARIANTE_URGENCIA = {
  vencida: 'peligro',
  urgente: 'peligro',
  proxima: 'alerta',
  normal: 'neutro',
} as const;

export interface PropsTarjetaOrdenOperador {
  grupo: GrupoOrdenEspacioOperador;
  hoy: string;
  arrastrable?: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
}

function rutaDeItem(grupo: GrupoOrdenEspacioOperador, indice: number): string {
  const item = grupo.items[indice];
  const representante = item ? procesoRepresentativoItem(item) : null;
  if (representante?.procesosRuteo.length) {
    return representante.procesosRuteo
      .map((paso, posicion) => `${posicion + 1}. ${paso.nombre}`)
      .join(' → ');
  }
  return (item?.procesos ?? [])
    .map((paso, posicion) => `${posicion + 1}. ${paso.procesoNombre}`)
    .join(' → ');
}

/**
 * Tarjeta de orden para el piso: la orden viaja completa y cada ítem es
 * clickeable. El detalle de procesos y las acciones viven en el modal, no en
 * la tarjeta. Así una orden con muchos ítems no se convierte en muchas tarjetas.
 */
export function TarjetaOrdenOperador({
  grupo,
  hoy,
  arrastrable = false,
  onAbrir,
}: PropsTarjetaOrdenOperador) {
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-borde bg-superficie p-3 text-left shadow-sm',
        BORDE_URGENCIA[grupo.urgencia],
      )}
      data-testid={`orden-operador-${grupo.ordenId}`}
      aria-label={`${grupo.folioOrden} · ${grupo.clienteNombre} · ${grupo.items.length} ítems`}
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-texto-primario">
              {grupo.folioOrden}
              {grupo.folioSii && grupo.folioSii !== grupo.folioOrden ? (
                <span className="ml-1 font-sans text-xs font-normal text-texto-tenue">
                  · {grupo.folioSii}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-texto-secundario">{grupo.clienteNombre}</p>
          </div>
          <Badge variante={VARIANTE_URGENCIA[grupo.urgencia]}>
            {ETIQUETAS_URGENCIA[grupo.urgencia]}
          </Badge>
        </div>
        <p className="text-[11px] text-texto-secundario">
          Compromiso:{' '}
          <span className="whitespace-nowrap">
            {etiquetaDiaCorto(grupo.fechaCompromiso)} · {textoCompromiso(grupo.fechaCompromiso, hoy)}
          </span>
        </p>
        <BarraProgreso
          valor={grupo.porcentaje}
          etiqueta={`Avance de ${grupo.folioOrden}`}
          mostrarPorcentaje
        />
      </header>

      <ul className="flex flex-col gap-1.5">
        {grupo.items.map((item, indice) => {
          const representante = procesoRepresentativoItem(item);
          const ruta = rutaDeItem(grupo, indice);
          const estadoDistinto = representante.columna !== grupo.columna;
          const tieneAviso = representante.etiquetas.includes('Sin piezas previas');
          return (
            <li
              key={item.partidaId}
              className="relative rounded-md border border-borde bg-superficie-2/30 p-2 transition-colors hover:border-acento/50 hover:bg-superficie-2/60"
              data-testid={`proceso-${representante.id}`}
              aria-label={`Abrir ${item.codigoPieza} de ${grupo.folioOrden}`}
              draggable={arrastrable}
              onDragStart={(evento) => {
                if (!arrastrable) {
                  evento.preventDefault();
                  return;
                }
                evento.dataTransfer.setData('text/plain', representante.id);
                evento.dataTransfer.effectAllowed = 'move';
              }}
            >
              <button
                type="button"
                draggable={false}
                onClick={() => onAbrir(representante)}
                className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                aria-label={`Abrir detalle de ${item.codigoPieza} de ${grupo.folioOrden}`}
                data-testid={`abrir-detalle-${representante.id}`}
              />
              <div className="pointer-events-none relative z-10 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-texto-primario" title={item.descripcion ?? item.codigoPieza}>
                    {item.codigoPieza}
                    {item.descripcion ? (
                      <span className="font-normal text-texto-secundario"> · {item.descripcion}</span>
                    ) : null}
                  </p>
                  <p className="shrink-0 text-right text-[11px] tabular-nums text-texto-secundario">
                    {formatearNumero(item.cantidadProducida, 0)}/{formatearNumero(item.cantidadSolicitada, 0)}{' '}
                    {item.unidadMedida} · {Math.round(item.porcentaje)}%
                  </p>
                </div>
                <p className="truncate text-[10px] text-texto-tenue" title={ruta}>
                  {ruta}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-texto-tenue">
                  <span>{horasLegibles(representante.horasEstimadas)}</span>
                  <span>· {representante.areaNombre}</span>
                  {estadoDistinto ? (
                    <Badge variante="info">{ETIQUETAS_COLUMNA[representante.columna]}</Badge>
                  ) : null}
                  {tieneAviso ? <Badge variante="alerta">Sin piezas previas</Badge> : null}
                  {representante.reclamo ? (
                    <span className={representante.reclamadoPorMi ? 'text-exito-texto' : 'text-advertencia-texto'}>
                      {representante.reclamadoPorMi
                        ? 'Reservado por ti'
                        : `Tomado por ${representante.nombreReclamante ?? 'otro operador'}`}
                    </span>
                  ) : null}
                  <span className="ml-auto font-medium text-acento-texto">Ver detalle ›</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
