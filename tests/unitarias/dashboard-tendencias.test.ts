import { describe, expect, it } from 'vitest';
import {
  calcularVariacionPorcentaje,
} from '@/modulos/dashboard/servicios/calculo-tendencias';

describe('calcularVariacionPorcentaje', () => {
  it('calcula crecimiento y tendencia al alza', () => {
    expect(calcularVariacionPorcentaje(125, 100)).toEqual({ porcentaje: 25, tendencia: 'subio' });
  });

  it('calcula reducción con denominador absoluto', () => {
    expect(calcularVariacionPorcentaje(75, 100)).toEqual({ porcentaje: -25, tendencia: 'bajo' });
    expect(calcularVariacionPorcentaje(-50, -100)).toEqual({ porcentaje: 50, tendencia: 'subio' });
  });

  it('devuelve neutro cuando ambos periodos son iguales o cero', () => {
    expect(calcularVariacionPorcentaje(0, 0)).toEqual({ porcentaje: 0, tendencia: 'neutro' });
    expect(calcularVariacionPorcentaje(10, 10)).toEqual({ porcentaje: 0, tendencia: 'neutro' });
  });

  it('evita Infinity cuando el periodo anterior es cero', () => {
    expect(calcularVariacionPorcentaje(20, 0)).toEqual({ porcentaje: 100, tendencia: 'subio' });
    expect(calcularVariacionPorcentaje(-20, 0)).toEqual({ porcentaje: -100, tendencia: 'bajo' });
  });

  it('normaliza entradas no finitas y siempre devuelve un resultado finito', () => {
    const resultado = calcularVariacionPorcentaje(Number.NaN, Number.POSITIVE_INFINITY);
    expect(resultado).toEqual({ porcentaje: 0, tendencia: 'neutro' });
    expect(Number.isFinite(resultado.porcentaje)).toBe(true);
  });
});
