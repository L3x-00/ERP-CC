import { describe, expect, it } from 'vitest';

import {
  horasTranscurridasSesion,
  sesionCercaDeJornada,
} from '@/modulos/produccion/utilidades/horas-extra';

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

  it('avisa cuando la sesión alcanza la jornada', () => {
    const inicio = '2026-11-02T08:00:00.000Z';
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T15:59:00.000Z'))).toBe(false);
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T16:00:00.000Z'))).toBe(true);
    expect(sesionCercaDeJornada(inicio, new Date('2026-11-02T17:00:00.000Z'), 10)).toBe(false);
  });
});
