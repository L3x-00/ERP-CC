/**
 * Formatea número como moneda MXN.
 */
export function formatearMoneda(cantidad: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cantidad);
}

/**
 * Formatea fecha a formato legible (ej: "3 de julio de 2026").
 */
export function formatearFecha(fecha: string | Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(fecha));
}

/**
 * Formatea hora a HH:MM.
 */
export function formatearHora(fecha: string | Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha));
}
