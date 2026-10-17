import { clasificarSaturacion } from '@/modulos/planeacion/servicios/capacidad-servicio';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  diasEntre,
  esFinDeSemana,
  type RangoFechas,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  nivelSemaforo,
  nivelSemaforoMasGrave,
  type NivelSemaforo,
} from '@/modulos/planeacion/utilidades/etiquetas';

/**
 * C9.1/P-01: matriz semanal Equipo × días para responder «¿cuántas horas tiene
 * ocupadas cada equipo y cuánto queda?». Se deriva de las cargas que PostgreSQL
 * calcula desde `capacidades_recurso_turno` (equipos × jornada), no de un
 * calendario laboral fijo: un sábado o domingo sólo aparece cuando tiene horas
 * programadas.
 */

/** Horas legibles sin ceros decorativos: `16`, `7.5`, `2.75`. */
export function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return String(Math.round(valor * 100) / 100);
}

export interface CeldaCargaSemanal {
  fecha: string;
  horasCapacidad: number;
  horasProgramadas: number;
  /** Suma por turno de `max(0, capacidad − programadas)`; la sobrecarga no resta. */
  horasLibres: number;
  /** Peor semáforo de los turnos del día. */
  nivel: NivelSemaforo;
}

export interface FilaCargaSemanal {
  recursoId: string;
  codigo: string;
  nombre: string;
  /** El recurso no tiene ningún turno configurado en el rango consultado. */
  sinTurnos: boolean;
  /** Una celda por columna; `null` cuando ese día no tiene turno para el recurso. */
  celdas: (CeldaCargaSemanal | null)[];
  horasLibresTotales: number;
}

export interface MatrizCargaSemanal {
  /** Fechas reales del rango visibles: lun–vie siempre; sáb/dom sólo con carga. */
  columnas: string[];
  filas: FilaCargaSemanal[];
}

/**
 * Construye la matriz de la semana. Devuelve `null` cuando el rango no cabe en
 * la tabla (más de 7 días, como la vista Mensual): el componente degrada a un
 * aviso en lugar de mentir con una matriz parcial.
 */
export function construirMatrizCargaSemanal(
  cargas: readonly CargaCapacidadDiaria[],
  recursos: readonly RecursoPlaneacion[],
  rango: RangoFechas,
  filtroRecursoId: string | null = null,
): MatrizCargaSemanal | null {
  const dias = diasEntre(rango.fechaInicio, rango.fechaFin);
  if (dias.length === 0 || dias.length > 7) return null;

  const recursosVisibles = recursos.filter(
    (recurso) => filtroRecursoId === null || recurso.id === filtroRecursoId,
  );
  const cargasVisibles = cargas.filter(
    (carga) => filtroRecursoId === null || carga.recursoId === filtroRecursoId,
  );
  const fechasConProgramacion = new Set(
    cargasVisibles
      .filter((carga) => carga.horasProgramadas > 0)
      .map((carga) => carga.fechaProgramada),
  );
  // La RPC devuelve todos los días del rango, incluido fin de semana con
  // capacidad configurada; una columna sáb/dom sólo se pinta si tiene carga.
  const hayDiaHabil = dias.some((fecha) => !esFinDeSemana(fecha));
  const columnas = dias.filter(
    (fecha) => !esFinDeSemana(fecha) || !hayDiaHabil || fechasConProgramacion.has(fecha),
  );

  const porRecurso = new Map<string, CargaCapacidadDiaria[]>();
  for (const carga of cargasVisibles) {
    const lista = porRecurso.get(carga.recursoId);
    if (lista) lista.push(carga);
    else porRecurso.set(carga.recursoId, [carga]);
  }

  const filas = recursosVisibles.map((recurso): FilaCargaSemanal => {
    const cargasRecurso = porRecurso.get(recurso.id) ?? [];
    if (cargasRecurso.length === 0) {
      return {
        recursoId: recurso.id,
        codigo: recurso.codigo,
        nombre: recurso.nombre,
        sinTurnos: true,
        celdas: columnas.map(() => null),
        horasLibresTotales: 0,
      };
    }

    const celdas = columnas.map((fecha): CeldaCargaSemanal | null => {
      const delDia = cargasRecurso.filter((carga) => carga.fechaProgramada === fecha);
      if (delDia.length === 0) return null;
      let horasCapacidad = 0;
      let horasProgramadas = 0;
      let horasLibres = 0;
      let nivel: NivelSemaforo = 'disponible';
      for (const carga of delDia) {
        horasCapacidad += carga.horasCapacidad;
        horasProgramadas += carga.horasProgramadas;
        horasLibres += Math.max(0, carga.horasCapacidad - carga.horasProgramadas);
        nivel = nivelSemaforoMasGrave(
          nivel,
          nivelSemaforo(clasificarSaturacion(carga.horasCapacidad, carga.horasProgramadas)),
        );
      }
      return {
        fecha,
        horasCapacidad: redondearHoras(horasCapacidad),
        horasProgramadas: redondearHoras(horasProgramadas),
        horasLibres: redondearHoras(horasLibres),
        nivel,
      };
    });

    return {
      recursoId: recurso.id,
      codigo: recurso.codigo,
      nombre: recurso.nombre,
      sinTurnos: false,
      celdas,
      horasLibresTotales: redondearHoras(
        celdas.reduce((total, celda) => total + (celda?.horasLibres ?? 0), 0),
      ),
    };
  });

  return { columnas, filas };
}

/** Redondeo estable a 2 decimales; `-0` se normaliza. */
function redondearHoras(valor: number): number {
  const redondeado = Math.round(valor * 100) / 100;
  return redondeado === 0 ? 0 : redondeado;
}
