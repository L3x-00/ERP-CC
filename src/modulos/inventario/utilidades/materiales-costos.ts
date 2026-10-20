import { dimensionMaterialMm } from '@/modulos/catalogos/validaciones/indice';

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

const FORMATO_DIMENSION_MM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 });

/**
 * Interpreta el texto de un campo de dimensión (mm) del formulario: vacío es
 * «sin dato» (null); con valor debe cumplir el mismo esquema que valida el
 * servidor, para no divergir de él.
 */
export function interpretarDimensionMm(
  texto: string,
  etiqueta: 'ancho' | 'largo',
): { valor: number | null } | { error: string } {
  const limpio = texto.trim();
  if (limpio === '') return { valor: null };
  const analisis = dimensionMaterialMm(etiqueta).safeParse(Number(limpio));
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? `El ${etiqueta} no es válido` };
  }
  return { valor: analisis.data };
}

/** Ancho × largo en mm para listados; `—` si el material no tiene dimensiones. */
export function formatearDimensionesMm(anchoMm: number | null, largoMm: number | null): string {
  if (anchoMm !== null && largoMm !== null) {
    return `${FORMATO_DIMENSION_MM.format(anchoMm)} × ${FORMATO_DIMENSION_MM.format(largoMm)} mm`;
  }
  if (anchoMm !== null) return `Ancho ${FORMATO_DIMENSION_MM.format(anchoMm)} mm`;
  if (largoMm !== null) return `Largo ${FORMATO_DIMENSION_MM.format(largoMm)} mm`;
  return '—';
}
