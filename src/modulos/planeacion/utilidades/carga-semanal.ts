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
 * calcula con equipos × jornada del día (C24: una fila por equipo y día, con la
 * etiqueta «jornada»), no de un calendario laboral fijo ni de los turnos.
 *
 * C18: con el horario de la empresa el sábado es día laboral (4 h), así que su
 * columna se muestra siempre que tenga capacidad; el domingo sigue cerrado y
 * solo aparece si por excepción tiene trabajo programado *o tiempo real
 * registrado* (un equipo liberado en un día sin jornada conserva sus horas).
 * Ocultar el sábado hacía que «Libre» omitiera 4 h de capacidad real y variara
 * según si otro equipo tenía carga ese día.
 */

/** Horas legibles sin ceros decorativos: `16`, `7.5`, `2.75`. */
export function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return String(Math.round(valor * 100) / 100);
}

/** Numerador del chip: al menos un decimal para que `0` se lea como `0.0`. */
export function formatearHorasChip(valor: number): string {
  const texto = formatearHoras(valor);
  return texto.includes('.') ? texto : `${texto}.0`;
}

export interface CeldaCargaSemanal {
  fecha: string;
  horasCapacidad: number;
  horasProgramadas: number;
  /** Pendiente más tiempo ya trabajado: lo que el chip muestra sobre la capacidad. */
  horasOcupadas: number;
  /**
   * Suma por turno de `max(0, capacidad − pendientes − reales)`; la sobrecarga
   * no resta. Las horas ya trabajadas consumieron la jornada aunque el pendiente
   * de la programación haya bajado, así que también descuentan.
   */
  horasLibres: number;
  /**
   * Tiempo real registrado ese día. Descuenta del saldo libre: un equipo con
   * 4 h ya trabajadas no puede ofrecer la jornada completa otra vez.
   */
  horasReales: number;
  /** Peor semáforo de los turnos del día. */
  nivel: NivelSemaforo;
}

export interface FilaCargaSemanal {
  recursoId: string;
  codigo: string;
  nombre: string;
  /** C24: el recurso no tiene capacidad configurada en el rango consultado. */
  sinCapacidad: boolean;
  /** Una celda por columna; `null` cuando ese día no tiene fila de capacidad. */
  celdas: (CeldaCargaSemanal | null)[];
  horasLibresTotales: number;
}

export interface MatrizCargaSemanal {
  /** Fechas reales del rango visibles: lun–vie siempre; sáb/dom sólo con capacidad, carga o trabajo real. */
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
  const fechasConCapacidad = new Set(
    cargasVisibles
      .filter(
        (carga) => carga.horasCapacidad > 0
          || carga.horasProgramadas > 0
          || carga.horasReales > 0,
      )
      .map((carga) => carga.fechaProgramada),
  );
  // La RPC devuelve todos los días del rango, incluido fin de semana con
  // capacidad configurada; sábado se pinta si hay capacidad (día laboral) y
  // domingo solo si tiene carga o tiempo real, para no ocultar el trabajo hecho
  // en un día sin jornada.
  const hayDiaHabil = dias.some((fecha) => !esFinDeSemana(fecha));
  const columnas = dias.filter(
    (fecha) => !esFinDeSemana(fecha) || !hayDiaHabil || fechasConCapacidad.has(fecha),
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
        sinCapacidad: true,
        celdas: columnas.map(() => null),
        horasLibresTotales: 0,
      };
    }

    const celdas = columnas.map((fecha): CeldaCargaSemanal | null => {
      const delDia = cargasRecurso.filter((carga) => carga.fechaProgramada === fecha);
      if (delDia.length === 0) return null;
      let horasCapacidad = 0;
      let horasProgramadas = 0;
      let horasReales = 0;
      let horasLibres = 0;
      let nivel: NivelSemaforo = 'disponible';
      for (const carga of delDia) {
        horasCapacidad += carga.horasCapacidad;
        horasProgramadas += carga.horasProgramadas;
        horasReales += carga.horasReales;
        horasLibres += Math.max(0, carga.horasCapacidad - carga.horasProgramadas - carga.horasReales);
        const ocupadasDelTurno = carga.horasProgramadas + carga.horasReales;
        nivel = nivelSemaforoMasGrave(
          nivel,
          nivelSemaforo(clasificarSaturacion(carga.horasCapacidad, ocupadasDelTurno)),
        );
      }
      return {
        fecha,
        horasCapacidad: redondearHoras(horasCapacidad),
        horasProgramadas: redondearHoras(horasProgramadas),
        horasOcupadas: redondearHoras(horasProgramadas + horasReales),
        horasLibres: redondearHoras(horasLibres),
        horasReales: redondearHoras(horasReales),
        nivel,
      };
    });

    return {
      recursoId: recurso.id,
      codigo: recurso.codigo,
      nombre: recurso.nombre,
      sinCapacidad: false,
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
