import { describe, expect, it } from 'vitest';

import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import {
  recomendarPlanMultidia,
  validarPlanMultidia,
} from '@/modulos/planeacion/utilidades/plan-multidia';

function carga(
  fecha: string,
  parcial: Partial<CargaCapacidadDiaria> = {},
): CargaCapacidadDiaria {
  return {
    recursoId: 'recurso-1',
    area: 'taller',
    fechaProgramada: fecha,
    turno: 'matutino',
    horasCapacidad: 8,
    horasProgramadas: 0,
    horasReales: 0,
    horasExceso: 0,
    horasDisponibles: 8,
    porcentajeOcupacion: 0,
    sobrecargado: false,
    ...parcial,
  } as CargaCapacidadDiaria;
}

describe('plan de varios días para una operación', () => {
  it('reparte 15.25 h en dos jornadas de 8 h', () => {
    const plan = recomendarPlanMultidia(
      [carga('2026-11-16'), carga('2026-11-17')],
      {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasTotales: 15.25,
        desdeFecha: '2026-11-16',
      },
    );

    expect(plan).toEqual([
      { fecha: '2026-11-16', horas: 8 },
      { fecha: '2026-11-17', horas: 7.25 },
    ]);
  });

  it('omite fines de semana y días ya saturados', () => {
    const plan = recomendarPlanMultidia(
      [
        carga('2026-11-14'), // sábado
        carga('2026-11-16', { horasDisponibles: 0, horasProgramadas: 8 }),
        carga('2026-11-17', { horasDisponibles: 5 }),
        carga('2026-11-18', { horasDisponibles: 8 }),
      ],
      {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasTotales: 10,
        desdeFecha: '2026-11-14',
      },
    );

    expect(plan).toEqual([
      { fecha: '2026-11-17', horas: 5 },
      { fecha: '2026-11-18', horas: 5 },
    ]);
  });

  it('no propone nada si el horizonte no alcanza', () => {
    expect(recomendarPlanMultidia(
      [carga('2026-11-16', { horasDisponibles: 4 })],
      {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasTotales: 9,
        desdeFecha: '2026-11-16',
      },
    )).toBeNull();
  });

  it('valida que el plan sume exactamente las horas de la operación', () => {
    expect(validarPlanMultidia(
      [{ fecha: '2026-11-16', horas: 8 }, { fecha: '2026-11-17', horas: 7.25 }],
      15.25,
    )).toBeNull();
    expect(validarPlanMultidia(
      [{ fecha: '2026-11-16', horas: 8 }, { fecha: '2026-11-17', horas: 6 }],
      15.25,
    )).toContain('suma 14 h');
    expect(validarPlanMultidia(
      [{ fecha: '2026-11-16', horas: 8 }, { fecha: '2026-11-16', horas: 7.25 }],
      15.25,
    )).toContain('repetir');
  });
});
