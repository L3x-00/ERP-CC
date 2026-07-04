import { describe, expect, it } from 'vitest';
import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
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
    expect(t).toEqual({ subtotal: 0, iva: 0, ivaPorcentaje: 16, total: 0, moneda: 'USD' });
  });

  it('conserva la moneda y el porcentaje de IVA en la salida', () => {
    const t = calcularTotalesCotizacion([linea(1, 500)], 8, 'USD');
    expect(t.moneda).toBe('USD');
    expect(t.ivaPorcentaje).toBe(8);
  });
});
