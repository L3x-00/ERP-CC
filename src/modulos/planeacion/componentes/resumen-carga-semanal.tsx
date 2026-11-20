'use client';

import { useId } from 'react';

import { cn } from '@/compartido/utilidades/cn';
import { InsigniaSaturacion } from '@/modulos/planeacion/componentes/insignia-saturacion';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  construirMatrizCargaSemanal,
  formatearHoras,
} from '@/modulos/planeacion/utilidades/carga-semanal';
import {
  etiquetaDia,
  type RangoFechas,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';

export interface PropsResumenCargaSemanal {
  cargas: readonly CargaCapacidadDiaria[];
  recursos: readonly RecursoPlaneacion[];
  rango: RangoFechas;
  /** Filtro de recurso del calendario; área y turno no aplican a la matriz. */
  filtroRecursoId?: string | null;
  /**
   * Recursos con una sesión en marcha. El piso los marca como «En uso» para no
   * confundir capacidad pendiente con un equipo realmente disponible.
   */
  recursosEnUso?: ReadonlySet<string>;
  /**
   * Abre el detalle del equipo al pulsar su chip de estado. Sin este callback el
   * chip se muestra como etiqueta informativa.
   */
  onAbrirRecurso?: (recursoId: string) => void;
  /** Consulta en vuelo sin datos previos: aún no se puede declarar «sin capacidad». */
  cargando?: boolean;
  /** Título visible; el panel del operador lo adapta a día o semana. */
  titulo?: string;
  /** Texto de apoyo bajo el título. */
  descripcion?: string;
}

/**
 * C9.1/P-01: «¿cuántas horas tiene ocupadas cada equipo y cuánto queda?» —
 * tabla Equipo × días con horas pendientes/capacidad y columna de capacidad libre,
 * montada antes de los filtros del calendario.
 */
export function ResumenCargaSemanal({
  cargas,
  recursos,
  rango,
  filtroRecursoId = null,
  recursosEnUso,
  onAbrirRecurso,
  cargando = false,
  titulo = 'Carga semanal',
  descripcion = 'Horas pendientes/capacidad por equipo. Libre es la capacidad que queda después de lo pendiente y lo ya trabajado.',
}: PropsResumenCargaSemanal) {
  const idTitulo = useId();
  const matriz = construirMatrizCargaSemanal(cargas, recursos, rango, filtroRecursoId);

  return (
    <section
      data-testid="resumen-carga-semanal"
      aria-labelledby={idTitulo}
      className="flex flex-col gap-2 rounded-base border border-borde bg-superficie p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={idTitulo} className="text-sm font-medium">
          {titulo}
        </h2>
        <p className="text-xs text-texto-secundario">
          {descripcion}
        </p>
      </div>

      {cargando && cargas.length === 0 ? (
        <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
          Cargando capacidad…
        </p>
      ) : matriz === null ? (
        <p className="text-sm text-texto-secundario" data-testid="resumen-carga-semanal-aviso">
          El resumen de carga cubre un rango de hasta 7 días. Cambia a la vista Semana para verlo.
        </p>
      ) : matriz.filas.length === 0 ? (
        <p className="text-sm text-texto-secundario" data-testid="resumen-carga-semanal-vacio">
          No hay recursos activos que mostrar en el rango.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-xs">
            <caption className="sr-only">
              Capacidad pendiente por equipo y día, con la capacidad que queda libre en el rango
            </caption>
            <thead>
              <tr className="border-b border-borde text-left">
                <th scope="col" className="px-2 py-1 font-medium text-texto-secundario">
                  Equipo
                </th>
                {matriz.columnas.map((fecha) => (
                  <th key={fecha} scope="col" className="px-2 py-1 font-medium" title={fecha}>
                    {etiquetaDia(fecha)}
                  </th>
                ))}
                <th scope="col" className="px-2 py-1 font-medium text-texto-secundario">
                  Libre
                </th>
              </tr>
            </thead>
            <tbody>
              {matriz.filas.map((fila) => {
                const enUso = recursosEnUso?.has(fila.recursoId) ?? false;
                const etiquetaEstado = enUso ? 'En uso' : 'Libre';
                const clasesEstado = cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
                  enUso
                    ? 'bg-advertencia-suave text-advertencia-texto hover:bg-advertencia-suave/70'
                    : 'bg-superficie-2 text-texto-secundario hover:bg-superficie-2/70',
                );
                return (
                  <tr
                    key={fila.recursoId}
                    className="border-b border-borde/60 last:border-0"
                    data-en-uso={enUso ? 'true' : undefined}
                  >
                    <th scope="row" className="px-2 py-1 text-left font-medium">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {fila.codigo} · {fila.nombre}
                        {recursosEnUso ? (
                          onAbrirRecurso ? (
                            <button
                              type="button"
                              onClick={() => onAbrirRecurso(fila.recursoId)}
                              className={clasesEstado}
                              data-testid={`estado-${fila.codigo}`}
                              aria-haspopup="dialog"
                              title={`Ver detalle de ${fila.codigo}`}
                            >
                              {etiquetaEstado}
                            </button>
                          ) : (
                            <span className={clasesEstado} data-testid={`estado-${fila.codigo}`}>
                              {etiquetaEstado}
                            </span>
                          )
                        ) : null}
                      </span>
                    </th>
                  {fila.sinCapacidad ? (
                    <td
                      colSpan={matriz.columnas.length}
                      className="px-2 py-1 text-texto-secundario"
                    >
                      Sin capacidad configurada
                    </td>
                  ) : (
                    matriz.columnas.map((fecha, indice) => {
                      const celda = fila.celdas[indice] ?? null;
                      // Un día sin jornada conserva sus horas reales aunque no
                      // tenga capacidad ni carga: la celda lo dice sin un 0/0.
                      const soloTrabajoReal = celda !== null
                        && celda.horasCapacidad === 0
                        && celda.horasProgramadas === 0
                        && celda.horasReales > 0;
                      return (
                        <td key={fecha} className="px-2 py-1">
                          {celda ? (
                            soloTrabajoReal ? (
                              <span
                                className="font-mono text-[11px] text-texto-secundario"
                                title="Tiempo trabajado este día"
                                data-testid={`reales-${fila.codigo}-${fecha}`}
                              >
                                {formatearHoras(celda.horasReales)} h trabajadas
                              </span>
                            ) : (
                              <span className="flex flex-col items-start gap-0.5">
                                <InsigniaSaturacion
                                  variante="celda"
                                  nivel={celda.nivel}
                                  horasProgramadas={celda.horasProgramadas}
                                  horasCapacidad={celda.horasCapacidad}
                                />
                                {celda.horasReales > 0 ? (
                                  <span
                                    className="font-mono text-[10px] text-texto-tenue"
                                    data-testid={`reales-${fila.codigo}-${fecha}`}
                                  >
                                    {formatearHoras(celda.horasReales)} h trabajadas
                                  </span>
                                ) : null}
                              </span>
                            )
                          ) : (
                            <span className="text-texto-tenue">—</span>
                          )}
                        </td>
                      );
                    })
                  )}
                  <td className="px-2 py-1 font-mono" data-testid={`libre-${fila.codigo}`}>
                    {fila.sinCapacidad ? '—' : `${formatearHoras(fila.horasLibresTotales)} h`}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
