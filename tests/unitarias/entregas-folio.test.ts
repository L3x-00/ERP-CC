import { describe, expect, it } from 'vitest';

import {
  construirFolioEntrega,
  derivarBaseFolioOrden,
  formatearConsecutivoEntrega,
} from '@/modulos/entregas/utilidades/indice';

describe('folio NE-O-MMYY_XX-YY (SII-B7.1, decisión D1-B)', () => {
  it('formatea el consecutivo sin truncar (9, 10, 99, 100, 101)', () => {
    expect(formatearConsecutivoEntrega(1)).toBe('01');
    expect(formatearConsecutivoEntrega(9)).toBe('09');
    expect(formatearConsecutivoEntrega(10)).toBe('10');
    expect(formatearConsecutivoEntrega(99)).toBe('99');
    expect(formatearConsecutivoEntrega(100)).toBe('100');
    expect(formatearConsecutivoEntrega(101)).toBe('101');
  });

  it('rechaza consecutivos no positivos o no enteros', () => {
    expect(() => formatearConsecutivoEntrega(0)).toThrow(RangeError);
    expect(() => formatearConsecutivoEntrega(-1)).toThrow(RangeError);
    expect(() => formatearConsecutivoEntrega(1.5)).toThrow(RangeError);
  });

  it('conserva el folio completo de la orden (O- y OI-) y descarta históricos', () => {
    expect(derivarBaseFolioOrden('O-1026_01')).toBe('O-1026_01');
    expect(derivarBaseFolioOrden('OI-1026_09')).toBe('OI-1026_09');
    expect(derivarBaseFolioOrden('OP-000123')).toBeNull();
    expect(derivarBaseFolioOrden(null)).toBeNull();
  });

  it('construye el folio de entrega con el prefijo de origen', () => {
    expect(construirFolioEntrega('O-1026_01', 1)).toBe('NE-O-1026_01-01');
    expect(construirFolioEntrega('O-1026_01', 100)).toBe('NE-O-1026_01-100');
    expect(construirFolioEntrega('OI-1026_09', 2)).toBe('NE-OI-1026_09-02');
    expect(construirFolioEntrega(null, 1)).toBeNull();
  });
});
