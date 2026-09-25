import { describe, expect, it } from 'vitest';
import {
  elegirHueco,
  horasSugeridas,
  siguienteSecuencia,
} from '@/modulos/planeacion/servicios/indice';
import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';

function carga(parcial: Partial<CargaCapacidadDiaria> & {
  recursoId: string;
  fechaProgramada: string;
  turno: CargaCapacidadDiaria['turno'];
  horasDisponibles: number;
}): CargaCapacidadDiaria {
  return {
    area: 'taller',
    horasCapacidad: 8,
    horasProgramadas: 8 - parcial.horasDisponibles,
    porcentajeOcupacion: 0,
    sobrecargado: false,
    ...parcial,
  };
}

describe('PLA-05: bolsa de trabajo y huecos', () => {
  it('sugiere horas con mínimo de un cuarto y redondeo a dos decimales', () => {
    expect(horasSugeridas(0)).toBe(0.25);
    expect(horasSugeridas(7)).toBe(0.25);
    expect(horasSugeridas(60)).toBe(1);
    expect(horasSugeridas(90)).toBe(1.5);
    expect(horasSugeridas(95)).toBe(1.58);
  });

  it('calcula la siguiente secuencia libre de la partida', () => {
    expect(siguienteSecuencia([])).toBe(1);
    expect(siguienteSecuencia([1, 3, 2])).toBe(4);
  });

  it('elige el primer hueco por fecha, turno y código de recurso', () => {
    const codigos = new Map([['r2', 'B'], ['r1', 'A']]);
    const hueco = elegirHueco(2, [
      carga({ recursoId: 'r2', fechaProgramada: '2026-10-02', turno: 'matutino', horasDisponibles: 3 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'nocturno', horasDisponibles: 4 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'matutino', horasDisponibles: 1.5 }),
    ], codigos);
    expect(hueco?.carga.recursoId).toBe('r1');
    expect(hueco?.carga.turno).toBe('nocturno');
    expect(hueco?.horasDisponibles).toBe(4);
  });

  it('descarta huecos saturados o sin capacidad suficiente', () => {
    const codigos = new Map([['r1', 'A'], ['r2', 'B']]);
    expect(elegirHueco(3, [
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'matutino', horasDisponibles: 2 }),
      carga({
        recursoId: 'r2', fechaProgramada: '2026-10-01', turno: 'matutino',
        horasDisponibles: 6, sobrecargado: true,
      }),
    ], codigos)).toBeNull();
  });

  it('prefiere la fecha más próxima aunque el recurso tenga otro código', () => {
    const codigos = new Map([['r1', 'Z'], ['r2', 'A']]);
    const hueco = elegirHueco(1, [
      carga({ recursoId: 'r2', fechaProgramada: '2026-10-05', turno: 'matutino', horasDisponibles: 5 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'vespertino', horasDisponibles: 5 }),
    ], codigos);
    expect(hueco?.carga.fechaProgramada).toBe('2026-10-01');
  });
});
