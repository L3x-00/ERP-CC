import { describe, expect, it } from 'vitest';

import {
  ahoraHoraInputNegocio,
  horaFinEsFutura,
} from '@/modulos/produccion/utilidades/horas-extra';
import {
  ErrorProduccion,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

describe('A20.1 — hora de conclusión en zona del taller', () => {
  it('precarga la hora de Tijuana aunque el proceso esté en otra zona', () => {
    expect(ahoraHoraInputNegocio(new Date('2026-11-21T03:01:00.000Z'))).toBe('19:01');
    expect(ahoraHoraInputNegocio(new Date('2026-07-01T18:00:00.000Z'))).toBe('11:00');
  });

  it('detecta una hora adelantada más allá de los dos minutos de tolerancia', () => {
    const ahora = new Date('2026-11-21T03:01:00.000Z');
    expect(horaFinEsFutura('19:01', '2026-11-20', ahora)).toBe(false);
    expect(horaFinEsFutura('19:03', '2026-11-20', ahora)).toBe(false);
    expect(horaFinEsFutura('19:10', '2026-11-20', ahora)).toBe(true);
  });

  it('no marca como futura una hora de un día anterior', () => {
    expect(horaFinEsFutura('11:00', '2026-10-28', new Date('2026-11-20T20:00:00.000Z')))
      .toBe(false);
  });
});

describe('A20.3 — mensaje concreto para la hora adelantada', () => {
  it('explica qué pasó en lugar de mostrar el código o un texto corto', () => {
    expect(mensajeErrorSesion(new ErrorProduccion('fecha_fin_futura')))
      .toContain('La hora de conclusión está adelantada');
  });
});
