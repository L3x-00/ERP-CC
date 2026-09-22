'use client';

import type { DragEvent } from 'react';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  etiquetaArea,
  etiquetaAvancePartida,
  etiquetaMaterial,
  etiquetaProcesos,
  formatearDuracionMinutos,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TURNO,
  VARIANTE_ESTADO,
} from '@/modulos/planeacion/utilidades/etiquetas';

/** Tipo de dato del arrastre de programaciones entre días del calendario. */
export const TIPO_ARRASTRE_PROGRAMACION = 'application/x-orca-programacion';

export interface PropsTarjetaProgramacionPlaneacion {
  programacion: ProgramacionArea;
  recurso?: RecursoPlaneacion;
  desglose?: DesglosePartidaPlaneacion;
  carga?: CargaCapacidadDiaria;
  seleccionada: boolean;
  arrastrable?: boolean;
  compacta?: boolean;
  onSeleccionar?: (programacion: ProgramacionArea) => void;
}

/**
 * OBS-08: tarjeta programable con el desglose de la partida (pedido, material,
 * área/procesos, avance y tiempo). Los datos aún no capturados se declaran
 * explícitamente "Por definir". Si es arrastrable, el calendario la mueve de
 * fecha mediante el diálogo de confirmación; nunca muta por sí sola.
 */
export function TarjetaProgramacionPlaneacion({
  programacion,
  recurso,
  desglose,
  carga,
  seleccionada,
  arrastrable = false,
  compacta = false,
  onSeleccionar,
}: PropsTarjetaProgramacionPlaneacion) {
  const titulo = desglose ? `${desglose.folio} · ${desglose.codigoPieza}` : 'Partida';

  function iniciarArrastre(evento: DragEvent<HTMLElement>): void {
    evento.dataTransfer.setData(TIPO_ARRASTRE_PROGRAMACION, programacion.id);
    evento.dataTransfer.setData('text/plain', programacion.id);
    evento.dataTransfer.effectAllowed = 'move';
  }

  return (
    <article
      data-testid={`programacion-${programacion.id}`}
      data-seleccionada={seleccionada ? 'si' : 'no'}
      draggable={arrastrable}
      onDragStart={arrastrable ? iniciarArrastre : undefined}
      className={
        seleccionada
          ? 'flex flex-col gap-2 rounded-base border border-acento bg-superficie-2 p-3 text-xs'
          : 'flex flex-col gap-2 rounded-base border border-borde bg-superficie p-3 text-xs'
      }
    >
      <header className="flex items-start justify-between gap-2">
        <p className="font-mono text-[11px] font-medium">{titulo}</p>
        <Badge variante={VARIANTE_ESTADO[programacion.estadoPlaneacion]}>
          {ETIQUETA_ESTADO[programacion.estadoPlaneacion]}
        </Badge>
      </header>

      {!compacta ? (
        <p className="text-texto-secundario">{textoODefecto(desglose?.descripcion)}</p>
      ) : null}

      {!compacta ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div>
            <dt className="text-texto-secundario">Área</dt>
            <dd>{desglose ? etiquetaArea(desglose) : textoODefecto(null)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Procesos</dt>
            <dd>{desglose ? etiquetaProcesos(desglose) : textoODefecto(null)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Equipo / estación</dt>
            <dd>{desglose ? textoODefecto(desglose.maquinaAsignada) : textoODefecto(null)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Material</dt>
            <dd>{desglose ? etiquetaMaterial(desglose) : textoODefecto(null)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Tiempo estimado</dt>
            <dd>
              {desglose
                ? formatearDuracionMinutos(desglose.tiempoEstimadoMinutos)
                : textoODefecto(null)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-texto-secundario">Avance</dt>
            <dd>{desglose ? etiquetaAvancePartida(desglose) : textoODefecto(null)}</dd>
          </div>
          {desglose?.esExterno ? (
            <div className="col-span-2">
              <dt className="text-texto-secundario">Externo</dt>
              <dd>{textoODefecto(desglose.proveedorExterno)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2">
        <span className="text-texto-secundario">
          {compacta
            ? `${recurso?.codigo ?? 'Recurso'} · ${programacion.horasEstimadas} h`
            : `${recurso ? `${recurso.codigo} · ${recurso.nombre}` : 'Recurso'} · ${
                ETIQUETA_TURNO[programacion.turno]
              } · ${programacion.horasEstimadas} h · prioridad ${programacion.ordenPrioridad}`}
        </span>
        {carga && !compacta ? (
          <span className={carga.sobrecargado ? 'text-peligro-texto' : 'text-texto-secundario'}>
            {carga.horasProgramadas}/{carga.horasCapacidad} h
          </span>
        ) : null}
        {onSeleccionar ? (
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            onClick={() => onSeleccionar(programacion)}
          >
            Seleccionar
          </Button>
        ) : null}
      </footer>

      {arrastrable && !compacta ? (
        <p className="text-[11px] text-texto-secundario">
          Arrastra la tarjeta a otro día para reprogramar con confirmación.
        </p>
      ) : null}
    </article>
  );
}
