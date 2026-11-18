import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { NivelDesviacion } from '@/modulos/cierres/tipos/indice';

/** Umbral de los semáforos: ±10 % (decisión del PO). */
export const UMBRAL_DESVIACION = 10;

/** (real - estimado) / estimado × 100, redondeado a un decimal. null si no hay base. */
export function porcentajeDesviacion(real: number, estimado: number): number | null {
  if (!Number.isFinite(real) || !Number.isFinite(estimado) || estimado <= 0) return null;
  return redondear(((real - estimado) / estimado) * 100, 1);
}

/** Margen porcentual sobre la venta; null si no hay venta válida. */
export function porcentajeMargen(venta: number, costo: number): number | null {
  if (!Number.isFinite(venta) || !Number.isFinite(costo) || venta <= 0) return null;
  return redondear(((venta - costo) / venta) * 100, 1);
}

/** Semáforo de una desviación: negativo (ahorro) verde, ±10 % ámbar, positivo rojo. */
export function nivelDesviacion(desviacion: number | null): NivelDesviacion {
  if (desviacion === null || !Number.isFinite(desviacion)) return 'neutro';
  if (desviacion <= -UMBRAL_DESVIACION) return 'ahorro';
  if (desviacion >= UMBRAL_DESVIACION) return 'sobrecosto';
  return 'neutro';
}

/** Clases de color para texto de desviación (ahorro verde, sobrecosto rojo, neutro ámbar). */
export function claseDesviacion(nivel: NivelDesviacion): string {
  if (nivel === 'ahorro') return 'text-exito-texto';
  if (nivel === 'sobrecosto') return 'text-peligro-texto';
  return 'text-advertencia-texto';
}

/** Clases del fondo suave del semáforo. */
export function fondoDesviacion(nivel: NivelDesviacion): string {
  if (nivel === 'ahorro') return 'bg-exito-suave';
  if (nivel === 'sobrecosto') return 'bg-peligro-suave';
  return 'bg-advertencia-suave';
}

/** Texto legible: +12.3 % / −8.0 % / —. */
export function formatearPorcentaje(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  const signo = valor > 0 ? '+' : '';
  return `${signo}${valor.toFixed(1).replace('.', ',')} %`;
}

/**
 * Horas legibles: un valor pequeño pero no nulo (p. ej. 0.01 h = 36 s ya
 * redondeados en base) no debe aplanarse a «0,0 h» y parecer que no se trabajó.
 */
export function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  const decimales = valor !== 0 && Math.abs(valor) < 0.1 ? 2 : 1;
  // `formatearNumero` depende de ICU: forzar la coma evita que un entorno con
  // ICU reducido pinte «0.01 h» en una interfaz es-MX.
  return `${formatearNumero(valor, decimales).replace('.', ',')} h`;
}

/** Frase de negocio para la desviación de tiempo. */
export function fraseTiempo(horasEstimadas: number, horasReales: number): string {
  if (horasEstimadas <= 0) return 'Sin horas estimadas para comparar.';
  if (horasReales <= horasEstimadas) {
    const ahorro = porcentajeDesviacion(horasReales, horasEstimadas);
    const porcentaje = ahorro === null ? 0 : Math.abs(ahorro).toFixed(0);
    return `Cotizaste ${formatearHoras(horasEstimadas)} y usaste ${formatearHoras(horasReales)}: estás cotizando ${porcentaje} % de más en tiempo.`;
  }
  const exceso = porcentajeDesviacion(horasReales, horasEstimadas);
  const porcentaje = exceso === null ? 0 : Math.abs(exceso).toFixed(0);
  return `Cotizaste ${formatearHoras(horasEstimadas)} y usaste ${formatearHoras(horasReales)}: te pasaste ${porcentaje} % en tiempo.`;
}

/** Media ignorando nulos. */
export function promedio(valores: readonly (number | null)[]): number | null {
  const validos = valores.filter((valor): valor is number => valor !== null && Number.isFinite(valor));
  if (validos.length === 0) return null;
  return redondear(validos.reduce((total, valor) => total + valor, 0) / validos.length, 1);
}

/** Redondeo estable a n decimales. */
export function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}
