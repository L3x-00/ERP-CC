import { describe, expect, it } from 'vitest';

import {
  formatearPorcentaje,
  fraseTiempo,
  nivelDesviacion,
  porcentajeDesviacion,
  porcentajeMargen,
  promedio,
  UMBRAL_DESVIACION,
} from '@/modulos/cierres/utilidades/indice';

describe('cierre administrativo: cálculo de desviaciones', () => {
  it('calcula la desviación porcentual con signo y un decimal', () => {
    expect(porcentajeDesviacion(110, 100)).toBe(10);
    expect(porcentajeDesviacion(90, 100)).toBe(-10);
    expect(porcentajeDesviacion(5, 8)).toBe(-37.5);
    expect(porcentajeDesviacion(3, 0)).toBeNull();
    expect(porcentajeDesviacion(Number.NaN, 10)).toBeNull();
  });

  it('clasifica con el umbral de ±10 %', () => {
    expect(UMBRAL_DESVIACION).toBe(10);
    expect(nivelDesviacion(-10)).toBe('ahorro');
    expect(nivelDesviacion(-9.9)).toBe('neutro');
    expect(nivelDesviacion(0)).toBe('neutro');
    expect(nivelDesviacion(9.9)).toBe('neutro');
    expect(nivelDesviacion(10)).toBe('sobrecosto');
    expect(nivelDesviacion(null)).toBe('neutro');
  });

  it('calcula el margen sobre la venta', () => {
    expect(porcentajeMargen(1000, 800)).toBe(20);
    expect(porcentajeMargen(1000, 1200)).toBe(-20);
    expect(porcentajeMargen(0, 100)).toBeNull();
  });

  it('formatea porcentajes con coma decimal y signo', () => {
    expect(formatearPorcentaje(12.34)).toBe('+12,3 %');
    expect(formatearPorcentaje(-8)).toBe('-8,0 %');
    expect(formatearPorcentaje(null)).toBe('—');
  });

  it('explica el tiempo cotizado de más o el exceso', () => {
    expect(fraseTiempo(8, 5)).toContain('estás cotizando 38 % de más');
    expect(fraseTiempo(5, 8)).toContain('te pasaste 60 %');
    expect(fraseTiempo(0, 8)).toContain('Sin horas estimadas');
  });

  it('promedia ignorando nulos', () => {
    expect(promedio([10, null, -5])).toBe(2.5);
    expect(promedio([null, null])).toBeNull();
  });
});
