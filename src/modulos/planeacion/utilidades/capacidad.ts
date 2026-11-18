import { HORAS_JORNADA_SEMANA } from '@/modulos/planeacion/utilidades/horario-laboral';

/**
 * D-02 — Capacidad instalada en Planeación. Separa la jornada laboral de la
 * cantidad de equipos: la capacidad por jornada es `equipos × jornada`, con un
 * override opcional de jornada por recurso. Funciones puras para pruebas.
 *
 * C24: la jornada de referencia es el día completo (8 h de lunes a viernes,
 * 4 h el sábado); el turno es solo una etiqueta visual y no reparte la jornada.
 */

/** Jornada estándar de taller cuando el recurso no define turnos. */
export const JORNADA_ESTANDAR_HORAS = HORAS_JORNADA_SEMANA;

function esHoraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= 24;
}

/**
 * Jornada vigente por equipo: el override válido manda; si no hay override, la
 * jornada estándar. C24: el turno es una etiqueta visual y no reparte el día;
 * `horasPorTurno` se conserva solo por compatibilidad con configuraciones
 * históricas y el panel de capacidad ya no lo alimenta.
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
