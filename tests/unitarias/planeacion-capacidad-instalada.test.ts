import { describe, expect, it } from 'vitest';
import {
  JORNADA_ESTANDAR_HORAS,
  capacidadInstaladaHoras,
  jornadaBaseHoras,
} from '@/modulos/planeacion/utilidades/capacidad';

describe('jornadaBaseHoras (D-02 capacidad instalada)', () => {
  it('usa el override válido por encima de los turnos', () => {
    expect(jornadaBaseHoras([5, 4], 6)).toBe(6);
    expect(jornadaBaseHoras([5, 4], 2.5)).toBe(2.5);
  });

  it('acota el override a la jornada completa de 8 h', () => {
    expect(jornadaBaseHoras([], 12.5)).toBe(8);
    expect(jornadaBaseHoras([], 9)).toBe(8);
  });

  it('sin override suma los turnos del día con tope de 8 h', () => {
    expect(jornadaBaseHoras([2, 3], null)).toBe(5);
    expect(jornadaBaseHoras([5, 4], null)).toBe(8);
    expect(jornadaBaseHoras([6, 6], null)).toBe(8);
  });

  it('cae a la jornada estándar de 8 h sin datos válidos', () => {
    expect(jornadaBaseHoras([], null)).toBe(JORNADA_ESTANDAR_HORAS);
    expect(jornadaBaseHoras([0, Number.NaN], 0)).toBe(JORNADA_ESTANDAR_HORAS);
  });
});

describe('capacidadInstaladaHoras (D-02 capacidad instalada)', () => {
  it('multiplica equipos por jornada', () => {
    expect(capacidadInstaladaHoras(3, 5)).toBe(15);
    expect(capacidadInstaladaHoras(2, 6.5)).toBe(13);
    expect(capacidadInstaladaHoras(1, 7.25)).toBe(7.25);
  });

  it('devuelve 0 ante equipos o jornada inválidos', () => {
    expect(capacidadInstaladaHoras(0, 8)).toBe(0);
    expect(capacidadInstaladaHoras(3, 0)).toBe(0);
    expect(capacidadInstaladaHoras(Number.NaN, 8)).toBe(0);
  });
});
