/**
 * Formatea una cantidad como moneda. Por defecto MXN con 2 decimales; acepta
 * moneda y decimales para cotizaciones USD y costos unitarios (CPP a 4).
 */
export function formatearMoneda(
  cantidad: number,
  moneda: 'MXN' | 'USD' = 'MXN',
  decimales = 2,
): string {
  if (!Number.isFinite(cantidad)) {
    return '—';
  }
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(cantidad);
}

/** Formatea un número no monetario con decimales fijos (cantidades, horas). */
export function formatearNumero(cantidad: number, decimales = 2): string {
  if (!Number.isFinite(cantidad)) {
    return '—';
  }
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
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
