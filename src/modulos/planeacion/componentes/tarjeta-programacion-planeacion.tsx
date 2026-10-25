'use client';

import { useState } from 'react';
import type { DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { AccionesTarjetaOrden } from '@/modulos/planeacion/componentes/acciones-tarjeta-orden';
import { InsigniaSaturacion } from '@/modulos/planeacion/componentes/insignia-saturacion';
import { clasificarSaturacion } from '@/modulos/planeacion/servicios/capacidad-servicio';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  etiquetaArea,
  etiquetaMaterial,
  etiquetaProcesos,
  formatearDuracionMinutos,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TURNO,
  VARIANTE_ESTADO,
  nivelSemaforo,
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
  onRefrescarOperacion?: () => void;
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
  onRefrescarOperacion,
  onSeleccionar,
}: PropsTarjetaProgramacionPlaneacion) {
  const enrutador = useRouter();
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const titulo = desglose ? `${desglose.folio} · ${desglose.codigoPieza}` : 'Partida';
  const itemTexto = desglose ? textoODefecto(desglose.codigoItem) : textoODefecto(null);
  const procesosTexto = desglose ? etiquetaProcesos(desglose) : textoODefecto(null);
  const nivelSaturacion = carga
    ? nivelSemaforo(clasificarSaturacion(carga.horasCapacidad, carga.horasProgramadas))
    : null;

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
          ? `flex min-w-0 flex-col ${compacta ? 'gap-1 p-2' : 'gap-2 p-3'} rounded-base border border-acento bg-superficie-2 text-xs`
          : `flex min-w-0 flex-col ${compacta ? 'gap-1 p-2' : 'gap-2 p-3'} rounded-base border border-borde bg-superficie text-xs`
      }
    >
      <header className="flex items-start gap-1.5">
        {arrastrable ? (
          <span
            data-testid={`asa-arrastre-${programacion.id}`}
            draggable
            onDragStart={iniciarArrastre}
            title="Arrastrar para reprogramar"
            aria-hidden="true"
            className="mt-0.5 shrink-0 cursor-grab select-none text-base leading-none text-texto-tenue active:cursor-grabbing"
          >
            ⠿
          </span>
        ) : null}
        <div className={`flex min-w-0 flex-1 flex-col ${compacta ? 'gap-0.5' : 'gap-2'}`}>
          <button
            type="button"
            draggable={false}
            data-testid={`resumen-orden-${programacion.id}`}
            aria-label={`Ver resumen de la orden ${titulo}`}
            title={titulo}
            onClick={() => setResumenAbierto(true)}
            className={`${compacta ? 'min-w-0 flex-1' : 'min-w-0'} truncate rounded-sm text-left font-mono text-[11px] font-medium underline decoration-dotted underline-offset-2 hover:text-acento focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:outline-none`}
          >
            {compacta && desglose ? desglose.folio : titulo}
          </button>
          <span className="self-start">
            <Badge
              variante={VARIANTE_ESTADO[programacion.estadoPlaneacion]}
              className={compacta ? 'px-1.5 py-0 text-[9px] leading-4' : undefined}
            >
              {ETIQUETA_ESTADO[programacion.estadoPlaneacion]}
            </Badge>
          </span>
        </div>
      </header>

      {!compacta ? (
        <p className="text-texto-secundario">{textoODefecto(desglose?.descripcion)}</p>
      ) : null}

      {compacta ? (
        <>
          <p className="truncate text-[10px] leading-4 text-texto-secundario" title={`Ítem ${itemTexto}`}>
            Ítem {itemTexto}
          </p>
          <p className="truncate text-[10px] leading-4 text-texto-secundario" title={procesosTexto}>
            Procesos: {procesosTexto}
          </p>
        </>
      ) : null}

      {!compacta ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="col-span-2">
            <dt className="text-texto-secundario">Ítem</dt>
            <dd>{itemTexto}</dd>
          </div>
          {programacion.operacionNombre ? (
            <div className="col-span-2">
              <dt className="text-texto-secundario">Operación</dt>
              <dd>{programacion.secuencia} · {programacion.operacionNombre}</dd>
            </div>
          ) : null}
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
          {desglose?.esExterno ? (
            <div className="col-span-2">
              <dt className="text-texto-secundario">Externo</dt>
              <dd>{textoODefecto(desglose.proveedorExterno)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <footer
        className={`flex items-center border-t border-borde ${
          compacta ? 'gap-1 pt-1' : 'flex-wrap justify-between gap-2 pt-2'
        }`}
      >
        <span
          className={`text-texto-secundario ${compacta ? 'min-w-0 flex-1 truncate text-[10px]' : ''}`}
          title={compacta ? `${recurso?.codigo ?? 'Recurso'} · ${programacion.horasEstimadas} h` : undefined}
        >
          {compacta
            ? `${recurso?.codigo ?? 'Recurso'} · ${programacion.horasEstimadas} h`
            : `${recurso ? `${recurso.codigo} · ${recurso.nombre}` : 'Recurso'} · ${
                ETIQUETA_TURNO[programacion.turno]
              } · ${programacion.horasEstimadas} h · prioridad ${programacion.ordenPrioridad}`}
        </span>
        {carga && nivelSaturacion && !compacta ? (
          <InsigniaSaturacion
            nivel={nivelSaturacion}
            horasProgramadas={carga.horasProgramadas}
            horasCapacidad={carga.horasCapacidad}
          />
        ) : null}
        {onSeleccionar ? (
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            onClick={() => onSeleccionar(programacion)}
            className={compacta ? 'shrink-0 px-2 text-[10px]' : 'shrink-0'}
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

      {!compacta && onRefrescarOperacion ? (
        <AccionesTarjetaOrden
          programacion={programacion}
          onRefrescar={onRefrescarOperacion}
        />
      ) : null}

      <Dialog open={resumenAbierto} onOpenChange={setResumenAbierto}>
        <DialogContent data-testid="resumen-orden-planeacion">
          <DialogHeader>
            <DialogTitle>{desglose ? `Orden ${desglose.folio}` : 'Orden'}</DialogTitle>
            <DialogDescription>
              Resumen rápido de la programación. La ficha completa abre en Órdenes.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div className="col-span-2">
              <dt className="text-texto-secundario">Pieza</dt>
              <dd>
                {desglose
                  ? `${desglose.codigoPieza} · ${textoODefecto(desglose.descripcion)}`
                  : 'Partida'}
              </dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Ítem</dt>
              <dd>{itemTexto}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Procesos</dt>
              <dd>{procesosTexto}</dd>
            </div>
            {desglose ? (
              <>
                <div>
                  <dt className="text-texto-secundario">Área</dt>
                  <dd>{etiquetaArea(desglose)}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Material</dt>
                  <dd>{etiquetaMaterial(desglose)}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Tiempo estimado</dt>
                  <dd>{formatearDuracionMinutos(desglose.tiempoEstimadoMinutos)}</dd>
                </div>
              </>
            ) : null}
            {programacion.operacionNombre ? (
              <div className="col-span-2">
                <dt className="text-texto-secundario">Operación</dt>
                <dd>
                  {programacion.secuencia} · {programacion.operacionNombre}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-texto-secundario">Recurso</dt>
              <dd>{recurso ? `${recurso.codigo} · ${recurso.nombre}` : 'Recurso'}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Fecha</dt>
              <dd>
                {programacion.fechaProgramada} · {ETIQUETA_TURNO[programacion.turno]}
              </dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Horas</dt>
              <dd>{programacion.horasEstimadas} h</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Estado</dt>
              <dd>{ETIQUETA_ESTADO[programacion.estadoPlaneacion]}</dd>
            </div>
          </dl>
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setResumenAbierto(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              data-testid={`abrir-orden-${programacion.id}`}
              onClick={() => enrutador.push(`/ordenes?ordenId=${programacion.ordenId}`)}
            >
              Abrir orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
