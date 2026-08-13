'use client';

import { useEffect, useState } from 'react';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import {
  AREAS_PLANEACION,
  ESTADOS_PLANEACION,
  TURNOS_PLANEACION,
  type AreaPlaneacion,
  type EstadoPlaneacion,
  type ProgramacionArea,
  type TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

/** Filtros de lectura serializables que se env\u00edan a la Server Action. */
export interface FiltrosConsultaCalendario {
  fechaInicio: string;
  fechaFin: string;
  recursoId?: string;
  estados?: readonly EstadoPlaneacion[];
}

export interface PropsCalendarioPlaneacion {
  /** Proyecci\u00f3n confirmada del calendario para los filtros actuales. */
  datos: DatosCalendarioPlaneacion;
  rangoInicial: { fechaInicio: string; fechaFin: string };
  actualizando: boolean;
  errorActualizacion: boolean;
  onSeleccionarProgramacion?: (programacion: ProgramacionArea | null) => void;
}

const ETIQUETA_AREA: Record<AreaPlaneacion, string> = {
  sheet_metal: 'Sheet metal',
  taller: 'Taller',
  acabados: 'Acabados',
  ext: 'Proveedor externo',
};

const ETIQUETA_TURNO: Record<TurnoPlaneacion, string> = {
  matutino: 'Matutino',
  vespertino: 'Vespertino',
  nocturno: 'Nocturno',
};

const ETIQUETA_ESTADO: Record<EstadoPlaneacion, string> = {
  programada: 'Programada',
  en_preparacion: 'En preparaci\u00f3n',
  en_proceso: 'En proceso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

const VARIANTE_ESTADO: Record<
  EstadoPlaneacion,
  'neutro' | 'alerta' | 'exito' | 'info'
> = {
  programada: 'neutro',
  en_preparacion: 'info',
  en_proceso: 'info',
  bloqueada: 'alerta',
  completada: 'exito',
  cancelada: 'neutro',
};

function ordenarProgramaciones(
  programaciones: readonly ProgramacionArea[],
): ProgramacionArea[] {
  return [...programaciones].sort((a, b) => {
    if (a.fechaProgramada !== b.fechaProgramada) {
      return a.fechaProgramada < b.fechaProgramada ? -1 : 1;
    }
    if (a.turno !== b.turno) {
      return TURNOS_PLANEACION.indexOf(a.turno) - TURNOS_PLANEACION.indexOf(b.turno);
    }
    return a.ordenPrioridad - b.ordenPrioridad;
  });
}

function claveCarga(recursoId: string, fecha: string, turno: TurnoPlaneacion): string {
  return `${recursoId}:${fecha}:${turno}`;
}

/**
 * Calendario operativo por fecha y turno. TanStack Query conserva los datos de
 * servidor; Zustand se limita a filtros y selecci\u00f3n, por lo que ninguna copia
 * mutable puede competir con la decisi\u00f3n transaccional de PostgreSQL.
 */
export function CalendarioPlaneacion({
  datos,
  rangoInicial,
  actualizando,
  errorActualizacion,
  onSeleccionarProgramacion,
}: PropsCalendarioPlaneacion) {
  const rango = usarTiendaPlaneacion((estado) => estado.rango);
  const area = usarTiendaPlaneacion((estado) => estado.area);
  const recursoId = usarTiendaPlaneacion((estado) => estado.recursoId);
  const turnos = usarTiendaPlaneacion((estado) => estado.turnos);
  const estados = usarTiendaPlaneacion((estado) => estado.estados);
  const programacionSeleccionadaId = usarTiendaPlaneacion(
    (estado) => estado.programacionSeleccionadaId,
  );
  const establecerRango = usarTiendaPlaneacion((estado) => estado.establecerRango);
  const establecerArea = usarTiendaPlaneacion((estado) => estado.establecerArea);
  const establecerRecurso = usarTiendaPlaneacion((estado) => estado.establecerRecurso);
  const alternarTurno = usarTiendaPlaneacion((estado) => estado.alternarTurno);
  const establecerEstados = usarTiendaPlaneacion((estado) => estado.establecerEstados);
  const seleccionarProgramacion = usarTiendaPlaneacion(
    (estado) => estado.seleccionarProgramacion,
  );
  const limpiarFiltros = usarTiendaPlaneacion((estado) => estado.limpiarFiltros);
  const rangoEfectivo = rango ?? rangoInicial;
  const [fechaInicio, setFechaInicio] = useState(rangoEfectivo.fechaInicio);
  const [fechaFin, setFechaFin] = useState(rangoEfectivo.fechaFin);

  const recursosPorId = new Map(datos.recursos.map((recurso) => [recurso.id, recurso]));
  const cargasPorClave = new Map(
    datos.cargas.map((carga) => [
      claveCarga(carga.recursoId, carga.fechaProgramada, carga.turno),
      carga,
    ]),
  );
  const visibles = ordenarProgramaciones(
    datos.programaciones.filter((programacion) => {
      if (turnos.length > 0 && !turnos.includes(programacion.turno)) return false;
      if (recursoId !== null && programacion.recursoId !== recursoId) return false;
      return area === null || recursosPorId.get(programacion.recursoId)?.area === area;
    }),
  );

  useEffect(() => {
    if (programacionSeleccionadaId === null) return;
    const programacionActual = datos.programaciones.find(
      (programacion) => programacion.id === programacionSeleccionadaId,
    );
    if (!programacionActual) {
      seleccionarProgramacion(null);
      onSeleccionarProgramacion?.(null);
      return;
    }
    onSeleccionarProgramacion?.(programacionActual);
  }, [
    datos.programaciones,
    onSeleccionarProgramacion,
    programacionSeleccionadaId,
    seleccionarProgramacion,
  ]);

  function aplicarRango(): void {
    establecerRango(fechaInicio, fechaFin);
  }

  function restablecerFiltros(): void {
    setFechaInicio(rangoInicial.fechaInicio);
    setFechaFin(rangoInicial.fechaFin);
    limpiarFiltros();
  }

  function alSeleccionar(programacion: ProgramacionArea): void {
    seleccionarProgramacion(programacion.id);
    onSeleccionarProgramacion?.(programacion);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-calendario-planeacion">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="titulo-calendario-planeacion" className="text-sm font-medium">
          Calendario de Planeaci\u00f3n
        </h2>
        <p className="text-xs text-foreground/60" aria-live="polite">
          {errorActualizacion
            ? 'No se pudo actualizar el calendario'
            : actualizando
              ? 'Actualizando…'
              : `${visibles.length} programaciones · ${rangoEfectivo.fechaInicio} a ${rangoEfectivo.fechaFin}`}
        </p>
      </div>

      <div className="grid gap-3 rounded-base border border-foreground/10 p-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          Fecha inicial
          <Input
            type="date"
            value={fechaInicio}
            onChange={(evento) => setFechaInicio(evento.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Fecha final
          <Input
            type="date"
            value={fechaFin}
            onChange={(evento) => setFechaFin(evento.target.value)}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="button" variante="contorno" onClick={aplicarRango}>
            Aplicar rango
          </Button>
          <Button type="button" variante="fantasma" onClick={restablecerFiltros}>
            Limpiar filtros
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          \u00c1rea
          <Select
            value={area ?? ''}
            onChange={(evento) => establecerArea((evento.target.value || null) as AreaPlaneacion | null)}
          >
            <option value="">Todas las \u00e1reas</option>
            {AREAS_PLANEACION.map((valor) => (
              <option key={valor} value={valor}>{ETIQUETA_AREA[valor]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Recurso
          <Select
            value={recursoId ?? ''}
            onChange={(evento) => establecerRecurso(evento.target.value || null)}
          >
            <option value="">Todos los recursos</option>
            {datos.recursos
              .filter((recurso) => area === null || recurso.area === area)
              .map((recurso) => (
                <option key={recurso.id} value={recurso.id}>
                  {recurso.codigo} · {recurso.nombre}
                </option>
              ))}
          </Select>
        </label>
        <fieldset className="flex flex-wrap gap-2 text-xs">
          <legend className="mb-1">Turnos</legend>
          {TURNOS_PLANEACION.map((valor) => (
            <label key={valor} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={turnos.includes(valor)}
                onChange={() => alternarTurno(valor)}
              />
              {ETIQUETA_TURNO[valor]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-2 text-xs md:col-span-3">
          <legend className="mb-1">Estados</legend>
          {ESTADOS_PLANEACION.map((valor) => (
            <label key={valor} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={estados.includes(valor)}
                onChange={() => {
                  establecerEstados(
                    estados.includes(valor)
                      ? estados.filter((estado) => estado !== valor)
                      : [...estados, valor],
                  );
                }}
              />
              {ETIQUETA_ESTADO[valor]}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="overflow-x-auto rounded-base border border-foreground/10">
        <table className="w-full text-left text-sm" aria-busy={actualizando}>
          <caption className="sr-only">
            Programaciones por fecha, turno y recurso en el rango seleccionado
          </caption>
          <thead className="border-b border-foreground/10 bg-foreground/5 text-xs uppercase text-foreground/60">
            <tr>
              <th scope="col" className="px-3 py-2">Fecha</th>
              <th scope="col" className="px-3 py-2">Turno</th>
              <th scope="col" className="px-3 py-2">Recurso</th>
              <th scope="col" className="px-3 py-2">Prioridad</th>
              <th scope="col" className="px-3 py-2">Horas</th>
              <th scope="col" className="px-3 py-2">Capacidad</th>
              <th scope="col" className="px-3 py-2">Estado</th>
              <th scope="col" className="px-3 py-2">Acci\u00f3n</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-foreground/60">
                  Sin programaciones para los filtros seleccionados
                </td>
              </tr>
            ) : (
              visibles.map((programacion) => {
                const recurso = recursosPorId.get(programacion.recursoId);
                const carga = cargasPorClave.get(
                  claveCarga(programacion.recursoId, programacion.fechaProgramada, programacion.turno),
                );
                const seleccionada = programacion.id === programacionSeleccionadaId;
                return (
                  <tr
                    key={programacion.id}
                    aria-selected={seleccionada}
                    className={
                      seleccionada
                        ? 'border-b border-foreground/10 bg-foreground/5'
                        : 'border-b border-foreground/10'
                    }
                  >
                    <th scope="row" className="px-3 py-2 font-normal">{programacion.fechaProgramada}</th>
                    <td className="px-3 py-2">{ETIQUETA_TURNO[programacion.turno]}</td>
                    <td className="px-3 py-2">
                      {recurso ? `${recurso.codigo} · ${recurso.nombre}` : programacion.recursoId}
                    </td>
                    <td className="px-3 py-2">{programacion.ordenPrioridad}</td>
                    <td className="px-3 py-2">{programacion.horasEstimadas}</td>
                    <td className="px-3 py-2">
                      {carga
                        ? `${carga.horasProgramadas}/${carga.horasCapacidad} h (${carga.horasDisponibles} libres)`
                        : 'Sin capacidad'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variante={VARIANTE_ESTADO[programacion.estadoPlaneacion]}>
                        {ETIQUETA_ESTADO[programacion.estadoPlaneacion]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variante="contorno"
                        tamano="sm"
                        onClick={() => alSeleccionar(programacion)}
                      >
                        Seleccionar
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
