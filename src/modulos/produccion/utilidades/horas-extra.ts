/**
 * Regla D2-A/C18/C20: al cerrar, se suman las horas netas de TODAS las sesiones
 * del operador en el día laboral de Tijuana (8 h corridas, comida descontada). Si el total
 * supera la jornada, la RPC exige autorización. Reanudar el mismo día no reinicia
 * el contador. El aviso es informativo: la base decide y consume la autorización.
 */
export const HORAS_JORNADA_PREDETERMINADA = 8;

/** Horas transcurridas desde el inicio de la sesión, nunca negativas. */
export function horasTranscurridasSesion(fechaInicio: string, ahora: Date): number {
  const inicio = new Date(fechaInicio).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, (ahora.getTime() - inicio) / 3_600_000);
}

/**
 * `true` cuando la sesión ya alcanzó la jornada y probablemente el cierre pida
 * autorización. No garantiza el bloqueo: las pausas reducen las horas netas.
 */
export function sesionCercaDeJornada(
  fechaInicio: string,
  ahora: Date,
  jornada: number = HORAS_JORNADA_PREDETERMINADA,
): boolean {
  return horasTranscurridasSesion(fechaInicio, ahora) >= jornada;
}

/** Texto accionable que explica qué hacer si el cierre pide horas extra. */
export const AYUDA_HORAS_EXTRA =
  'La jornada es corrida de 8 horas (la comida de 12 a 1 no se cuenta). Si el tiempo neto acumulado del día supera esas 8 horas, el cierre te pedirá justificar el exceso o pedir aprobación en Producción → Horas extra. Reanudar el mismo día no reinicia el contador; la sesión también se pausa sola al cumplir la jornada.';
