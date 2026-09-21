import { describe, expect, it } from 'vitest';
import {
  JORNADA_ESTANDAR_HORAS,
  capacidadInstaladaHoras,
  jornadaBaseHoras,
} from '@/modulos/planeacion/utilidades/capacidad';

describe('jornadaBaseHoras (D-02 capacidad instalada)', () => {
  it('usa el override válido por encima de los turnos', () => {
    expect(jornadaBaseHoras([8, 8], 6)).toBe(6);
    expect(jornadaBaseHoras([], 12.5)).toBe(12.5);
  });

  it('sin override usa la mayor capacidad de turno', () => {
    expect(jornadaBaseHoras([8, 6.5, 8], null)).toBe(8);
    expect(jornadaBaseHoras([4, 5], null)).toBe(5);
  });

  it('cae a la jornada estándar de 8 h sin datos válidos', () => {
    expect(jornadaBaseHoras([], null)).toBe(JORNADA_ESTANDAR_HORAS);
    expect(jornadaBaseHoras([0, Number.NaN], 0)).toBe(JORNADA_ESTANDAR_HORAS);
  });
});

describe('capacidadInstaladaHoras (D-02 capacidad instalada)', () => {
  it('multiplica equipos por jornada', () => {
    expect(capacidadInstaladaHoras(3, 8)).toBe(24);
    expect(capacidadInstaladaHoras(2, 6.5)).toBe(13);
    expect(capacidadInstaladaHoras(1, 7.25)).toBe(7.25);
  });

  it('devuelve 0 ante equipos o jornada inválidos', () => {
    expect(capacidadInstaladaHoras(0, 8)).toBe(0);
    expect(capacidadInstaladaHoras(3, 0)).toBe(0);
    expect(capacidadInstaladaHoras(Number.NaN, 8)).toBe(0);
  });
});
