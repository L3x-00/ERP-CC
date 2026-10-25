import { describe, expect, it } from 'vitest';
import { calcularHorasResumen } from '@/modulos/ordenes/utilidades/resumen-orden';

describe('calcularHorasResumen', () => {
  it('suma minutos de todas las partidas y convierte a horas', () => {
    const resumen = calcularHorasResumen([
      { tiempoEstimadoMinutos: 330, tiempoRealMinutos: 480 },
      { tiempoEstimadoMinutos: 0, tiempoRealMinutos: 12 },
    ]);

    expect(resumen.estimadas).toBe(5.5);
    expect(resumen.reales).toBe(8.2);
    expect(resumen.eficiencia).toBe(67.1);
  });

  it('sin tiempo real no inventa eficiencia', () => {
    const resumen = calcularHorasResumen([
      { tiempoEstimadoMinutos: 120, tiempoRealMinutos: 0 },
    ]);

    expect(resumen).toEqual({ estimadas: 2, reales: 0, eficiencia: null });
  });

  it('sin partidas queda en cero', () => {
    expect(calcularHorasResumen([])).toEqual({ estimadas: 0, reales: 0, eficiencia: null });
  });

  it('redondea a dos decimales las horas y a un decimal la eficiencia', () => {
    const resumen = calcularHorasResumen([
      { tiempoEstimadoMinutos: 100, tiempoRealMinutos: 333 },
    ]);

    expect(resumen.estimadas).toBe(1.67);
    expect(resumen.reales).toBe(5.55);
    expect(resumen.eficiencia).toBe(30);
  });
});
