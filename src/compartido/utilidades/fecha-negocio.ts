/**
 * Fecha de negocio del taller (AUD-12).
 *
 * El ERP opera en America/Tijuana. `new Date().toISOString().slice(0, 10)` usa
 * UTC, así que a partir de las 16:00/17:00 locales devuelve el día siguiente.
 * Estas funciones son puras y no dependen de la zona horaria del runtime.
 */

export const ZONA_HORARIA_NEGOCIO = 'America/Tijuana';

/** Fecha `YYYY-MM-DD` en la zona indicada (por defecto, la del negocio). */
export function fechaLocalNegocio(
  fecha: Date = new Date(),
  zonaHoraria: string = ZONA_HORARIA_NEGOCIO,
): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo: 'year' | 'month' | 'day'): string =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Suma días a una fecha `YYYY-MM-DD` sin cruzar zonas horarias. */
export function sumarDiasFecha(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso.slice(0, 10)}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Lunes (ISO) de la semana que contiene la fecha `YYYY-MM-DD`. */
export function inicioSemanaFecha(fechaIso: string): string {
  const fecha = new Date(`${fechaIso.slice(0, 10)}T00:00:00.000Z`);
  return sumarDiasFecha(fechaIso, -((fecha.getUTCDay() + 6) % 7));
}
