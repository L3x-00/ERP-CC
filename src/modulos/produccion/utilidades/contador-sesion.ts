/**
 * Contador en vivo de una sesión de trabajo.
 *
 * El operador necesita ver cuánto tiempo lleva la sesión en marcha y si ya
 * superó el tiempo que la orden estimó para ese proceso. El estado es binario:
 * dentro del límite (verde) o excedido (rojo). Sin estimado válido no se
 * inventa un límite: el contador queda neutro.
 */
export type EstadoContadorSesion = 'dentro' | 'excedido' | 'sin_limite';

/** Compara el tiempo transcurrido contra el estimado de la orden. */
export function estadoContadorSesion(
  horasTranscurridas: number,
  limiteHoras: number | null | undefined,
): EstadoContadorSesion {
  if (
    typeof limiteHoras !== 'number'
    || !Number.isFinite(limiteHoras)
    || limiteHoras <= 0
  ) {
    return 'sin_limite';
  }
  const transcurridas = Number.isFinite(horasTranscurridas) ? Math.max(0, horasTranscurridas) : 0;
  return transcurridas > limiteHoras ? 'excedido' : 'dentro';
}

/**
 * Formato de cronómetro `HH:MM:SS`. Las horas no se reinician a las 24: una
 * sesión olvidada puede mostrar `31:40:08` en lugar de ocultar el día.
 */
export function formatearTiempoTranscurrido(horas: number): string {
  const totalSegundos = Math.max(
    0,
    Math.floor((Number.isFinite(horas) ? horas : 0) * 3600),
  );
  const horasEnteras = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  return [
    String(horasEnteras).padStart(2, '0'),
    String(minutos).padStart(2, '0'),
    String(segundos).padStart(2, '0'),
  ].join(':');
}
