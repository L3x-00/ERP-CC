import { describe, expect, it } from 'vitest';
import {
  calcularTotalesCotizacion,
  equivalenteMxn,
} from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import type { LineaCotizacionEntrada } from '@/modulos/pipeline/tipos/indice';

function linea(cantidad: number, precioUnitario: number): LineaCotizacionEntrada {
  return { descripcion: 'x', cantidad, precioUnitario };
}

describe('calcularTotalesCotizacion', () => {
  it('subtotal = suma de cantidad * precioUnitario', () => {
    const t = calcularTotalesCotizacion([linea(2, 100), linea(3, 50)], 16, 'MXN');
    expect(t.subtotal).toBe(350); // 200 + 150
  });

  it('IVA 16% nacional', () => {
    const t = calcularTotalesCotizacion([linea(1, 1000)], 16, 'MXN');
    expect(t.subtotal).toBe(1000);
    expect(t.iva).toBe(160);
    expect(t.total).toBe(1160);
  });

  it('IVA 8% frontera', () => {
    const t = calcularTotalesCotizacion([linea(1, 1000)], 8, 'MXN');
    expect(t.iva).toBe(80);
    expect(t.total).toBe(1080);
  });

  it('redondea a 2 decimales (evita error de flotante)', () => {
    // 0.1 * 3 = 0.30000000000000004 sin redondeo
    const t = calcularTotalesCotizacion([linea(3, 0.1)], 16, 'MXN');
    expect(t.subtotal).toBe(0.3);
    expect(t.iva).toBe(0.05); // 0.3 * 0.16 = 0.048 -> 0.05
    expect(t.total).toBe(0.35);
  });

  it('cotización vacía → todo en cero', () => {
    const t = calcularTotalesCotizacion([], 16, 'USD');
    expect(t).toEqual({ subtotal: 0, descuento: 0, iva: 0, ivaPorcentaje: 16, total: 0, moneda: 'USD' });
  });

  it('conserva la moneda y el porcentaje de IVA en la salida', () => {
    const t = calcularTotalesCotizacion([linea(1, 500)], 8, 'USD');
    expect(t.moneda).toBe('USD');
    expect(t.ivaPorcentaje).toBe(8);
  });
});

describe('calcularTotalesCotizacion con línea de descuento (RFQ-03)', () => {
  function descuento(monto: number): LineaCotizacionEntrada {
    return { descripcion: 'Descuento', cantidad: 1, precioUnitario: monto, esDescuento: true };
  }

  it('resta el descuento antes de calcular el IVA', () => {
    const t = calcularTotalesCotizacion([linea(1, 1000), descuento(200)], 16, 'MXN');
    expect(t.descuento).toBe(200);
    expect(t.subtotal).toBe(800);
    expect(t.iva).toBe(128);
    expect(t.total).toBe(928);
  });

  it('sin descuentos el total no cambia y el campo queda en 0', () => {
    const t = calcularTotalesCotizacion([linea(2, 100), linea(3, 50)], 16, 'MXN');
    expect(t.descuento).toBe(0);
    expect(t.subtotal).toBe(350);
    expect(t.total).toBe(406);
  });

  it('el equivalente MXN convierte también el descuento', () => {
    const usd = calcularTotalesCotizacion([linea(1, 100), descuento(10)], 16, 'USD');
    const mxn = equivalenteMxn(usd, 20);
    expect(mxn?.descuento).toBe(200);
    expect(mxn?.subtotal).toBe(1800);
    expect(mxn?.total).toBe(2088);
  });
});

describe('equivalenteMxn (RFQ-11)', () => {
  it('convierte totales USD a MXN con el tipo de cambio', () => {
    const usd = calcularTotalesCotizacion([linea(1, 100)], 16, 'USD'); // sub 100, iva 16, total 116
    const mxn = equivalenteMxn(usd, 18.5);
    expect(mxn).not.toBeNull();
    expect(mxn?.moneda).toBe('MXN');
    expect(mxn?.subtotal).toBe(1850);
    expect(mxn?.iva).toBe(296); // 16 * 18.5
    expect(mxn?.total).toBe(2146); // 116 * 18.5
  });

  it('devuelve null para cotizaciones que no son USD', () => {
    const mxn = calcularTotalesCotizacion([linea(1, 100)], 16, 'MXN');
    expect(equivalenteMxn(mxn, 18.5)).toBeNull();
  });

  it('devuelve null con tipo de cambio inválido', () => {
    const usd = calcularTotalesCotizacion([linea(1, 100)], 16, 'USD');
    expect(equivalenteMxn(usd, 0)).toBeNull();
    expect(equivalenteMxn(usd, Number.NaN)).toBeNull();
  });
});
