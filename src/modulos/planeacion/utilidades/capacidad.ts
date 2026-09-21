/**
 * D-02 — Capacidad instalada en Planeación. Separa la jornada laboral de la
 * cantidad de equipos: la capacidad por jornada es `equipos × jornada`, con un
 * override opcional de jornada por recurso. Funciones puras para pruebas.
 */

/** Jornada estándar de taller cuando el recurso no define turnos. */
export const JORNADA_ESTANDAR_HORAS = 8;

function esHoraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= 24;
}

/**
 * Jornada vigente por equipo: el override válido manda; si no, la mayor de las
 * capacidades de turno del recurso; si no hay datos, la jornada estándar.
 */
export function jornadaBaseHoras(
  horasPorTurno: readonly number[],
  overrideHoras: number | null,
): number {
  if (overrideHoras !== null && esHoraValida(overrideHoras)) return overrideHoras;
  const maximas = horasPorTurno.filter(esHoraValida);
  if (maximas.length === 0) return JORNADA_ESTANDAR_HORAS;
  return Math.max(...maximas);
}

/** Capacidad instalada por jornada: equipos × jornada, redondeada a 2 decimales. */
export function capacidadInstaladaHoras(equipos: number, jornadaHoras: number): number {
  if (!Number.isFinite(equipos) || equipos < 1 || !esHoraValida(jornadaHoras)) return 0;
  return Math.round(equipos * jornadaHoras * 100) / 100;
}
