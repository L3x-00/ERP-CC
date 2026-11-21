import { describe, expect, it } from 'vitest';
import {
  avisoHorasComida,
  duracionLegible,
  horasBloquePausa,
  maximoHorasVisiblesBloque,
  tiempoAcumuladoLegible,
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

describe('maximoHorasVisiblesBloque', () => {
  it('nunca devuelve 0 para un bloque de menos de un minuto', () => {
    expect(maximoHorasVisiblesBloque(0)).toBeCloseTo(1 / 60, 10);
    expect(maximoHorasVisiblesBloque(0)).toBeGreaterThan(0);
  });

  it('conserva el techo real cuando hay minutos completos y no inventa uno sin fecha', () => {
    expect(maximoHorasVisiblesBloque(1.5)).toBe(1.5);
    expect(maximoHorasVisiblesBloque(null)).toBeUndefined();
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

describe('tiempoAcumuladoLegible', () => {
  it('expresa el acumulado en horas y minutos, sin decimales confusos', () => {
    expect(tiempoAcumuladoLegible(2.25)).toBe('2 h 15 min');
    expect(tiempoAcumuladoLegible(0.91)).toBe('55 min');
    expect(tiempoAcumuladoLegible(0)).toBe('0 min');
  });
});

describe('avisoHorasComida', () => {
  it('explica las cero horas cuando el bloque cae dentro de la comida', () => {
    const aviso = avisoHorasComida({
      fechaInicio: '2026-11-20T20:15:48.000Z',
      fechaFin: '2026-11-20T20:48:44.000Z',
      horasBrutas: 0.55,
      horasNetas: 0,
    });

    expect(aviso).toContain('Este bloque coincidió con la comida, de 12:00 a 13:00');
    expect(aviso).toContain('Por eso aparecen 0 horas registradas');
    expect(aviso).toContain('corrige la hora de conclusión y vuelve a guardar');
  });

  it('no avisa si el bloque solo tocó la comida y registró horas', () => {
    expect(avisoHorasComida({
      fechaInicio: '2026-11-20T19:45:00.000Z',
      fechaFin: '2026-11-20T20:15:00.000Z',
      horasBrutas: 0.5,
      horasNetas: 0.25,
    })).toBeNull();
  });

  it('no avisa sin fechas o sin tiempo bruto', () => {
    expect(avisoHorasComida({
      fechaInicio: '2026-11-20T20:15:00.000Z',
      fechaFin: null,
      horasBrutas: 0.55,
      horasNetas: 0,
    })).toBeNull();
    expect(avisoHorasComida({
      fechaInicio: '2026-11-20T20:15:00.000Z',
      fechaFin: '2026-11-20T20:48:00.000Z',
      horasBrutas: 0,
      horasNetas: 0,
    })).toBeNull();
  });
});
