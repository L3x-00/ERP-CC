import { describe, expect, it } from 'vitest';

import { fechaPromesaOrden } from '@/modulos/ordenes/utilidades/fecha-promesa';

describe('fecha de promesa de la orden (O-06 A)', () => {
  it('usa el compromiso comercial, la promesa original al cliente', () => {
    expect(fechaPromesaOrden({
      fechaCompromiso: '2026-09-30T18:00:00.000Z',
      fechaCompromisoComercial: '2026-09-10',
    })).toBe('2026-09-10');
  });

  it('sin compromiso comercial (interna o anterior al flujo SII) cae a la fecha que la orden tenga', () => {
    expect(fechaPromesaOrden({
      fechaCompromiso: '2026-09-30T18:00:00.000Z',
      fechaCompromisoComercial: null,
    })).toBe('2026-09-30');
    expect(fechaPromesaOrden({ fechaCompromiso: '2026-09-30T18:00:00.000Z' })).toBe('2026-09-30');
  });

  it('devuelve siempre YYYY-MM-DD aunque el valor traiga hora', () => {
    expect(fechaPromesaOrden({
      fechaCompromiso: '2026-09-30',
      fechaCompromisoComercial: '2026-09-10T00:00:00.000Z',
    })).toBe('2026-09-10');
  });

  it('ignora un compromiso comercial vacío', () => {
    expect(fechaPromesaOrden({
      fechaCompromiso: '2026-09-30T18:00:00.000Z',
      fechaCompromisoComercial: '',
    })).toBe('2026-09-30');
  });
});
