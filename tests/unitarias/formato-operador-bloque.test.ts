import { describe, expect, it } from 'vitest';
import {
  duracionLegible,
  horasBloquePausa,
} from '@/modulos/produccion/utilidades/formato-operador';

describe('horasBloquePausa', () => {
  it('trunca a minutos completos para no superar la duración real', () => {
    // 4 min 30 s: el servidor acepta como máximo 0.075 h. Redondear a dos
    // decimales daba 0.08 h y el reintento volvía a fallar.
    const horas = horasBloquePausa({
      fechaInicio: '2026-11-18T10:55:30.000Z',
      fechaFin: '2026-11-18T11:00:00.000Z',
    });

    expect(horas).not.toBeNull();
    expect(horas!).toBeCloseTo(4 / 60, 10);
    expect(horas!).toBeLessThanOrEqual(0.075);
  });

  it('conserva la duración exacta cuando son horas completas', () => {
    expect(horasBloquePausa({
      fechaInicio: '2026-11-18T09:00:00.000Z',
      fechaFin: '2026-11-18T11:00:00.000Z',
    })).toBe(2);
  });

  it('no inventa duración sin fecha de fin o con fechas invertidas', () => {
    expect(horasBloquePausa({
      fechaInicio: '2026-11-18T09:00:00.000Z',
      fechaFin: null,
    })).toBeNull();
    expect(horasBloquePausa({
      fechaInicio: '2026-11-18T11:00:00.000Z',
      fechaFin: '2026-11-18T09:00:00.000Z',
    })).toBeNull();
  });
});

describe('duracionLegible', () => {
  it('expresa bloques cortos en minutos', () => {
    expect(duracionLegible(4 / 60)).toBe('4 min');
    expect(duracionLegible(0.5)).toBe('30 min');
  });

  it('usa horas cuando el bloque pasa de una hora', () => {
    expect(duracionLegible(2)).toBe('2 h');
    expect(duracionLegible(1.5)).toBe('1.5 h');
  });

  it('avisa cuando el bloque no llega al minuto', () => {
    expect(duracionLegible(0)).toBe('menos de 1 min');
  });
});
