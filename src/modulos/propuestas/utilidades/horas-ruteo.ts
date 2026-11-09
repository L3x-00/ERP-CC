/**
 * Validación de los tiempos de una fila de ruteo.
 *
 * Aclaración cliente 2026-11-09: una operación no puede guardarse con tiempos
 * en cero porque su costo también sería cero. La preparación puede ser 0
 * (cuando el proceso no la requiere), pero la operación siempre debe ser mayor
 * que 0. El servidor revalida la misma regla.
 */

export type ErroresHorasRuteo = {
  preparacion?: string;
  operacion?: string;
};

const MAX_PREPARACION_HORAS = 10_000;
const MAX_OPERACION_HORAS = 100_000;

function numeroDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

function sinDecimalesDeMas(valor: number): boolean {
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/** Devuelve los mensajes por campo; vacío cuando la fila es válida. */
export function validarHorasRuteo(
  preparacionTexto: string,
  operacionTexto: string,
): ErroresHorasRuteo {
  const errores: ErroresHorasRuteo = {};
  const preparacion = numeroDeTexto(preparacionTexto);
  const operacion = numeroDeTexto(operacionTexto);

  if (preparacion === null) {
    errores.preparacion = 'Indica las horas de preparación. Puede ser 0 si no aplica.';
  } else if (preparacion < 0) {
    errores.preparacion = 'Las horas no pueden ser negativas.';
  } else if (preparacion > MAX_PREPARACION_HORAS) {
    errores.preparacion = `El máximo es ${MAX_PREPARACION_HORAS.toLocaleString('es-MX')} h.`;
  } else if (!sinDecimalesDeMas(preparacion)) {
    errores.preparacion = 'Usa como máximo 2 decimales.';
  }

  if (operacion === null) {
    errores.operacion = 'Indica las horas de operación.';
  } else if (operacion <= 0) {
    errores.operacion = 'Debe ser mayor que 0: es el tiempo que genera el costo.';
  } else if (operacion > MAX_OPERACION_HORAS) {
    errores.operacion = `El máximo es ${MAX_OPERACION_HORAS.toLocaleString('es-MX')} h.`;
  } else if (!sinDecimalesDeMas(operacion)) {
    errores.operacion = 'Usa como máximo 2 decimales.';
  }

  if (
    !errores.preparacion
    && !errores.operacion
    && preparacion !== null
    && operacion !== null
    && preparacion + operacion <= 0
  ) {
    errores.preparacion = 'El total de la fila debe ser mayor que 0.';
    errores.operacion = 'El total de la fila debe ser mayor que 0.';
  }

  return errores;
}

export function tieneErroresHoras(errores: ErroresHorasRuteo): boolean {
  return Boolean(errores.preparacion || errores.operacion);
}
