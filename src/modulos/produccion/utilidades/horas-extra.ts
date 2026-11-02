/**
 * Regla D2-A: al cerrar una sesión, si las horas netas superan la jornada
 * configurada del turno (8 h cuando no hay otra), la RPC exige una autorización
 * vigente de horas extra. El aviso es solo informativo: la base sigue siendo la
 * que decide y consume la autorización.
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
  'Si el tiempo neto de la sesión supera la jornada del turno, el cierre se bloquea hasta que un responsable registre la autorización en Producción → Horas extra (permiso aprobar_ordenes).';
