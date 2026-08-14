import { describe, expect, it } from 'vitest';
import {
  calcularHorasComida,
  calcularHorasSesion,
} from '@/modulos/produccion/servicios/indice';

describe('cálculo de comida de Producción', () => {
  it('descuenta exactamente una hora en una sesión 08:00–16:00 de Tijuana', () => {
    const calculo = calcularHorasSesion(
      new Date('2026-08-14T15:00:00.000Z'),
      new Date('2026-08-14T23:00:00.000Z'),
    );

    expect(calculo).toEqual({ horasBrutas: 8, horasComida: 1, horasNetas: 7 });
  });

  it('descuenta solo el solapamiento real de una sesión parcial', () => {
    expect(calcularHorasSesion(
      new Date('2026-08-14T19:30:00.000Z'),
      new Date('2026-08-14T19:45:00.000Z'),
    )).toEqual({ horasBrutas: 0.25, horasComida: 0.25, horasNetas: 0 });
  });

  it('no descuenta comida fuera del intervalo local', () => {
    expect(calcularHorasSesion(
      new Date('2026-08-14T15:00:00.000Z'),
      new Date('2026-08-14T18:00:00.000Z'),
    )).toEqual({ horasBrutas: 3, horasComida: 0, horasNetas: 3 });
  });

  it('acumula correctamente la comida de sesiones que cruzan medianoche', () => {
    expect(calcularHorasComida(
      new Date('2026-08-14T18:00:00.000Z'),
      new Date('2026-08-15T21:00:00.000Z'),
    )).toBe(2);
  });

  it('rechaza un intervalo temporal invertido', () => {
    expect(() => calcularHorasSesion(
      new Date('2026-08-14T23:00:00.000Z'),
      new Date('2026-08-14T15:00:00.000Z'),
    )).toThrow('rango de sesión no es válido');
  });
});
