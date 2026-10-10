import type { FuenteCosto } from '../tipos/materiales-costos';

const ETIQUETAS_FUENTE: Record<FuenteCosto, string> = {
  MANUAL: 'Manual',
  COMPRA: 'Compra',
  GASTO: 'Gasto',
};

/** Etiqueta legible de la fuente de un costo confirmado. */
export function etiquetaFuenteCosto(fuente: FuenteCosto): string {
  return ETIQUETAS_FUENTE[fuente];
}

/**
 * Formatea una fecha calendario (`YYYY-MM-DD`) en UTC para no correr el día en
 * zonas horarias negativas. Devuelve `—` si el valor no es utilizable.
 */
export function formatearFechaDia(valor: string | null): string {
  if (!valor) return '—';
  const partes = valor.slice(0, 10).split('-');
  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return '—';
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return '—';
  }
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(fecha);
}
