import { HORAS_JORNADA_SEMANA } from '@/modulos/planeacion/utilidades/horario-laboral';

/**
 * D-02 — Capacidad instalada en Planeación. Separa la jornada laboral de la
 * cantidad de equipos: la capacidad por jornada es `equipos × jornada`, con un
 * override opcional de jornada por recurso. Funciones puras para pruebas.
 *
 * C18: la jornada de referencia es el día completo del horario (9 h de lunes a
 * viernes); los turnos son segmentos de esa jornada, no jornadas completas.
 */

/** Jornada estándar de taller cuando el recurso no define turnos. */
export const JORNADA_ESTANDAR_HORAS = HORAS_JORNADA_SEMANA;

function esHoraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= 24;
}

/**
 * Jornada vigente por equipo: el override válido manda; si no, la suma de las
 * horas de turno configuradas (los turnos reparten el día); si no hay datos, la
 * jornada estándar. Nunca supera la jornada de un día completo.
 */
export function jornadaBaseHoras(
  horasPorTurno: readonly number[],
  overrideHoras: number | null,
): number {
  if (overrideHoras !== null && esHoraValida(overrideHoras)) {
    return Math.min(overrideHoras, HORAS_JORNADA_SEMANA);
  }
  const validas = horasPorTurno.filter(esHoraValida);
  if (validas.length === 0) return JORNADA_ESTANDAR_HORAS;
  const suma = validas.reduce((total, horas) => total + horas, 0);
  return Math.min(HORAS_JORNADA_SEMANA, Math.round(suma * 100) / 100);
}

/** Capacidad instalada por jornada: equipos × jornada, redondeada a 2 decimales. */
export function capacidadInstaladaHoras(equipos: number, jornadaHoras: number): number {
  if (!Number.isFinite(equipos) || equipos < 1 || !esHoraValida(jornadaHoras)) return 0;
  return Math.round(equipos * jornadaHoras * 100) / 100;
}
