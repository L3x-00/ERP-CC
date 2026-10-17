'use client';

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
  /** Consulta en vuelo sin datos previos: aún no se puede declarar «sin turnos». */
  cargando?: boolean;
}

/**
 * C9.1/P-01: «¿cuántas horas tiene ocupadas cada equipo y cuánto queda?» —
 * tabla Equipo × días con ocupadas/capacidad y columna de capacidad libre,
 * montada antes de los filtros del calendario.
 */
export function ResumenCargaSemanal({
  cargas,
  recursos,
  rango,
  filtroRecursoId = null,
  cargando = false,
}: PropsResumenCargaSemanal) {
  const matriz = construirMatrizCargaSemanal(cargas, recursos, rango, filtroRecursoId);

  return (
    <section
      data-testid="resumen-carga-semanal"
      aria-labelledby="titulo-resumen-carga-semanal"
      className="flex flex-col gap-2 rounded-base border border-borde bg-superficie p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-resumen-carga-semanal" className="text-sm font-medium">
          Carga semanal
        </h2>
        <p className="text-xs text-texto-secundario">
          Horas ocupadas/capacidad por equipo; la columna Libre es lo que resta en el rango.
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
              Ocupación de capacidad por equipo y día, con la capacidad libre del rango
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
              {matriz.filas.map((fila) => (
                <tr key={fila.recursoId} className="border-b border-borde/60 last:border-0">
                  <th scope="row" className="px-2 py-1 text-left font-medium">
                    {fila.codigo} · {fila.nombre}
                  </th>
                  {fila.sinTurnos ? (
                    <td
                      colSpan={matriz.columnas.length}
                      className="px-2 py-1 text-texto-secundario"
                    >
                      Sin turnos definidos
                    </td>
                  ) : (
                    matriz.columnas.map((fecha, indice) => {
                      const celda = fila.celdas[indice] ?? null;
                      return (
                        <td key={fecha} className="px-2 py-1">
                          {celda ? (
                            <InsigniaSaturacion
                              variante="celda"
                              nivel={celda.nivel}
                              horasProgramadas={celda.horasProgramadas}
                              horasCapacidad={celda.horasCapacidad}
                            />
                          ) : (
                            <span className="text-texto-tenue">—</span>
                          )}
                        </td>
                      );
                    })
                  )}
                  <td className="px-2 py-1 font-mono" data-testid={`libre-${fila.codigo}`}>
                    {fila.sinTurnos ? '—' : `${formatearHoras(fila.horasLibresTotales)} h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
