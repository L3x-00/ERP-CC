'use client';

import type { DragEvent } from 'react';
import type {
  CargaCapacidadDiaria,
  CompromisoPlaneacion,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  construirCeldasMes,
  etiquetaDia,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  TarjetaOrdenPlaneacion,
  TIPO_ARRASTRE_PROGRAMACION,
  type ItemOrdenPlaneacion,
} from '@/modulos/planeacion/componentes/tarjeta-orden-planeacion';
import { TarjetaCompromisoPlaneacion } from '@/modulos/planeacion/componentes/tarjeta-compromiso-planeacion';

/** Contrato común de las tres vistas del calendario de Planeación. */
export interface PropsVistaCalendario {
  fechas: readonly string[];
  fechaInicio: string;
  fechaFin: string;
  programaciones: readonly ProgramacionArea[];
  /** Propuestas aceptadas sin programación, ubicadas en su fecha compromiso. */
  compromisos?: readonly CompromisoPlaneacion[];
  recursosPorId: ReadonlyMap<string, RecursoPlaneacion>;
  desglosePorPartidaId: ReadonlyMap<string, DesglosePartidaPlaneacion>;
  cargasPorClave: ReadonlyMap<string, CargaCapacidadDiaria>;
  programacionSeleccionadaId: string | null;
  onSeleccionarProgramacion: (programacion: ProgramacionArea) => void;
  onProgramarCompromiso?: (compromiso: CompromisoPlaneacion) => void;
  onSolicitarReprogramacion?: (programacion: ProgramacionArea, fechaDestino: string) => void;
  onAbrirDia?: (fecha: string) => void;
  onRefrescarOperacion?: () => void;
}

export function idProgramacionArrastrada(evento: DragEvent): string | null {
  const id =
    evento.dataTransfer.getData(TIPO_ARRASTRE_PROGRAMACION) ||
    evento.dataTransfer.getData('text/plain');
  return id === '' ? null : id;
}

const ORDEN_TURNOS = ['matutino', 'vespertino', 'nocturno'] as const;

function ordenarProgramaciones(
  programaciones: readonly ProgramacionArea[],
): ProgramacionArea[] {
  return [...programaciones].sort((a, b) => {
    const turno = ORDEN_TURNOS.indexOf(a.turno) - ORDEN_TURNOS.indexOf(b.turno);
    if (turno !== 0) return turno;
    if (a.ordenPrioridad !== b.ordenPrioridad) return a.ordenPrioridad - b.ordenPrioridad;
    return a.fechaProgramada < b.fechaProgramada ? -1 : 1;
  });
}

function agruparPorFecha(
  programaciones: readonly ProgramacionArea[],
): Map<string, ProgramacionArea[]> {
  const porFecha = new Map<string, ProgramacionArea[]>();
  for (const programacion of ordenarProgramaciones(programaciones)) {
    const lista = porFecha.get(programacion.fechaProgramada) ?? [];
    lista.push(programacion);
    porFecha.set(programacion.fechaProgramada, lista);
  }
  return porFecha;
}

function agruparCompromisosPorFecha(
  compromisos: readonly CompromisoPlaneacion[],
): Map<string, CompromisoPlaneacion[]> {
  const porFecha = new Map<string, CompromisoPlaneacion[]>();
  for (const compromiso of compromisos) {
    const lista = porFecha.get(compromiso.fechaCompromiso) ?? [];
    lista.push(compromiso);
    porFecha.set(compromiso.fechaCompromiso, lista);
  }
  return porFecha;
}

/**
 * Agrupa los ítems de una misma orden para pintar una sola tarjeta. Cada orden
 * puede tener decenas de operaciones el mismo día; mostrarlas por separado
 * satura el calendario y hace creer que son órdenes distintas.
 */
function agruparPorOrden(
  programaciones: readonly ProgramacionArea[],
): ProgramacionArea[][] {
  const porOrden = new Map<string, ProgramacionArea[]>();
  for (const programacion of programaciones) {
    const lista = porOrden.get(programacion.ordenId) ?? [];
    lista.push(programacion);
    porOrden.set(programacion.ordenId, lista);
  }
  return [...porOrden.values()].map((items) => ordenarItemsDeOrden(items));
}

/** Dentro de la orden manda la secuencia del ruteo; luego turno y recurso. */
function ordenarItemsDeOrden(items: ProgramacionArea[]): ProgramacionArea[] {
  return [...items].sort((a, b) => {
    if (a.secuencia !== b.secuencia) return a.secuencia - b.secuencia;
    const turno = ORDEN_TURNOS.indexOf(a.turno) - ORDEN_TURNOS.indexOf(b.turno);
    if (turno !== 0) return turno;
    return a.recursoId < b.recursoId ? -1 : a.recursoId > b.recursoId ? 1 : 0;
  });
}

function construirItemsOrden(
  programaciones: readonly ProgramacionArea[],
  props: PropsVistaCalendario,
): ItemOrdenPlaneacion[] {
  return programaciones.map((programacion) => ({
    programacion,
    recurso: props.recursosPorId.get(programacion.recursoId),
    desglose: props.desglosePorPartidaId.get(programacion.partidaId),
    carga: props.cargasPorClave.get(
      `${programacion.recursoId}:${programacion.fechaProgramada}:${programacion.turno}`,
    ),
  }));
}

function TarjetaOrdenConContexto({
  programaciones,
  props,
  compacta,
}: {
  programaciones: readonly ProgramacionArea[];
  props: PropsVistaCalendario;
  compacta: boolean;
}) {
  return (
    <TarjetaOrdenPlaneacion
      items={construirItemsOrden(programaciones, props)}
      programacionSeleccionadaId={props.programacionSeleccionadaId}
      compacta={compacta}
      arrastrable={props.onSolicitarReprogramacion !== undefined}
      onRefrescarOperacion={props.onRefrescarOperacion}
      onSeleccionar={props.onSeleccionarProgramacion}
    />
  );
}

function soltarEnFecha(
  evento: DragEvent<HTMLElement>,
  fecha: string,
  props: PropsVistaCalendario,
): void {
  if (!props.onSolicitarReprogramacion) return;
  const id = idProgramacionArrastrada(evento);
  if (!id) return;
  const programacion = props.programaciones.find((actual) => actual.id === id);
  if (!programacion) return;
  props.onSolicitarReprogramacion(programacion, fecha);
}

/** Vista de un día: todas las programaciones del día agrupadas por turno. */
export function VistaDia({ fecha, ...props }: PropsVistaCalendario & { fecha: string }) {
  const programaciones = props.programaciones.filter(
    (programacion) => programacion.fechaProgramada === fecha,
  );
  const grupos = agruparPorOrden(programaciones);
  const compromisos = (props.compromisos ?? []).filter(
    (compromiso) => compromiso.fechaCompromiso === fecha,
  );
  // Sin otro día visible no hay destino de soltado: el arrastre se desactiva y
  // la reprogramación se hace desde el panel de asignación.
  const propsDia: PropsVistaCalendario = { ...props, onSolicitarReprogramacion: undefined };

  return (
    <section
      data-testid="vista-dia"
      aria-label={`Programaciones del ${fecha}`}
      className="flex flex-col gap-3 rounded-base border border-borde p-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{etiquetaDia(fecha)}</h3>
        <span className="text-xs text-texto-secundario">
          {grupos.length} {grupos.length === 1 ? 'orden' : 'órdenes'} · {programaciones.length}{' '}
          {programaciones.length === 1 ? 'ítem' : 'ítems'}
          {compromisos.length > 0 ? ` · ${compromisos.length} por programar` : ''}
        </span>
      </header>
      {programaciones.length === 0 && compromisos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin programaciones para este día.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {compromisos.map((compromiso) => (
            <TarjetaCompromisoPlaneacion
              key={compromiso.partidaId}
              compromiso={compromiso}
              onProgramar={props.onProgramarCompromiso}
            />
          ))}
          {grupos.map((items) => (
            <TarjetaOrdenConContexto
              key={items[0].ordenId}
              programaciones={items}
              props={propsDia}
              compacta={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Vista semanal: una columna por día, con zona de soltado para arrastrar. */
export function VistaSemana(props: PropsVistaCalendario) {
  const porFecha = agruparPorFecha(props.programaciones);
  const compromisosPorFecha = agruparCompromisosPorFecha(props.compromisos ?? []);

  return (
    <div className="overflow-x-auto pb-1 xl:overflow-visible">
      <div data-testid="vista-semana" className="grid min-w-[60rem] grid-cols-7 gap-2">
      {props.fechas.map((fecha) => {
        const programaciones = porFecha.get(fecha) ?? [];
        const grupos = agruparPorOrden(programaciones);
        const compromisos = compromisosPorFecha.get(fecha) ?? [];
        return (
          <section
            key={fecha}
            data-testid={`columna-${fecha}`}
            aria-label={`Día ${fecha}`}
            onDragOver={(evento) => {
              if (props.onSolicitarReprogramacion) evento.preventDefault();
            }}
            onDrop={(evento) => {
              evento.preventDefault();
              soltarEnFecha(evento, fecha, props);
            }}
            className="flex min-h-24 flex-col gap-2 rounded-base border border-borde bg-superficie-2 p-2"
          >
            <header className="flex flex-col">
              <span className="text-xs font-medium">{etiquetaDia(fecha)}</span>
              <span className="font-mono text-[11px] text-texto-secundario">{fecha}</span>
            </header>
            {compromisos.map((compromiso) => (
              <TarjetaCompromisoPlaneacion
                key={compromiso.partidaId}
                compromiso={compromiso}
                compacta
                onProgramar={props.onProgramarCompromiso}
              />
            ))}
            {programaciones.length === 0 && compromisos.length === 0 ? (
              <p className="text-[11px] text-texto-secundario">Sin programaciones</p>
            ) : (
              grupos.map((items) => (
                <TarjetaOrdenConContexto
                  key={items[0].ordenId}
                  programaciones={items}
                  props={props}
                  compacta
                />
              ))
            )}
          </section>
        );
      })}
      </div>
    </div>
  );
}

/** Vista mensual: rejilla de semanas con las programaciones del rango. */
export function VistaMes(props: PropsVistaCalendario) {
  const porFecha = agruparPorFecha(props.programaciones);
  const compromisosPorFecha = agruparCompromisosPorFecha(props.compromisos ?? []);
  const celdas = construirCeldasMes(props.fechaInicio, props.fechaFin);

  return (
    <div
      data-testid="vista-mes"
      className="grid grid-cols-7 gap-1 rounded-base border border-borde p-2"
    >
      {celdas.map(({ fecha, enRango }) => {
        const programaciones = enRango ? (porFecha.get(fecha) ?? []) : [];
        const grupos = agruparPorOrden(programaciones);
        const compromisos = enRango ? (compromisosPorFecha.get(fecha) ?? []) : [];
        return (
          <section
            key={fecha}
            data-testid={`celda-${fecha}`}
            aria-label={`Día ${fecha}`}
            onDragOver={(evento) => {
              if (enRango && props.onSolicitarReprogramacion) evento.preventDefault();
            }}
            onDrop={(evento) => {
              if (!enRango) return;
              evento.preventDefault();
              soltarEnFecha(evento, fecha, props);
            }}
            className={
              enRango
                ? 'flex min-h-24 flex-col gap-1 rounded-base border border-borde bg-superficie p-1'
                : 'flex min-h-24 flex-col gap-1 rounded-base border border-transparent p-1 text-texto-secundario opacity-50'
            }
          >
            <header className="flex items-center justify-between">
              <span className="text-[11px] font-medium">{fecha.slice(8, 10)}</span>
              {enRango && props.onAbrirDia ? (
                <button
                  type="button"
                  className="text-[11px] text-acento underline"
                  onClick={() => props.onAbrirDia?.(fecha)}
                >
                  Ver día
                </button>
              ) : null}
            </header>
            {programaciones.length > 0 ? (
              <>
                <span className="text-[11px] text-texto-secundario">
                  {grupos.length} {grupos.length === 1 ? 'orden' : 'órdenes'} ·{' '}
                  {programaciones.length} ítems
                </span>
                {grupos.map((items) => (
                  <TarjetaOrdenConContexto
                    key={items[0].ordenId}
                    programaciones={items}
                    props={props}
                    compacta
                  />
                ))}
              </>
            ) : null}
            {compromisos.length > 0 ? (
              <>
                <span className="text-[11px] font-medium text-acento">
                  {compromisos.length} por programar
                </span>
                {compromisos.map((compromiso) => (
                  <TarjetaCompromisoPlaneacion
                    key={compromiso.partidaId}
                    compromiso={compromiso}
                    compacta
                    onProgramar={props.onProgramarCompromiso}
                  />
                ))}
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
