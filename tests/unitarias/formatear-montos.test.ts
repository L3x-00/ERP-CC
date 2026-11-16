// QA 2026-11-15 (item 4): los montos muestran centavos, no cuatro decimales fijos.
import { describe, expect, it } from 'vitest';

import {
  formatearMontoFlexible,
  formatearNumeroFlexible,
} from '@/compartido/utilidades/formatear';

describe('formatearMontoFlexible', () => {
  it('muestra dos decimales cuando el monto es redondo', () => {
    expect(formatearMontoFlexible(505)).toBe('$505.00');
    expect(formatearMontoFlexible(20, 'MXN')).toBe('$20.00');
  });

  it('conserva hasta cuatro decimales cuando el costo los necesita', () => {
    expect(formatearMontoFlexible(19.4321)).toBe('$19.4321');
    expect(formatearMontoFlexible(505.5, 'USD')).toBe('USD 505.50');
  });

  it('devuelve un guion con valores no finitos', () => {
    expect(formatearMontoFlexible(Number.NaN)).toBe('—');
  });
});

describe('formatearNumeroFlexible', () => {
  it('recorta los ceros sobrantes del tipo de cambio', () => {
    expect(formatearNumeroFlexible(20)).toBe('20.00');
    expect(formatearNumeroFlexible(19.4321)).toBe('19.4321');
  });
});
