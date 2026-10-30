'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import { cn } from '@/compartido/utilidades/cn';
import {
  ETIQUETAS_COLUMNA,
  ETIQUETAS_URGENCIA,
  accionPrincipal,
  type ColumnaEspacioOperador,
  type GrupoOrdenEspacioOperador,
  type ProcesoEspacioOperador,
  type TipoAccionTarjeta,
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

const VARIANTE_COLUMNA: Record<ColumnaEspacioOperador, 'neutro' | 'info' | 'exito' | 'alerta'> = {
  aprobada: 'info',
  bandeja: 'neutro',
  en_proceso: 'exito',
  pausada: 'alerta',
  lista: 'exito',
};

export interface PropsTarjetaOrdenOperador {
  grupo: GrupoOrdenEspacioOperador;
  hoy: string;
  arrastrable?: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAccion: (proceso: ProcesoEspacioOperador, accion: TipoAccionTarjeta) => void;
}

function ProcesoOrdenFila({
  proceso,
  arrastrable = false,
  onAbrir,
  onAccion,
}: {
  proceso: ProcesoEspacioOperador;
  arrastrable?: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAccion: (proceso: ProcesoEspacioOperador, accion: TipoAccionTarjeta) => void;
}) {
  const accion = accionPrincipal(proceso);

  return (
    <li
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-borde bg-superficie-2/30 p-2"
      data-testid={`proceso-${proceso.id}`}
      aria-label={`${proceso.folioOrden} · ${proceso.codigoPieza} · ${proceso.procesoNombre}`}
      draggable={arrastrable}
      onDragStart={(evento) => {
        if (!arrastrable) {
          evento.preventDefault();
          return;
        }
        evento.dataTransfer.setData('text/plain', proceso.id);
        evento.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold text-texto-primario">
          {proceso.secuencia}. {proceso.procesoNombre}
          <span className="font-normal text-texto-secundario"> · {proceso.areaNombre}</span>
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {proceso.etiquetas
            .filter((etiqueta) => etiqueta === 'Externo' || etiqueta === 'Sin piezas previas')
            .map((etiqueta) => (
              <Badge key={etiqueta} variante={etiqueta === 'Externo' ? 'info' : 'alerta'}>
                {etiqueta}
              </Badge>
            ))}
          <Badge variante={VARIANTE_COLUMNA[proceso.columna]}>
            {ETIQUETAS_COLUMNA[proceso.columna]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-secundario">
        <span>
          Cantidad:{' '}
          <span className="font-medium tabular-nums text-texto-primario">
            {formatearNumero(proceso.hechoPiezas, 0)}/{formatearNumero(proceso.metaPiezas, 0)}{' '}
            {proceso.unidadMedida}
          </span>
        </span>
        <span className="tabular-nums">{horasLegibles(proceso.horasEstimadas)}</span>
        {proceso.piezasDisponibles !== null ? (
          <span className={cn(
            'tabular-nums',
            proceso.piezasDisponibles === 0 ? 'text-advertencia-texto' : null,
          )}>
            {formatearNumero(proceso.piezasDisponibles, 0)} disp.
            {proceso.procesoPrevioNombre ? ` de ${proceso.procesoPrevioNombre}` : ''}
          </span>
        ) : null}
      </div>

      <BarraProgreso
        valor={proceso.porcentaje}
        tono={proceso.columna === 'lista' ? 'exito' : 'acento'}
        etiqueta={`Avance de ${proceso.codigoPieza} ${proceso.procesoNombre}`}
        mostrarPorcentaje
      />

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Button
          variante="contorno"
          tamano="sm"
          className="flex-1"
          onClick={() => onAbrir(proceso)}
          data-testid={`abrir-detalle-${proceso.id}`}
        >
          Detalle
        </Button>
        <Button
          tamano="sm"
          className="flex-1"
          disabled={accion.deshabilitada}
          title={proceso.motivoNoInicia ?? undefined}
          onClick={() => onAccion(proceso, accion.tipo)}
          data-testid={`accion-${accion.tipo}-${proceso.id}`}
        >
          {accion.etiqueta}
        </Button>
      </div>

      {proceso.reclamo ? (
        <p className={cn(
          'truncate text-[11px]',
          proceso.reclamadoPorMi ? 'text-exito-texto' : 'text-advertencia-texto',
        )}>
          {proceso.reclamadoPorMi
            ? `Reservado por ti · ${etiquetaDiaCorto(proceso.reclamo.fecha)}`
            : `Tomado por ${proceso.nombreReclamante ?? 'otro operador'} · ${etiquetaDiaCorto(proceso.reclamo.fecha)}`}
        </p>
      ) : null}
      {proceso.sesionActiva ? (
        <p className="truncate text-[11px] text-exito-texto">Sesión activa en este proceso</p>
      ) : null}
    </li>
  );
}

/**
 * Tarjeta de orden para el piso: una sola tarjeta por orden y columna, con sus
 * ítems y las operaciones de cada ítem. Cada operación conserva su avance y sus
 * acciones para no alterar el flujo de reclamar, iniciar, pausar o cerrar.
 */
export function TarjetaOrdenOperador({
  grupo,
  hoy,
  arrastrable = false,
  onAbrir,
  onAccion,
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
        <p className="text-[11px] text-texto-tenue">
          {grupo.items.length} ítem{grupo.items.length === 1 ? '' : 's'} ·{' '}
          {grupo.procesos.length} proceso{grupo.procesos.length === 1 ? '' : 's'} ·{' '}
          {horasLegibles(grupo.horas)}
        </p>
        <p className="text-[11px] text-texto-secundario">
          Compromiso:{' '}
          <span className="whitespace-nowrap">
            {etiquetaDiaCorto(grupo.fechaCompromiso)} · {textoCompromiso(grupo.fechaCompromiso, hoy)}
          </span>
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {grupo.items.map((item) => (
          <li
            key={item.partidaId}
            className="flex min-w-0 flex-col gap-1.5"
            data-testid={`item-orden-${item.partidaId}`}
          >
            <div className="flex items-start justify-between gap-2 border-t border-borde pt-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-texto-primario" title={item.descripcion ?? item.codigoPieza}>
                  {item.codigoPieza}
                  {item.descripcion ? (
                    <span className="font-normal text-texto-secundario"> · {item.descripcion}</span>
                  ) : null}
                </p>
                {item.material ? (
                  <p className="truncate text-[11px] text-texto-tenue">
                    {item.material.codigo} · {item.material.nombre}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-right text-[11px] tabular-nums text-texto-secundario">
                {formatearNumero(item.cantidadProducida, 0)}/{formatearNumero(item.cantidadSolicitada, 0)}{' '}
                {item.unidadMedida} · {Math.round(item.porcentaje)}%
              </p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {item.procesos.map((proceso) => (
                <ProcesoOrdenFila
                  key={proceso.id}
                  proceso={proceso}
                  arrastrable={arrastrable}
                  onAbrir={onAbrir}
                  onAccion={onAccion}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </article>
  );
}
