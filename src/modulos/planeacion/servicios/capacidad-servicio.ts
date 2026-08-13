import type { TurnoPlaneacion } from '@/modulos/planeacion/tipos/indice';

/**
 * Cálculos puros de capacidad de Planeación (Sub-fase 6.2). No consultan la BD
 * ni deciden si una programación se acepta: interpretan las horas de capacidad y
 * las horas ya programadas que devuelve PostgreSQL para presentarlas y priorizar
 * recursos.
 *
 * PostgreSQL es la ÚNICA fuente de verdad para aceptar una programación. La
 * validación de capacidad y la exclusión entre solicitudes concurrentes ocurren
 * dentro de la transacción de las RPC (`FOR UPDATE` sobre el recurso + índice
 * único parcial del candado). Un resultado favorable de este módulo es una
 * previsualización, nunca una autorización: entre el cálculo y la RPC la carga
 * pudo cambiar.
 */

/** Ocupación a partir de la cual el turno deja de considerarse holgado. */
export const UMBRAL_OCUPACION_AJUSTADA = 70;

/** Ocupación a partir de la cual el turno se considera saturado. */
export const UMBRAL_OCUPACION_SATURADA = 90;

/** Ocupación a partir de la cual la carga excede la capacidad del turno. */
export const UMBRAL_OCUPACION_SOBRECARGA = 100;

export const CLASIFICACIONES_SATURACION = [
  'libre',
  'holgado',
  'ajustado',
  'saturado',
  'sobrecargado',
] as const;

export type ClasificacionSaturacion = (typeof CLASIFICACIONES_SATURACION)[number];

/** Carga de un recurso en una fecha y turno, tal como la resume PostgreSQL. */
export interface CargaRecursoTurno {
  recursoId: string;
  fechaProgramada: string;
  turno: TurnoPlaneacion;
  horasCapacidad: number;
  horasProgramadas: number;
}

/** Carga con sus métricas derivadas; todos los números son finitos. */
export interface OcupacionRecursoTurno extends CargaRecursoTurno {
  horasDisponibles: number;
  holguraHoras: number;
  porcentajeOcupacion: number;
  clasificacion: ClasificacionSaturacion;
  sobrecargado: boolean;
}

export interface OpcionesCuellosBotella {
  /** Ocupación mínima (%) para considerar un turno cuello de botella. */
  umbralPorcentaje?: number;
  /** Máximo de resultados devueltos; sin límite si se omite. */
  limite?: number;
}

/** Holgura agregada disponible hasta una fecha de compromiso inclusiva. */
export interface HolguraHastaFecha {
  fechaCompromiso: string;
  horasCapacidad: number;
  horasProgramadas: number;
  holguraHoras: number;
  sobrecargado: boolean;
}

const DECIMALES_HORAS = 4;
const DECIMALES_PORCENTAJE = 2;

/**
 * Las horas llegan como `numeric` de Postgres y pueden convertirse a `NaN` si un
 * origen degradado envía texto vacío o `null`. Toda entrada no finita o negativa
 * se trata como 0 para que ningún cálculo propague `NaN`/`Infinity`.
 */
function normalizarHoras(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) {
    return 0;
  }

  return valor;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  const redondeado = Math.round(valor * factor) / factor;

  // `-0` rompe comparaciones e igualdad estructural en pruebas y en la UI.
  return redondeado === 0 ? 0 : redondeado;
}

/** Horas libres del turno; nunca negativa (la sobrecarga se lee en la holgura). */
export function calcularHorasDisponibles(
  horasCapacidad: number,
  horasProgramadas: number,
): number {
  const capacidad = normalizarHoras(horasCapacidad);
  const programadas = normalizarHoras(horasProgramadas);

  return redondear(Math.max(0, capacidad - programadas), DECIMALES_HORAS);
}

/** Holgura con signo: negativa cuando lo programado excede la capacidad. */
export function calcularHolguraHoras(
  horasCapacidad: number,
  horasProgramadas: number,
): number {
  const capacidad = normalizarHoras(horasCapacidad);
  const programadas = normalizarHoras(horasProgramadas);

  return redondear(capacidad - programadas, DECIMALES_HORAS);
}

/**
 * Porcentaje de ocupación del turno. Sin capacidad no hay división posible: 0
 * horas programadas es 0 %, y cualquier carga sobre capacidad 0 se reporta como
 * `UMBRAL_OCUPACION_SOBRECARGA` para no devolver `Infinity`.
 */
export function calcularPorcentajeOcupacion(
  horasCapacidad: number,
  horasProgramadas: number,
): number {
  const capacidad = normalizarHoras(horasCapacidad);
  const programadas = normalizarHoras(horasProgramadas);

  if (programadas === 0) {
    return 0;
  }

  if (capacidad === 0) {
    return UMBRAL_OCUPACION_SOBRECARGA;
  }

  return redondear((programadas / capacidad) * 100, DECIMALES_PORCENTAJE);
}

/**
 * Clasifica la saturación del turno. La capacidad 0 con carga es sobrecarga real
 * (se programó sobre un recurso sin turno definido), no una ocupación de 100 %.
 */
export function clasificarSaturacion(
  horasCapacidad: number,
  horasProgramadas: number,
): ClasificacionSaturacion {
  const capacidad = normalizarHoras(horasCapacidad);
  const programadas = normalizarHoras(horasProgramadas);

  if (programadas === 0) {
    return 'libre';
  }

  if (capacidad === 0 || programadas > capacidad) {
    return 'sobrecargado';
  }

  const porcentaje = calcularPorcentajeOcupacion(capacidad, programadas);

  if (porcentaje >= UMBRAL_OCUPACION_SATURADA) {
    return 'saturado';
  }

  if (porcentaje >= UMBRAL_OCUPACION_AJUSTADA) {
    return 'ajustado';
  }

  return 'holgado';
}

/** Métricas derivadas de una carga; función pura y determinista. */
export function evaluarCargaRecursoTurno(carga: CargaRecursoTurno): OcupacionRecursoTurno {
  const horasCapacidad = redondear(normalizarHoras(carga.horasCapacidad), DECIMALES_HORAS);
  const horasProgramadas = redondear(
    normalizarHoras(carga.horasProgramadas),
    DECIMALES_HORAS,
  );
  const clasificacion = clasificarSaturacion(horasCapacidad, horasProgramadas);

  return {
    recursoId: carga.recursoId,
    fechaProgramada: carga.fechaProgramada,
    turno: carga.turno,
    horasCapacidad,
    horasProgramadas,
    horasDisponibles: calcularHorasDisponibles(horasCapacidad, horasProgramadas),
    holguraHoras: calcularHolguraHoras(horasCapacidad, horasProgramadas),
    porcentajeOcupacion: calcularPorcentajeOcupacion(horasCapacidad, horasProgramadas),
    clasificacion,
    sobrecargado: clasificacion === 'sobrecargado',
  };
}

export function evaluarCargasRecursoTurno(
  cargas: readonly CargaRecursoTurno[],
): OcupacionRecursoTurno[] {
  return cargas.map(evaluarCargaRecursoTurno);
}

/**
 * Resume la holgura de todos los turnos con fecha menor o igual al compromiso.
 * Sirve para priorización; no sustituye la validación transaccional de cada RPC.
 */
export function calcularHolguraHastaFecha(
  cargas: readonly CargaRecursoTurno[],
  fechaCompromiso: string,
): HolguraHastaFecha {
  const acumulado = evaluarCargasRecursoTurno(cargas)
    .filter((carga) => carga.fechaProgramada <= fechaCompromiso)
    .reduce(
      (resultado, carga) => ({
        horasCapacidad: resultado.horasCapacidad + carga.horasCapacidad,
        horasProgramadas: resultado.horasProgramadas + carga.horasProgramadas,
      }),
      { horasCapacidad: 0, horasProgramadas: 0 },
    );
  const horasCapacidad = redondear(acumulado.horasCapacidad, DECIMALES_HORAS);
  const horasProgramadas = redondear(acumulado.horasProgramadas, DECIMALES_HORAS);
  const holguraHoras = calcularHolguraHoras(horasCapacidad, horasProgramadas);

  return {
    fechaCompromiso,
    horasCapacidad,
    horasProgramadas,
    holguraHoras,
    sobrecargado: holguraHoras < 0,
  };
}

/**
 * Previsualización de UI: ¿las horas adicionales caben en la holgura del turno?
 * Un `true` NO autoriza la programación; la RPC vuelve a validar la capacidad
 * bajo lock y puede rechazarla.
 */
export function puedeAbsorberHoras(
  carga: CargaRecursoTurno,
  horasAdicionales: number,
): boolean {
  const adicionales = normalizarHoras(horasAdicionales);
  const ocupacion = evaluarCargaRecursoTurno(carga);

  if (adicionales === 0) {
    return !ocupacion.sobrecargado;
  }

  return adicionales <= ocupacion.horasDisponibles;
}

/**
 * Turnos que limitan el plan, del más comprometido al menos. El orden se
 * desempata por holgura, recurso, fecha y turno para que dos llamadas con los
 * mismos datos devuelvan siempre la misma lista.
 */
export function detectarCuellosBotella(
  cargas: readonly CargaRecursoTurno[],
  opciones: OpcionesCuellosBotella = {},
): OcupacionRecursoTurno[] {
  const umbral = Number.isFinite(opciones.umbralPorcentaje)
    ? (opciones.umbralPorcentaje as number)
    : UMBRAL_OCUPACION_SATURADA;

  const candidatos = evaluarCargasRecursoTurno(cargas)
    .filter(
      (ocupacion) => ocupacion.sobrecargado || ocupacion.porcentajeOcupacion >= umbral,
    )
    .sort(compararPorCriticidad);

  if (opciones.limite === undefined) {
    return candidatos;
  }

  if (!Number.isFinite(opciones.limite) || opciones.limite <= 0) {
    return [];
  }

  return candidatos.slice(0, Math.floor(opciones.limite));
}

function compararPorCriticidad(
  a: OcupacionRecursoTurno,
  b: OcupacionRecursoTurno,
): number {
  if (a.porcentajeOcupacion !== b.porcentajeOcupacion) {
    return b.porcentajeOcupacion - a.porcentajeOcupacion;
  }

  if (a.holguraHoras !== b.holguraHoras) {
    return a.holguraHoras - b.holguraHoras;
  }

  if (a.recursoId !== b.recursoId) {
    return a.recursoId < b.recursoId ? -1 : 1;
  }

  if (a.fechaProgramada !== b.fechaProgramada) {
    return a.fechaProgramada < b.fechaProgramada ? -1 : 1;
  }

  if (a.turno !== b.turno) {
    return a.turno < b.turno ? -1 : 1;
  }

  return 0;
}
