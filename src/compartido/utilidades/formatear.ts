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

/**
 * Monto con cortesía visual: siempre muestra centavos y solo conserva los
 * decimales necesarios (`505` → `$505.00`, `19.4321` → `$19.4321`).
 *
 * Evita el ruido de `$505.0000` sin perder precisión cuando el costo o el
 * tipo de cambio realmente usa cuatro decimales.
 */
export function formatearMontoFlexible(
  cantidad: number,
  moneda: 'MXN' | 'USD' = 'MXN',
  decimalesMaximos = 4,
): string {
  if (!Number.isFinite(cantidad)) {
    return '—';
  }
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, decimalesMaximos),
  }).format(cantidad);
}

/** Número con mínimo de centavos y hasta cuatro decimales cuando hacen falta. */
export function formatearNumeroFlexible(cantidad: number, decimalesMaximos = 4): string {
  if (!Number.isFinite(cantidad)) {
    return '—';
  }
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, decimalesMaximos),
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
 * Detecta valores que representan un día calendario y no un instante:
 * `YYYY-MM-DD` o una medianoche UTC (`...T00:00:00+00:00`), que es como
 * Postgres devuelve una columna `date` cuando se serializa con hora.
 *
 * Para estos valores se formatea en UTC: usar la zona local corre el día en
 * zonas negativas (CDMX muestra el día anterior).
 */
function esDiaCalendario(valor: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return true;
  const fecha = new Date(valor);
  return !Number.isNaN(fecha.getTime())
    && fecha.getUTCHours() === 0
    && fecha.getUTCMinutes() === 0
    && fecha.getUTCSeconds() === 0
    && fecha.getUTCMilliseconds() === 0;
}

function interpretarFecha(fecha: string | Date): Date | null {
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  return Number.isNaN(valor.getTime()) ? null : valor;
}

/**
 * Formatea fecha a formato legible (ej: "3 de julio de 2026").
 *
 * Acepta tanto instantes como días calendario; los días se formatean en UTC
 * para no mostrar el día anterior en zonas horarias negativas.
 */
export function formatearFecha(fecha: string | Date): string {
  const valor = interpretarFecha(fecha);
  if (!valor) return '—';
  const diaCalendario = typeof fecha === 'string' && esDiaCalendario(fecha);
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(diaCalendario ? { timeZone: 'UTC' as const } : {}),
  }).format(valor);
}

/** Igual que `formatearFecha` pero en formato corto `dd/mm/aaaa`. */
export function formatearFechaCorta(fecha: string | Date): string {
  const valor = interpretarFecha(fecha);
  if (!valor) return '—';
  const diaCalendario = typeof fecha === 'string' && esDiaCalendario(fecha);
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(diaCalendario ? { timeZone: 'UTC' as const } : {}),
  }).format(valor);
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
