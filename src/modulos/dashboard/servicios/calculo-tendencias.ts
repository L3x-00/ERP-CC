import type { TendenciaMetrica } from '@/modulos/dashboard/tipos/dashboard';

export interface ResultadoVariacionPorcentaje {
  porcentaje: number;
  tendencia: TendenciaMetrica;
}

const DECIMALES_VARIACION = 2;

function normalizarNumero(valor: number): number {
  return Number.isFinite(valor) ? valor : 0;
}

function redondear(valor: number): number {
  const factor = 10 ** DECIMALES_VARIACION;
  const redondeado = Math.round(valor * factor) / factor;
  return Number.isFinite(redondeado) ? redondeado : 0;
}

/**
 * Calcula una variación comparable incluso cuando el periodo anterior no tuvo
 * actividad. El denominador absoluto evita invertir la señal con utilidades
 * negativas y nunca permite que Infinity/NaN llegue a una tarjeta.
 */
export function calcularVariacionPorcentaje(
  valorActual: number,
  valorAnterior: number,
): ResultadoVariacionPorcentaje {
  const actual = normalizarNumero(valorActual);
  const anterior = normalizarNumero(valorAnterior);
  const diferencia = actual - anterior;

  if (diferencia === 0) return { porcentaje: 0, tendencia: 'neutro' };

  if (anterior === 0) {
    return {
      porcentaje: actual > 0 ? 100 : -100,
      tendencia: actual > 0 ? 'subio' : 'bajo',
    };
  }

  const porcentaje = redondear((diferencia / Math.abs(anterior)) * 100);
  return {
    porcentaje,
    tendencia: diferencia > 0 ? 'subio' : 'bajo',
  };
}
