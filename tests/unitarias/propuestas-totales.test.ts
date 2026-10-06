import { describe, expect, it } from 'vitest';

import {
  calcularTotalesPropuesta,
  type ItemCalculablePropuesta,
} from '@/modulos/propuestas/servicios/calcular-totales-propuesta';

/**
 * Tabla de casos compartida con `supabase/tests/sii_b4_propuestas.test.sql`
 * (mismos importes y mismo redondeo): si una cambia, la otra debe cambiar.
 */
type Caso = {
  nombre: string;
  items: ItemCalculablePropuesta[];
  costoTotal: number;
  ivaPorcentaje: number;
  esperado: { subtotal: number; iva: number; total: number; margen: number | null };
};

const CASOS: Caso[] = [
  {
    nombre: 'sin ítems: subtotal 0 y margen nulo (nunca NaN)',
    items: [],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 0, iva: 0, total: 0, margen: null },
  },
  {
    nombre: 'ítem simple con IVA 16',
    items: [{ cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true }],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 1005, iva: 160.8, total: 1165.8, margen: 1 },
  },
  {
    nombre: 'descuento restado del subtotal y margen a 4 decimales',
    items: [
      { cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true },
      { cantidad: 1, precioUnitario: 20, esDescuento: true, activo: true },
    ],
    costoTotal: 500,
    ivaPorcentaje: 16,
    esperado: { subtotal: 985, iva: 157.6, total: 1142.6, margen: 0.4924 },
  },
  {
    nombre: 'los ítems inactivos no cuentan',
    items: [
      { cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true },
      { cantidad: 1, precioUnitario: 20, esDescuento: true, activo: true },
      { cantidad: 99, precioUnitario: 1000, esDescuento: false, activo: false },
      { cantidad: 5, precioUnitario: 50, esDescuento: true, activo: false },
    ],
    costoTotal: 500,
    ivaPorcentaje: 16,
    esperado: { subtotal: 985, iva: 157.6, total: 1142.6, margen: 0.4924 },
  },
  {
    nombre: 'redondeo a 2 decimales del subtotal y del IVA',
    items: [{ cantidad: 3, precioUnitario: 33.3333, esDescuento: false, activo: true }],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 100, iva: 16, total: 116, margen: 1 },
  },
  {
    nombre: 'costo mayor al subtotal: margen negativo',
    items: [{ cantidad: 1, precioUnitario: 100, esDescuento: false, activo: true }],
    costoTotal: 150,
    ivaPorcentaje: 8,
    esperado: { subtotal: 100, iva: 8, total: 108, margen: -0.5 },
  },
];

describe('calcularTotalesPropuesta (espejo TS del SQL calcular_totales_revision)', () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      const totales = calcularTotalesPropuesta({
        items: caso.items,
        costoTotal: caso.costoTotal,
        ivaPorcentaje: caso.ivaPorcentaje,
        moneda: 'MXN',
      });

      expect(totales.subtotal).toBe(caso.esperado.subtotal);
      expect(totales.iva).toBe(caso.esperado.iva);
      expect(totales.total).toBe(caso.esperado.total);
      expect(totales.margen).toBe(caso.esperado.margen);
    });
  }

  it('conserva la moneda de la propuesta', () => {
    const totales = calcularTotalesPropuesta({
      items: [{ cantidad: 1, precioUnitario: 100, esDescuento: false, activo: true }],
      costoTotal: 0,
      ivaPorcentaje: 16,
      moneda: 'USD',
    });
    expect(totales.moneda).toBe('USD');
  });

  it('separa bruto y descuento', () => {
    const totales = calcularTotalesPropuesta({
      items: [
        { cantidad: 2, precioUnitario: 100, esDescuento: false, activo: true },
        { cantidad: 1, precioUnitario: 25, esDescuento: true, activo: true },
      ],
      costoTotal: 0,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.bruto).toBe(200);
    expect(totales.descuento).toBe(25);
    expect(totales.subtotal).toBe(175);
  });
});
