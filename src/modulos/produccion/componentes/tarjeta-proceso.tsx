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
  type ProcesoEspacioOperador,
  type TipoAccionTarjeta,
  type UrgenciaProceso,
} from '@/modulos/produccion/tipos/indice';
import {
  etiquetaDiaCorto,
  horasLegibles,
  textoCompromiso,
} from '@/modulos/produccion/utilidades/formato-operador';

/** C10: tarjeta de una operación con todo lo necesario para fabricarla. */

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

const ETIQUETAS_DE_URGENCIA = new Set<string>(Object.values(ETIQUETAS_URGENCIA));

export interface PropsTarjetaProceso {
  proceso: ProcesoEspacioOperador;
  hoy: string;
  arrastrable?: boolean;
  compacta?: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAccion: (proceso: ProcesoEspacioOperador, accion: TipoAccionTarjeta) => void;
}

export function TarjetaProceso({
  proceso,
  hoy,
  arrastrable = false,
  compacta = false,
  onAbrir,
  onAccion,
}: PropsTarjetaProceso) {
  const accion = accionPrincipal(proceso);
  const otrasEtiquetas = proceso.etiquetas.filter((etiqueta) => !ETIQUETAS_DE_URGENCIA.has(etiqueta));

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-borde bg-superficie p-3 text-left shadow-sm transition-shadow',
        BORDE_URGENCIA[proceso.urgencia],
        arrastrable && 'cursor-grab active:cursor-grabbing',
        compacta ? 'gap-1.5 p-2.5' : null,
      )}
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
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-texto-secundario">
            {proceso.folioOrden}
          </p>
          <p className="truncate text-sm font-semibold text-texto-primario" title={proceso.descripcion ?? proceso.codigoPieza}>
            {proceso.codigoPieza}
            {proceso.descripcion ? <span className="font-normal text-texto-secundario"> · {proceso.descripcion}</span> : null}
          </p>
        </div>
        <Badge variante={VARIANTE_URGENCIA[proceso.urgencia]}>{ETIQUETAS_URGENCIA[proceso.urgencia]}</Badge>
      </div>

      <p className="truncate text-xs text-texto-secundario">{proceso.clienteNombre}</p>

      <div className="flex flex-wrap gap-1">
        {otrasEtiquetas.map((etiqueta) => (
          <Badge key={etiqueta} variante={etiqueta === 'Externo' ? 'info' : 'neutro'}>
            {etiqueta}
          </Badge>
        ))}
        <Badge variante={VARIANTE_COLUMNA[proceso.columna]}>
          {ETIQUETAS_COLUMNA[proceso.columna]}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="min-w-0">
          <dt className="text-texto-tenue">Cantidad</dt>
          <dd className="truncate font-medium tabular-nums">
            {formatearNumero(proceso.hechoPiezas, 0)}/{formatearNumero(proceso.metaPiezas, 0)} {proceso.unidadMedida}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-texto-tenue">Compromiso</dt>
          <dd className="truncate font-medium" title={proceso.fechaCompromiso}>
            {etiquetaDiaCorto(proceso.fechaCompromiso)} · {textoCompromiso(proceso.fechaCompromiso, hoy)}
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-texto-tenue">Proceso · área</dt>
          <dd className="truncate font-medium">
            {proceso.secuencia}. {proceso.procesoNombre} · {proceso.areaNombre}
          </dd>
        </div>
        {proceso.material ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-texto-tenue">Material</dt>
            <dd className="truncate font-medium">
              {proceso.material.codigo} · {proceso.material.nombre}
              {proceso.material.anchoMm && proceso.material.largoMm
                ? ` · ${formatearNumero(proceso.material.anchoMm, 0)}×${formatearNumero(proceso.material.largoMm, 0)} mm`
                : ''}
            </dd>
          </div>
        ) : null}
        <div className="col-span-2 min-w-0">
          <dt className="text-texto-tenue">Horas estimadas</dt>
          <dd className="font-medium tabular-nums">{horasLegibles(proceso.horasEstimadas)}</dd>
        </div>
      </dl>

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

      {proceso.reclamo && !proceso.reclamadoPorMi ? (
        <p className="truncate text-xs text-advertencia-texto">
          Tomado por {proceso.nombreReclamante ?? 'otro operador'} · {etiquetaDiaCorto(proceso.reclamo.fecha)}
        </p>
      ) : null}
      {proceso.reclamo && proceso.reclamadoPorMi ? (
        <p className="truncate text-xs text-exito-texto">
          Reservado por ti · {etiquetaDiaCorto(proceso.reclamo.fecha)}
        </p>
      ) : null}
    </article>
  );
}
