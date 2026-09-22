'use client';

import type { DragEvent } from 'react';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  construirCeldasMes,
  etiquetaDia,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  TarjetaProgramacionPlaneacion,
  TIPO_ARRASTRE_PROGRAMACION,
} from '@/modulos/planeacion/componentes/tarjeta-programacion-planeacion';

/** Contrato común de las tres vistas del calendario de Planeación. */
export interface PropsVistaCalendario {
  fechas: readonly string[];
  fechaInicio: string;
  fechaFin: string;
  programaciones: readonly ProgramacionArea[];
  recursosPorId: ReadonlyMap<string, RecursoPlaneacion>;
  desglosePorPartidaId: ReadonlyMap<string, DesglosePartidaPlaneacion>;
  cargasPorClave: ReadonlyMap<string, CargaCapacidadDiaria>;
  programacionSeleccionadaId: string | null;
  onSeleccionarProgramacion: (programacion: ProgramacionArea) => void;
  onSolicitarReprogramacion?: (programacion: ProgramacionArea, fechaDestino: string) => void;
  onAbrirDia?: (fecha: string) => void;
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

function TarjetaConContexto({
  programacion,
  props,
  compacta,
}: {
  programacion: ProgramacionArea;
  props: PropsVistaCalendario;
  compacta: boolean;
}) {
  return (
    <TarjetaProgramacionPlaneacion
      programacion={programacion}
      recurso={props.recursosPorId.get(programacion.recursoId)}
      desglose={props.desglosePorPartidaId.get(programacion.partidaId)}
      carga={props.cargasPorClave.get(
        `${programacion.recursoId}:${programacion.fechaProgramada}:${programacion.turno}`,
      )}
      seleccionada={programacion.id === props.programacionSeleccionadaId}
      compacta={compacta}
      arrastrable={props.onSolicitarReprogramacion !== undefined}
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
          {programaciones.length} programaciones
        </span>
      </header>
      {programaciones.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin programaciones para este día.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {programaciones.map((programacion) => (
            <TarjetaConContexto
              key={programacion.id}
              programacion={programacion}
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

  return (
    <div data-testid="vista-semana" className="grid gap-3 md:grid-cols-7">
      {props.fechas.map((fecha) => {
        const programaciones = porFecha.get(fecha) ?? [];
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
            className="flex min-h-32 flex-col gap-2 rounded-base border border-borde bg-superficie-2 p-2"
          >
            <header className="flex flex-col">
              <span className="text-xs font-medium">{etiquetaDia(fecha)}</span>
              <span className="font-mono text-[11px] text-texto-secundario">{fecha}</span>
            </header>
            {programaciones.length === 0 ? (
              <p className="text-[11px] text-texto-secundario">Sin programaciones</p>
            ) : (
              programaciones.map((programacion) => (
                <TarjetaConContexto
                  key={programacion.id}
                  programacion={programacion}
                  props={props}
                  compacta={false}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Vista mensual: rejilla de semanas con las programaciones del rango. */
export function VistaMes(props: PropsVistaCalendario) {
  const porFecha = agruparPorFecha(props.programaciones);
  const celdas = construirCeldasMes(props.fechaInicio, props.fechaFin);

  return (
    <div
      data-testid="vista-mes"
      className="grid grid-cols-7 gap-1 rounded-base border border-borde p-2"
    >
      {celdas.map(({ fecha, enRango }) => {
        const programaciones = enRango ? (porFecha.get(fecha) ?? []) : [];
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
                  {programaciones.length} prog.
                </span>
                {programaciones.map((programacion) => (
                  <TarjetaConContexto
                    key={programacion.id}
                    programacion={programacion}
                    props={props}
                    compacta
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
