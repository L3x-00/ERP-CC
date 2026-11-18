import { describe, expect, it } from 'vitest';
import type { CargaCapacidadDiaria, RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import {
  construirMatrizCargaSemanal,
  formatearHoras,
} from '@/modulos/planeacion/utilidades/carga-semanal';

const RECURSO_A: RecursoPlaneacion = {
  id: '11111111-1111-4111-8111-111111111111',
  codigo: 'CNC-01',
  nombre: 'CNC principal',
  area: 'taller',
  activo: true,
  creadoEn: '2026-09-01T12:00:00.000Z',
  actualizadoEn: '2026-09-01T12:00:00.000Z',
};

const RECURSO_B: RecursoPlaneacion = {
  ...RECURSO_A,
  id: '22222222-2222-4222-8222-222222222222',
  codigo: 'IMP-02',
  nombre: 'Impresora láser',
  area: 'acabados',
};

/** Rango lunes 21 a domingo 27 de septiembre de 2026. */
const RANGO_SEMANA = { fechaInicio: '2026-09-21', fechaFin: '2026-09-27' };

function carga(
  recursoId: string,
  fechaProgramada: string,
  turno: CargaCapacidadDiaria['turno'],
  horasCapacidad: number,
  horasProgramadas: number,
): CargaCapacidadDiaria {
  return {
    recursoId,
    area: 'taller',
    fechaProgramada,
    turno,
    horasCapacidad,
    horasProgramadas,
    horasReales: 0,
    horasExceso: 0,
    horasDisponibles: Math.max(0, horasCapacidad - horasProgramadas),
    porcentajeOcupacion:
      horasProgramadas === 0
        ? 0
        : horasCapacidad === 0
          ? 100
          : Math.round((horasProgramadas / horasCapacidad) * 10000) / 100,
    sobrecargado: horasProgramadas > horasCapacidad,
  };
}

describe('matriz de carga semanal (C9.1)', () => {
  it('suma los turnos del día: 5+4 h de capacidad con 3+2 h programadas dan 5/9 y 4 h libres', () => {
    const matriz = construirMatrizCargaSemanal(
      [
        carga(RECURSO_A.id, '2026-09-21', 'matutino', 5, 3),
        carga(RECURSO_A.id, '2026-09-21', 'vespertino', 4, 2),
      ],
      [RECURSO_A],
      RANGO_SEMANA,
    );

    expect(matriz).not.toBeNull();
    expect(matriz?.columnas).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(matriz?.filas).toHaveLength(1);
    expect(matriz?.filas[0]).toMatchObject({
      recursoId: RECURSO_A.id,
      sinCapacidad: false,
      horasLibresTotales: 4,
    });
    expect(matriz?.filas[0].celdas[0]).toMatchObject({
      fecha: '2026-09-21',
      horasCapacidad: 9,
      horasProgramadas: 5,
      horasLibres: 4,
      nivel: 'cerca-del-limite',
    });
    expect(matriz?.filas[0].celdas[1]).toBeNull();
  });

  it('un turno sobrecargado aporta 0 h libres sin restar a los demás turnos del día', () => {
    const matriz = construirMatrizCargaSemanal(
      [
        carga(RECURSO_A.id, '2026-09-21', 'matutino', 5, 7),
        carga(RECURSO_A.id, '2026-09-21', 'vespertino', 4, 0),
      ],
      [RECURSO_A],
      RANGO_SEMANA,
    );

    expect(matriz?.filas[0].celdas[0]).toMatchObject({
      horasCapacidad: 9,
      horasProgramadas: 7,
      horasLibres: 4,
      nivel: 'sobrecargado',
    });
    expect(matriz?.filas[0].horasLibresTotales).toBe(4);
  });

  it('muestra el sábado como día laboral (4 h) y no inventa el domingo cerrado', () => {
    // C18: la RPC entrega lunes a viernes 5+4 h y el sábado 4 h; el domingo no
    // llega porque está cerrado. El sábado debe sumar a la capacidad libre.
    const cargas: CargaCapacidadDiaria[] = [];
    for (const fecha of [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]) {
      cargas.push(carga(RECURSO_A.id, fecha, 'matutino', 5, 0));
      cargas.push(carga(RECURSO_A.id, fecha, 'vespertino', 4, 0));
    }
    cargas.push(carga(RECURSO_A.id, '2026-09-26', 'matutino', 4, 0));

    const matriz = construirMatrizCargaSemanal(cargas, [RECURSO_A], RANGO_SEMANA);

    expect(matriz?.columnas).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    expect(matriz?.filas[0].horasLibresTotales).toBe(49);
  });

  it('solo pinta el domingo cuando por excepción tiene trabajo programado', () => {
    const matriz = construirMatrizCargaSemanal(
      [
        carga(RECURSO_A.id, '2026-09-21', 'matutino', 5, 0),
        carga(RECURSO_A.id, '2026-09-27', 'matutino', 0, 2),
      ],
      [RECURSO_A],
      RANGO_SEMANA,
    );

    expect(matriz?.columnas).toContain('2026-09-27');
    expect(matriz?.filas[0].celdas.at(-1)).toMatchObject({
      fecha: '2026-09-27',
      horasProgramadas: 2,
      nivel: 'sobrecargado',
    });
  });

  it('muestra la carga del sábado dentro de su jornada de 4 h', () => {
    const cargas = [
      carga(RECURSO_A.id, '2026-09-21', 'matutino', 5, 0),
      carga(RECURSO_A.id, '2026-09-22', 'matutino', 5, 0),
      carga(RECURSO_A.id, '2026-09-23', 'matutino', 5, 0),
      carga(RECURSO_A.id, '2026-09-24', 'matutino', 5, 0),
      carga(RECURSO_A.id, '2026-09-25', 'matutino', 5, 0),
      carga(RECURSO_A.id, '2026-09-26', 'matutino', 4, 2),
    ];

    const matriz = construirMatrizCargaSemanal(cargas, [RECURSO_A], RANGO_SEMANA);

    expect(matriz?.columnas).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    expect(matriz?.filas[0].celdas[5]).toMatchObject({
      fecha: '2026-09-26',
      horasCapacidad: 4,
      horasProgramadas: 2,
      horasLibres: 2,
      nivel: 'cerca-del-limite',
    });
    expect(matriz?.filas[0].horasLibresTotales).toBe(27);
  });

  it('un recurso sin capacidad configurada se declara sinCapacidad, con celdas alineadas', () => {
    const matriz = construirMatrizCargaSemanal(
      [carga(RECURSO_A.id, '2026-09-21', 'matutino', 8, 4)],
      [RECURSO_A, RECURSO_B],
      RANGO_SEMANA,
    );

    expect(matriz?.filas).toHaveLength(2);
    const filaB = matriz?.filas[1];
    expect(filaB).toMatchObject({
      recursoId: RECURSO_B.id,
      sinCapacidad: true,
      horasLibresTotales: 0,
    });
    expect(filaB?.celdas).toHaveLength(matriz?.columnas.length ?? 0);
    expect(filaB?.celdas.every((celda) => celda === null)).toBe(true);
  });

  it('el nivel de la celda es el peor turno del día', () => {
    const matriz = construirMatrizCargaSemanal(
      [
        carga(RECURSO_A.id, '2026-09-21', 'matutino', 8, 6),
        carga(RECURSO_A.id, '2026-09-21', 'vespertino', 8, 9),
        carga(RECURSO_A.id, '2026-09-22', 'matutino', 8, 6),
      ],
      [RECURSO_A],
      RANGO_SEMANA,
    );

    expect(matriz?.filas[0].celdas[0]?.nivel).toBe('sobrecargado');
    expect(matriz?.filas[0].celdas[1]?.nivel).toBe('cerca-del-limite');
  });

  it('un rango de 7 días no alineado a lunes conserva las fechas reales del rango', () => {
    // Martes 15 a lunes 21: el sábado 19 es laboral (4 h) y el domingo 20 está
    // cerrado, así que la RPC no devuelve fila para ese domingo.
    const cargas: CargaCapacidadDiaria[] = [];
    for (const fecha of ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21']) {
      cargas.push(carga(RECURSO_A.id, fecha, 'matutino', 5, 0));
    }
    cargas.push(carga(RECURSO_A.id, '2026-09-19', 'matutino', 4, 0));

    const matriz = construirMatrizCargaSemanal(cargas, [RECURSO_A], {
      fechaInicio: '2026-09-15',
      fechaFin: '2026-09-21',
    });

    expect(matriz?.columnas).toEqual([
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-21',
    ]);
  });

  it('un rango mayor a 7 días no produce matriz', () => {
    const matriz = construirMatrizCargaSemanal(
      [carga(RECURSO_A.id, '2026-09-21', 'matutino', 8, 4)],
      [RECURSO_A],
      { fechaInicio: '2026-09-01', fechaFin: '2026-09-30' },
    );

    expect(matriz).toBeNull();
  });

  it('respeta el filtro de recurso: solo su fila y las fechas de sus cargas', () => {
    const matriz = construirMatrizCargaSemanal(
      [
        carga(RECURSO_A.id, '2026-09-21', 'matutino', 8, 4),
        carga(RECURSO_B.id, '2026-09-23', 'matutino', 8, 3),
      ],
      [RECURSO_A, RECURSO_B],
      RANGO_SEMANA,
      RECURSO_B.id,
    );

    expect(matriz?.filas).toHaveLength(1);
    expect(matriz?.filas[0].recursoId).toBe(RECURSO_B.id);
    expect(matriz?.columnas).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(matriz?.filas[0].celdas[2]).toMatchObject({
      fecha: '2026-09-23',
      horasProgramadas: 3,
    });
  });

  it('formatea horas sin decimales decorativos', () => {
    expect(formatearHoras(16)).toBe('16');
    expect(formatearHoras(7.5)).toBe('7.5');
    expect(formatearHoras(2.75)).toBe('2.75');
    expect(formatearHoras(Number.NaN)).toBe('0');
  });
});
