import { describe, expect, it } from 'vitest';
import { calcularCostoPromedioPonderado } from '@/modulos/inventario/servicios/calculos-inventario';
import {
  calcularCostoRealMaterial,
  calcularCppEntradaMaterialOrden,
  calcularDesviacionCosto,
  calcularMermaAcumulada,
  type RegistroConsumoMaterial,
} from '@/modulos/ordenes/servicios/calculo-cpp-servicio';

describe('calcularCppEntradaMaterialOrden', () => {
  it('reusa la fórmula de Inventario (mismo resultado con los mismos parámetros)', () => {
    const parametros = {
      stockActual: 100,
      costoActual: 20,
      cantidadEntrante: 50,
      costoEntrante: 26,
    };
    expect(calcularCppEntradaMaterialOrden(parametros)).toBe(
      calcularCostoPromedioPonderado(parametros),
    );
  });

  it('promedia ponderando por cantidad', () => {
    // (100*20 + 50*26) / 150 = 22
    expect(
      calcularCppEntradaMaterialOrden({
        stockActual: 100,
        costoActual: 20,
        cantidadEntrante: 50,
        costoEntrante: 26,
      }),
    ).toBe(22);
  });

  it('sin stock previo devuelve el costo entrante', () => {
    expect(
      calcularCppEntradaMaterialOrden({
        stockActual: 0,
        costoActual: 0,
        cantidadEntrante: 10,
        costoEntrante: 100,
      }),
    ).toBe(100);
  });

  it('sin stock previo ni entrada devuelve el costo entrante (no NaN)', () => {
    expect(
      calcularCppEntradaMaterialOrden({
        stockActual: 0,
        costoActual: 0,
        cantidadEntrante: 0,
        costoEntrante: 42,
      }),
    ).toBe(42);
  });
});

describe('calcularMermaAcumulada', () => {
  it('suma varios consumos y calcula el porcentaje de scrap', () => {
    const registros: RegistroConsumoMaterial[] = [
      { cantidadUsada: 40, scrap: 5 },
      { cantidadUsada: 50, scrap: 5 },
    ];
    expect(calcularMermaAcumulada(registros)).toEqual({
      cantidadUsada: 90,
      scrap: 10,
      total: 100,
      porcentaje: 10,
    });
  });

  it('sin registros devuelve todo en cero y porcentaje 0 (no NaN)', () => {
    expect(calcularMermaAcumulada([])).toEqual({
      cantidadUsada: 0,
      scrap: 0,
      total: 0,
      porcentaje: 0,
    });
  });

  it('registros en cero: porcentaje 0, no división por cero', () => {
    const resultado = calcularMermaAcumulada([{ cantidadUsada: 0, scrap: 0 }]);
    expect(resultado.total).toBe(0);
    expect(resultado.porcentaje).toBe(0);
    expect(Number.isNaN(resultado.porcentaje)).toBe(false);
  });

  it('producción sin scrap: porcentaje 0', () => {
    expect(calcularMermaAcumulada([{ cantidadUsada: 25, scrap: 0 }])).toEqual({
      cantidadUsada: 25,
      scrap: 0,
      total: 25,
      porcentaje: 0,
    });
  });

  it('merma total: todo el consumo es scrap → 100%', () => {
    expect(calcularMermaAcumulada([{ cantidadUsada: 0, scrap: 8 }])).toEqual({
      cantidadUsada: 0,
      scrap: 8,
      total: 8,
      porcentaje: 100,
    });
  });

  it('merma con decimales', () => {
    // scrap 1 / total 8 = 12.5%
    const resultado = calcularMermaAcumulada([
      { cantidadUsada: 3.5, scrap: 0.5 },
      { cantidadUsada: 3.5, scrap: 0.5 },
    ]);
    expect(resultado.total).toBeCloseTo(8, 5);
    expect(resultado.porcentaje).toBeCloseTo(12.5, 5);
  });
});

describe('calcularCostoRealMaterial', () => {
  it('cobra a la orden lo usado más el scrap', () => {
    // (90 + 10) * 12.5 = 1250
    expect(calcularCostoRealMaterial(90, 10, 12.5)).toBe(1250);
  });

  it('sin scrap solo cobra lo usado', () => {
    expect(calcularCostoRealMaterial(20, 0, 7)).toBe(140);
  });

  it('cantidades en cero devuelven 0', () => {
    expect(calcularCostoRealMaterial(0, 0, 99)).toBe(0);
  });

  it('costo unitario cero devuelve 0', () => {
    expect(calcularCostoRealMaterial(10, 5, 0)).toBe(0);
  });

  it('el scrap encarece la orden frente al consumo neto', () => {
    expect(calcularCostoRealMaterial(100, 15, 3)).toBeGreaterThan(
      calcularCostoRealMaterial(100, 0, 3),
    );
  });
});

describe('calcularDesviacionCosto', () => {
  it('sobrecosto: monto y porcentaje positivos', () => {
    // real 1250 vs estimado 1000 → +250 (+25%)
    expect(calcularDesviacionCosto(1000, 1250)).toEqual({ monto: 250, porcentaje: 25 });
  });

  it('ahorro: monto y porcentaje negativos', () => {
    expect(calcularDesviacionCosto(1000, 800)).toEqual({ monto: -200, porcentaje: -20 });
  });

  it('sin desviación: 0 y 0%', () => {
    expect(calcularDesviacionCosto(500, 500)).toEqual({ monto: 0, porcentaje: 0 });
  });

  it('estimado cero: porcentaje null (sin base de comparación)', () => {
    expect(calcularDesviacionCosto(0, 300)).toEqual({ monto: 300, porcentaje: null });
  });

  it('estimado y real cero: monto 0 y porcentaje null', () => {
    expect(calcularDesviacionCosto(0, 0)).toEqual({ monto: 0, porcentaje: null });
  });

  it('flujo completo: merma → costo real → desviación sobre el estimado', () => {
    const merma = calcularMermaAcumulada([
      { cantidadUsada: 45, scrap: 3 },
      { cantidadUsada: 45, scrap: 7 },
    ]);
    const costoReal = calcularCostoRealMaterial(merma.cantidadUsada, merma.scrap, 10);
    const desviacion = calcularDesviacionCosto(900, costoReal);

    expect(merma.total).toBe(100);
    expect(merma.porcentaje).toBe(10);
    expect(costoReal).toBe(1000);
    expect(desviacion.monto).toBe(100);
    expect(desviacion.porcentaje).toBeCloseTo(11.111, 3);
  });
});
