// Obs. cliente 2026-10-13: los campos de costo dejan de ser `type=number` y
// aceptan lo que la persona teclea (moneda, miles, coma decimal).
import { describe, expect, it } from 'vitest';

import { parsearMonto, textoMonto } from '@/compartido/utilidades/monto';

describe('parsearMonto', () => {
  it.each([
    ['1250', 1250],
    ['1250.5', 1250.5],
    ['0.75', 0.75],
    ['.75', 0.75],
    ['  400  ', 400],
    ['$1,250.50', 1250.5],
    ['1,250', 1250],
    ['1,234,567.89', 1234567.89],
    ['1 250.5', 1250.5],
    ['1250,5', 1250.5],
    ['12,50', 12.5],
    ['1.250,50', 1250.5],
    ['1.234.567', 1234567],
    ['MXN 900', 900],
    ['450 usd', 450],
    ['0', 0],
  ])('«%s» → %s', (texto, esperado) => {
    expect(parsearMonto(texto)).toBe(esperado);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['12abc'],
    ['-5'],
    ['1,2,3'],
    ['1.2.3'],
    ['1,23,456'],
    ['$'],
    ['1e5'],
    ['1000000001'],
  ])('«%s» no es un monto válido', (texto) => {
    expect(parsearMonto(texto)).toBeNull();
  });
});

describe('textoMonto', () => {
  it('no usa notación científica ni deja ceros sobrantes', () => {
    expect(textoMonto(400)).toBe('400');
    expect(textoMonto(1250.5)).toBe('1250.5');
    expect(textoMonto(0)).toBe('0');
    expect(textoMonto(0.00001)).toBe('0');
    expect(textoMonto(Number.NaN)).toBe('');
  });
});
