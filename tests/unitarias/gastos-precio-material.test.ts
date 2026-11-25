import { describe, expect, it } from 'vitest';
import { subtotalDesdePrecio } from '@/modulos/gastos/utilidades/precio-material';

describe('subtotalDesdePrecio (captura de precio por material)', () => {
  it('calcula el subtotal con el redondeo de cuatro decimales de la tabla', () => {
    expect(subtotalDesdePrecio('512', '2')).toBe('1024');
    expect(subtotalDesdePrecio('1250.5', '2')).toBe('2501');
    expect(subtotalDesdePrecio('0.0001', '3')).toBe('0.0003');
  });

  it('no propone subtotal si falta precio o cantidad', () => {
    expect(subtotalDesdePrecio('', '2')).toBeNull();
    expect(subtotalDesdePrecio('512', '')).toBeNull();
    expect(subtotalDesdePrecio('   ', '2')).toBeNull();
  });

  it('no propone subtotal con valores inválidos', () => {
    expect(subtotalDesdePrecio('abc', '2')).toBeNull();
    expect(subtotalDesdePrecio('512', 'abc')).toBeNull();
    expect(subtotalDesdePrecio('-1', '2')).toBeNull();
    expect(subtotalDesdePrecio('512', '0')).toBeNull();
    expect(subtotalDesdePrecio('512', '-2')).toBeNull();
  });
});
