'use client';

import { useEffect, useMemo, useState } from 'react';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import {
  AREAS_PLANEACION,
  ESTADOS_PLANEACION,
  TURNOS_PLANEACION,
  type AreaPlaneacion,
  type DesglosePartidaPlaneacion,
  type EstadoPlaneacion,
  type ProgramacionArea,
  type TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  VistaDia,
  VistaMes,
  VistaSemana,
  type PropsVistaCalendario,
} from '@/modulos/planeacion/componentes/vistas-calendario-planeacion';
import {
  VISTAS_PLANEACION,
  diasEntre,
  etiquetaMes,
  etiquetaRango,
  hoyIso,
  navegarRango,
  rangoVista,
  type RangoFechas,
  type VistaPlaneacion,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  ETIQUETA_AREA,
  ETIQUETA_ESTADO,
  ETIQUETA_TURNO,
} from '@/modulos/planeacion/utilidades/etiquetas';

/** Filtros de lectura serializables que se envían a la Server Action. */
export interface FiltrosConsultaCalendario {
  fechaInicio: string;
  fechaFin: string;
  recursoId?: string;
  estados?: readonly EstadoPlaneacion[];
}

export interface PropsCalendarioPlaneacion {
  /** Proyección confirmada del calendario para los filtros actuales. */
  datos: DatosCalendarioPlaneacion;
  rangoInicial: { fechaInicio: string; fechaFin: string };
  actualizando: boolean;
  errorActualizacion: boolean;
  /** Desglose de las partidas visibles (OBS-08); si falta, se declara "Por definir". */
  desglosePartidas?: readonly DesglosePartidaPlaneacion[];
  onSeleccionarProgramacion?: (programacion: ProgramacionArea | null) => void;
  /** Solicita confirmar una reprogramación por arrastre; nunca muta por sí sola. */
  onSolicitarReprogramacion?: (programacion: ProgramacionArea, fechaDestino: string) => void;
}

const ETIQUETA_VISTA: Record<VistaPlaneacion, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
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
 * Calendario operativo por fecha y turno con vistas de día, semana y mes.
 * TanStack Query conserva los datos de servidor; Zustand se limita a filtros y
 * selección, por lo que ninguna copia mutable puede competir con la decisión
 * transaccional de PostgreSQL. El arrastre solo abre una confirmación.
 */
export function CalendarioPlaneacion({
  datos,
  rangoInicial,
  actualizando,
  errorActualizacion,
  desglosePartidas = [],
  onSeleccionarProgramacion,
  onSolicitarReprogramacion,
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
  const [vista, setVista] = useState<VistaPlaneacion>('semana');

  const recursosPorId = useMemo(
    () => new Map(datos.recursos.map((recurso) => [recurso.id, recurso])),
    [datos.recursos],
  );
  const cargasPorClave = useMemo(
    () =>
      new Map(
        datos.cargas.map((carga) => [
          claveCarga(carga.recursoId, carga.fechaProgramada, carga.turno),
          carga,
        ]),
      ),
    [datos.cargas],
  );
  const desglosePorPartidaId = useMemo(
    () => new Map(desglosePartidas.map((desglose) => [desglose.partidaId, desglose])),
    [desglosePartidas],
  );
  const visibles = useMemo(
    () =>
      ordenarProgramaciones(
        datos.programaciones.filter((programacion) => {
          if (turnos.length > 0 && !turnos.includes(programacion.turno)) return false;
          if (recursoId !== null && programacion.recursoId !== recursoId) return false;
          return area === null || recursosPorId.get(programacion.recursoId)?.area === area;
        }),
      ),
    [area, datos.programaciones, recursoId, recursosPorId, turnos],
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

  const fechas = diasEntre(rangoEfectivo.fechaInicio, rangoEfectivo.fechaFin);

  function aplicarRangoNuevo(nuevo: RangoFechas): void {
    setFechaInicio(nuevo.fechaInicio);
    setFechaFin(nuevo.fechaFin);
    establecerRango(nuevo.fechaInicio, nuevo.fechaFin);
  }

  function aplicarRango(): void {
    establecerRango(fechaInicio, fechaFin);
  }

  function cambiarVista(nueva: VistaPlaneacion): void {
    setVista(nueva);
    aplicarRangoNuevo(rangoVista(nueva, rangoEfectivo.fechaInicio));
  }

  function navegar(direccion: -1 | 1): void {
    aplicarRangoNuevo(navegarRango(vista, rangoEfectivo, direccion));
  }

  function irHoy(): void {
    aplicarRangoNuevo(rangoVista(vista, hoyIso()));
  }

  function abrirDia(fecha: string): void {
    setVista('dia');
    aplicarRangoNuevo({ fechaInicio: fecha, fechaFin: fecha });
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

  const propsVista: PropsVistaCalendario = {
    fechas,
    fechaInicio: rangoEfectivo.fechaInicio,
    fechaFin: rangoEfectivo.fechaFin,
    programaciones: visibles,
    recursosPorId,
    desglosePorPartidaId,
    cargasPorClave,
    programacionSeleccionadaId,
    onSeleccionarProgramacion: alSeleccionar,
    onSolicitarReprogramacion,
    onAbrirDia: abrirDia,
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-calendario-planeacion">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="titulo-calendario-planeacion" className="text-sm font-medium">
          Calendario de Planeación
        </h2>
        <p className="text-xs text-texto-secundario" aria-live="polite">
          {errorActualizacion
            ? 'No se pudo actualizar el calendario'
            : actualizando
              ? 'Actualizando…'
              : `${visibles.length} programaciones · ${rangoEfectivo.fechaInicio} a ${rangoEfectivo.fechaFin}`}
        </p>
      </div>

      <div className="grid gap-3 rounded-base border border-borde p-3 md:grid-cols-3">
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
          Área
          <Select
            value={area ?? ''}
            onChange={(evento) => establecerArea((evento.target.value || null) as AreaPlaneacion | null)}
          >
            <option value="">Todas las áreas</option>
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

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Navegación del calendario">
        <div className="flex gap-1" role="group" aria-label="Vista del calendario">
          {VISTAS_PLANEACION.map((valor) => (
            <Button
              key={valor}
              type="button"
              tamano="sm"
              variante={vista === valor ? 'secundario' : 'contorno'}
              aria-pressed={vista === valor}
              onClick={() => cambiarVista(valor)}
              data-testid={`vista-planeacion-${valor}`}
            >
              {ETIQUETA_VISTA[valor]}
            </Button>
          ))}
        </div>
        <Button type="button" tamano="sm" variante="contorno" onClick={() => navegar(-1)}>
          Anterior
        </Button>
        <Button type="button" tamano="sm" variante="contorno" onClick={irHoy}>
          Hoy
        </Button>
        <Button type="button" tamano="sm" variante="contorno" onClick={() => navegar(1)}>
          Siguiente
        </Button>
        <span className="text-xs text-texto-secundario">
          {vista === 'mes'
            ? etiquetaMes(rangoEfectivo.fechaInicio)
            : etiquetaRango(rangoEfectivo)}
        </span>
      </div>

      <div aria-busy={actualizando}>
        {vista === 'dia' ? (
          <VistaDia {...propsVista} fecha={rangoEfectivo.fechaInicio} />
        ) : vista === 'semana' ? (
          <VistaSemana {...propsVista} />
        ) : (
          <VistaMes {...propsVista} />
        )}
      </div>
    </section>
  );
}
