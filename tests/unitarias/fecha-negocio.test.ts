import { describe, expect, it } from 'vitest';

import {
  fechaLocalNegocio,
  inicioSemanaFecha,
  sumarDiasFecha,
} from '@/compartido/utilidades/fecha-negocio';

describe('fechaLocalNegocio (AUD-12)', () => {
  it('usa el día de Tijuana y no el día UTC después de las 16:00 locales', () => {
    // 2026-11-06 18:00 PST = 2026-11-07 02:00 UTC
    expect(fechaLocalNegocio(new Date('2026-11-07T02:00:00.000Z'))).toBe('2026-11-06');
    expect(fechaLocalNegocio(new Date('2026-11-07T07:59:59.000Z'))).toBe('2026-11-06');
  });

  it('cambia de día a la medianoche local', () => {
    expect(fechaLocalNegocio(new Date('2026-11-07T08:00:00.000Z'))).toBe('2026-11-07');
  });

  it('respeta el horario de verano de Tijuana', () => {
    // 2026-07-14 18:00 PDT = 2026-07-15 01:00 UTC
    expect(fechaLocalNegocio(new Date('2026-07-15T01:00:00.000Z'))).toBe('2026-07-14');
  });
});

describe('aritmética de fechas de negocio', () => {
  it('suma días sin cruzar zonas horarias', () => {
    expect(sumarDiasFecha('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasFecha('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('calcula el lunes de la semana ISO', () => {
    expect(inicioSemanaFecha('2026-11-06')).toBe('2026-11-02');
    expect(inicioSemanaFecha('2026-11-02')).toBe('2026-11-02');
    expect(inicioSemanaFecha('2026-11-08')).toBe('2026-11-02');
  });
});
