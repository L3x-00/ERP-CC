import { describe, expect, it } from 'vitest';

import {
  horasTranscurridasSesion,
  sesionCercaDeJornada,
} from '@/modulos/produccion/utilidades/horas-extra';
import { fechaHoraLocalTallerAIso } from '@/modulos/produccion/servicios/indice';

describe('aviso de horas extra', () => {
  it('calcula las horas transcurridas desde el inicio de la sesión', () => {
    expect(
      horasTranscurridasSesion('2026-11-02T08:00:00.000Z', new Date('2026-11-02T15:30:00.000Z')),
    ).toBeCloseTo(7.5);
  });

  it('nunca devuelve horas negativas ni NaN', () => {
    expect(horasTranscurridasSesion('2026-11-02T08:00:00.000Z', new Date('2026-11-02T07:00:00.000Z'))).toBe(0);
    expect(horasTranscurridasSesion('no-es-fecha', new Date())).toBe(0);
  });

  it('avisa cuando la sesión alcanza la jornada de 8 h', () => {
    const inicio = '2026-11-02T08:00:00.000Z';
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T15:59:00.000Z'))).toBe(false);
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T16:00:00.000Z'))).toBe(true);
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T17:00:00.000Z'), 10)).toBe(false);
  });
});

describe('C20: hora real de finalización', () => {
  it('convierte la hora local del taller respetando el horario de verano', () => {
    // Noviembre: Tijuana ya está en PST (UTC-8).
    expect(fechaHoraLocalTallerAIso('2026-11-02T17:00')).toBe('2026-11-03T01:00:00.000Z');
    // Junio: Tijuana está en PDT (UTC-7).
    expect(fechaHoraLocalTallerAIso('2026-06-15T17:00')).toBe('2026-06-16T00:00:00.000Z');
  });

  it('rechaza un formato distinto de datetime-local', () => {
    expect(() => fechaHoraLocalTallerAIso('17:00')).toThrow();
  });
});
