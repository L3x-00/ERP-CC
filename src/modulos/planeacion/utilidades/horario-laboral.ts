import type { TurnoPlaneacion } from '@/modulos/planeacion/tipos/planeacion';

/**
 * Horario laboral de la empresa (regla confirmada por el PO 2026-11-18):
 *
 * - Lunes a viernes: 8 h de jornada continua.
 * - Sábado: 08:00–12:00, 4 h.
 * - Domingo: cerrado.
 *
 * C24: matutino y vespertino son SOLO etiquetas visuales de preferencia; no
 * reparten la capacidad ni limitan la jornada. Ambas etiquetas ven la jornada
 * completa del día. Nocturno no se ofrece (la empresa cierra a las 17:00).
 *
 * Es la fuente única para calendario, capacidad, planeación y producción.
 */

export const HORAS_JORNADA_SEMANA = 8;
export const HORAS_JORNADA_SABADO = 4;
/** C24: una etiqueta de turno no recorta la jornada; ve las horas completas del día. */
export const HORAS_TURNO_MATUTINO = HORAS_JORNADA_SEMANA;
export const HORAS_TURNO_VESPERTINO = HORAS_JORNADA_SEMANA;

export const VENTANAS_TURNO: Record<TurnoPlaneacion, { inicio: string; fin: string }> = {
  matutino: { inicio: '08:00', fin: '13:00' },
  vespertino: { inicio: '13:00', fin: '17:00' },
  nocturno: { inicio: '—', fin: '—' },
};

/** Día de la semana (0 = domingo … 6 = sábado) de una fecha `YYYY-MM-DD`. */
export function diaSemanaCalendario(fecha: string): number {
  const partes = fecha.slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isFinite(parte))) return -1;
  return new Date(Date.UTC(partes[0]!, partes[1]! - 1, partes[2]!)).getUTCDay();
}

/** `true` si la fecha es un día con actividad (lunes a sábado). */
export function esDiaLaboral(fecha: string): boolean {
  const dia = diaSemanaCalendario(fecha);
  return dia >= 1 && dia <= 6;
}

/** Horas efectivas de la jornada completa para una fecha. */
export function horasJornadaDia(fecha: string): number {
  const dia = diaSemanaCalendario(fecha);
  if (dia === 0 || dia < 0) return 0;
  return dia === 6 ? HORAS_JORNADA_SABADO : HORAS_JORNADA_SEMANA;
}

/** Horas de la jornada continua que ve una etiqueta de turno para una fecha. */
export function horasTurnoLaboral(fecha: string, turno: TurnoPlaneacion): number {
  if (turno === 'nocturno') return 0;
  return horasJornadaDia(fecha);
}

/** Etiquetas de turno disponibles para una fecha, en orden de jornada. */
export function turnosDelDia(fecha: string): TurnoPlaneacion[] {
  const dia = diaSemanaCalendario(fecha);
  if (dia === 0 || dia < 0) return [];
  return ['matutino', 'vespertino'];
}

/** Ventana horaria legible de una etiqueta de turno; `null` si el día está cerrado. */
export function ventanaTurno(fecha: string, turno: TurnoPlaneacion): string | null {
  if (!turnosDelDia(fecha).includes(turno)) return null;
  const dia = diaSemanaCalendario(fecha);
  if (dia === 6) return '08:00–12:00';
  if (turno === 'matutino') return '08:00–13:00';
  if (turno === 'vespertino') return '13:00–17:00';
  return null;
}

/**
 * Motivo por el que una fecha no se puede programar. `null` cuando es válida.
 * Se usa como guía en pantalla; PostgreSQL vuelve a validar la capacidad.
 */
export function errorFechaProgramacion(fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Indica una fecha válida.';
  const dia = diaSemanaCalendario(fecha);
  if (dia < 0) return 'Indica una fecha válida.';
  if (dia === 0) return 'La empresa no labora en domingo; elige de lunes a sábado.';
  return null;
}

/** Primer turno del día con capacidad para las horas pedidas. */
export function turnoSugeridoPara(fecha: string, horas: number): TurnoPlaneacion {
  const turnos = turnosDelDia(fecha);
  return turnos.find((turno) => horasTurnoLaboral(fecha, turno) >= horas) ?? turnos[0] ?? 'matutino';
}

/** Siguiente día laboral (lunes a sábado) a partir de una fecha. */
export function siguienteDiaLaboral(fecha: string): string {
  const partes = fecha.slice(0, 10).split('-').map(Number);
  const cursor = new Date(Date.UTC(partes[0]!, partes[1]! - 1, partes[2]!));
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (cursor.getUTCDay() === 0);
  return cursor.toISOString().slice(0, 10);
}

/** Si la fecha cae en domingo, devuelve el lunes siguiente; si no, la misma. */
export function ajustarADiaLaboral(fecha: string): string {
  const dia = diaSemanaCalendario(fecha);
  return dia === 0 ? siguienteDiaLaboral(fecha) : fecha.slice(0, 10);
}

/** Texto corto del horario para ayudas y diagnósticos. */
export const TEXTO_HORARIO_LABORAL =
  'Lunes a viernes 08:00–17:00 con jornada continua de 8 h y sábado 08:00–12:00 (4 h); domingo cerrado.';
