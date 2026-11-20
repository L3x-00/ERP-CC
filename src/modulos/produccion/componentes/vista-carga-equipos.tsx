'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/compartido/utilidades/cn';
import { ResumenCargaSemanal } from '@/modulos/planeacion/componentes/resumen-carga-semanal';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  inicioSemana,
  sumarDias,
  type RangoFechas,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { horasJornadaDia } from '@/modulos/planeacion/utilidades/horario-laboral';
import {
  etiquetaDiaCorto,
  etiquetaDiaLargo,
} from '@/modulos/produccion/utilidades/formato-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import { equiposEnUso, OcupacionEquipos } from './ocupacion-equipos';

type ModoCarga = 'dia' | 'semana';

const MODOS: { valor: ModoCarga; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
];

export interface PropsVistaCargaEquipos {
  /** Carga por equipo y día de la semana en curso (una fila por equipo y jornada). */
  cargas: readonly CargaCapacidadDiaria[];
  recursos: readonly RecursoPlaneacion[];
  /** La lectura de capacidad falló; el resto del panel sigue operando. */
  error?: boolean;
  /** Fecha de negocio del operador; ancla la semana y el modo Día. */
  hoy: string;
  /**
   * Procesos del piso. Se usan solo para señalar qué equipos tienen una sesión
   * en marcha y con qué orden; la capacidad sigue viniendo de la matriz.
   */
  procesos?: readonly ProcesoEspacioOperador[];
}

const SIN_PROCESOS: readonly ProcesoEspacioOperador[] = [];

/**
 * Carga de equipos del panel del operador. Reutiliza la matriz Equipo × días de
 * Planeación (`ResumenCargaSemanal`) sin duplicar su lógica: aquí solo se elige
 * el rango (un día o la semana) y se explican las horas libres.
 *
 * El operador ve la carga real de los equipos —no solo la de su jornada— para
 * decidir a qué equipo reclamar y cuándo esperar; la validación definitiva de
 * capacidad sigue siendo de PostgreSQL al reclamar o mover.
 */
export function VistaCargaEquipos({
  cargas,
  recursos,
  hoy,
  error = false,
  procesos = SIN_PROCESOS,
}: PropsVistaCargaEquipos) {
  const [modo, setModo] = useState<ModoCarga>('semana');
  const [diaActivo, setDiaActivo] = useState(hoy);

  const recursosEnUso = useMemo(
    () => new Set(equiposEnUso(procesos).map((equipo) => equipo.recursoId)),
    [procesos],
  );

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, indice) => sumarDias(inicioSemana(hoy), indice)),
    [hoy],
  );
  // Si la fecha guardada quedó fuera de la semana visible (cambio de día real),
  // se vuelve a hoy en lugar de consultar un rango sin datos.
  const diaSeleccionado = dias.includes(diaActivo) ? diaActivo : hoy;

  const rango: RangoFechas = modo === 'dia'
    ? { fechaInicio: diaSeleccionado, fechaFin: diaSeleccionado }
    : { fechaInicio: dias[0], fechaFin: dias[dias.length - 1] };
  const diaCerrado = modo === 'dia' && horasJornadaDia(diaSeleccionado) === 0;

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="Carga de equipos"
      data-testid="vista-carga-equipos"
    >
      <header className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-texto-primario">Carga de equipos</h2>
          <p className="text-xs text-texto-secundario">
            Semana del {etiquetaDiaLargo(dias[0])} al {etiquetaDiaLargo(dias[dias.length - 1])}.
          </p>
        </div>

        <div
          role="group"
          aria-label="Modo de carga"
          className="inline-flex w-full rounded-lg border border-borde-fuerte p-1 sm:w-auto"
        >
          {MODOS.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={modo === valor}
              onClick={() => setModo(valor)}
              data-testid={`carga-modo-${valor}`}
              className={cn(
                'min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 sm:flex-none',
                modo === valor
                  ? 'bg-acento-hover text-white dark:bg-acento dark:text-fondo'
                  : 'text-texto-secundario hover:bg-superficie-2',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>

      <OcupacionEquipos procesos={procesos} />

      {!error && modo === 'dia' ? (
        <div
          role="group"
          aria-label="Día de la semana"
          className="grid grid-cols-4 gap-1 sm:grid-cols-7"
        >
          {dias.map((fecha) => {
            const activo = fecha === diaSeleccionado;
            const cerrado = horasJornadaDia(fecha) === 0;
            return (
              <button
                key={fecha}
                type="button"
                aria-pressed={activo}
                aria-current={fecha === hoy ? 'date' : undefined}
                onClick={() => setDiaActivo(fecha)}
                data-testid={`carga-dia-${fecha}`}
                className={cn(
                  'min-h-11 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
                  activo
                    ? 'border-acento bg-acento-suave text-acento-texto'
                    : 'border-borde text-texto-secundario hover:bg-superficie-2',
                  cerrado && !activo ? 'text-texto-tenue' : null,
                )}
              >
                {etiquetaDiaCorto(fecha)}
                {cerrado ? <span className="block text-[10px] font-normal">Cerrado</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-peligro/40 bg-peligro-suave p-4 text-sm text-peligro-texto"
          data-testid="carga-equipos-error"
        >
          No se pudo leer la carga de equipos. La terminal sigue disponible;
          recarga la página para reintentar.
        </p>
      ) : diaCerrado ? (
        <p
          className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto-secundario"
          data-testid="carga-dia-cerrado"
        >
          La empresa no labora el domingo. Elige otro día o consulta la semana completa.
        </p>
      ) : (
        <ResumenCargaSemanal
          cargas={cargas}
          recursos={recursos}
          rango={rango}
          recursosEnUso={recursosEnUso}
          titulo={modo === 'dia' ? 'Carga del día' : 'Carga semanal'}
          descripcion={modo === 'dia'
            ? `Horas pendientes/capacidad de cada equipo el ${etiquetaDiaLargo(diaSeleccionado)}. Libre descuenta lo pendiente y lo ya trabajado.`
            : 'Horas pendientes/capacidad por equipo; Libre descuenta lo pendiente y lo ya trabajado en la semana.'}
        />
      )}
    </section>
  );
}
