import { describe, expect, it } from 'vitest';
import {
  UMBRAL_OCUPACION_SOBRECARGA,
  calcularHolguraHastaFecha,
  calcularHolguraHoras,
  calcularHorasDisponibles,
  calcularPorcentajeOcupacion,
  clasificarSaturacion,
  detectarCuellosBotella,
  evaluarAsignacionTurno,
  evaluarCargaRecursoTurno,
  puedeAbsorberHoras,
  seleccionarPrimerHueco,
  type CargaRecursoTurno,
} from '@/modulos/planeacion/servicios/indice';

const cargaBase: CargaRecursoTurno = {
  recursoId: '11111111-1111-4111-8111-111111111111',
  fechaProgramada: '2026-09-15',
  turno: 'matutino',
  horasCapacidad: 8,
  horasProgramadas: 4,
};

describe('cálculos de disponibilidad de Planeación', () => {
  it('calcula horas disponibles y holgura con signo', () => {
    expect(calcularHorasDisponibles(8, 5.25)).toBe(2.75);
    expect(calcularHolguraHoras(8, 5.25)).toBe(2.75);
    expect(calcularHorasDisponibles(8, 10)).toBe(0);
    expect(calcularHolguraHoras(8, 10)).toBe(-2);
  });

  it('calcula porcentaje de ocupación con precisión estable', () => {
    expect(calcularPorcentajeOcupacion(8, 4)).toBe(50);
    expect(calcularPorcentajeOcupacion(6, 4)).toBeCloseTo(66.67, 2);
    expect(calcularPorcentajeOcupacion(8, 10)).toBe(125);
  });

  it('no propaga NaN o Infinity con capacidad cero o datos degradados', () => {
    const porcentajeSinCarga = calcularPorcentajeOcupacion(0, 0);
    const porcentajeConCarga = calcularPorcentajeOcupacion(0, 2);
    const evaluada = evaluarCargaRecursoTurno({
      ...cargaBase,
      horasCapacidad: Number.NaN,
      horasProgramadas: Number.POSITIVE_INFINITY,
    });

    expect(porcentajeSinCarga).toBe(0);
    expect(porcentajeConCarga).toBe(UMBRAL_OCUPACION_SOBRECARGA);
    expect(Number.isFinite(porcentajeConCarga)).toBe(true);
    expect(evaluada).toMatchObject({
      horasCapacidad: 0,
      horasProgramadas: 0,
      horasDisponibles: 0,
      holguraHoras: 0,
      porcentajeOcupacion: 0,
      clasificacion: 'libre',
    });
  });

  it('clasifica los límites de saturación sin que la UI autorice programación', () => {
    expect(clasificarSaturacion(8, 0)).toBe('libre');
    expect(clasificarSaturacion(8, 5)).toBe('holgado');
    expect(clasificarSaturacion(10, 7)).toBe('ajustado');
    expect(clasificarSaturacion(10, 9)).toBe('saturado');
    expect(clasificarSaturacion(8, 8.1)).toBe('sobrecargado');
    expect(clasificarSaturacion(0, 1)).toBe('sobrecargado');
  });

  it('previsualiza holgura sin sustituir la aceptación de PostgreSQL', () => {
    expect(puedeAbsorberHoras(cargaBase, 4)).toBe(true);
    expect(puedeAbsorberHoras(cargaBase, 4.01)).toBe(false);
    expect(puedeAbsorberHoras({ ...cargaBase, horasCapacidad: 0, horasProgramadas: 1 }, 0)).toBe(
      false,
    );
  });
});

describe('cuellos de botella y holgura de fecha compromiso', () => {
  const cargas: CargaRecursoTurno[] = [
    { ...cargaBase, recursoId: 'recurso-holgado', horasProgramadas: 4 },
    { ...cargaBase, recursoId: 'recurso-saturado', horasProgramadas: 7.2 },
    { ...cargaBase, recursoId: 'recurso-sobrecargado', horasProgramadas: 10 },
    {
      ...cargaBase,
      recursoId: 'recurso-saturado-2',
      fechaProgramada: '2026-09-16',
      horasProgramadas: 7.2,
    },
  ];

  it('detecta y ordena cuellos por criticidad de modo determinista', () => {
    const resultado = detectarCuellosBotella(cargas);

    expect(resultado.map((carga) => carga.recursoId)).toEqual([
      'recurso-sobrecargado',
      'recurso-saturado',
      'recurso-saturado-2',
    ]);
    expect(resultado[0]).toMatchObject({ sobrecargado: true, holguraHoras: -2 });
  });

  it('acepta umbral y límite sin resultados no deterministas', () => {
    expect(detectarCuellosBotella(cargas, { umbralPorcentaje: 50, limite: 2 })).toHaveLength(2);
    expect(detectarCuellosBotella(cargas, { limite: 0 })).toEqual([]);
    expect(detectarCuellosBotella(cargas, { limite: Number.NaN })).toEqual([]);
  });

  it('suma la holgura solo hasta la fecha de compromiso inclusiva', () => {
    const resultado = calcularHolguraHastaFecha(cargas, '2026-09-15');

    expect(resultado).toEqual({
      fechaCompromiso: '2026-09-15',
      horasCapacidad: 24,
      horasProgramadas: 21.2,
      holguraHoras: 2.8,
      sobrecargado: false,
    });
  });

  it('marca sobrecarga acumulada antes del compromiso', () => {
    const resultado = calcularHolguraHastaFecha(
      [
        { ...cargaBase, horasCapacidad: 8, horasProgramadas: 9 },
        { ...cargaBase, recursoId: 'recurso-2', horasCapacidad: 6, horasProgramadas: 7 },
      ],
      '2026-09-15',
    );

    expect(resultado.holguraHoras).toBe(-2);
    expect(resultado.sobrecargado).toBe(true);
  });
});

describe('previsualización de asignación y primer hueco (OBS-18/OBS-19)', () => {
  const cargaOcupada: CargaRecursoTurno = {
    recursoId: 'recurso-1',
    fechaProgramada: '2026-09-18',
    turno: 'matutino',
    horasCapacidad: 8,
    horasProgramadas: 4,
  };

  it('evalúa las horas que quedarían tras guardar sin autorizar la escritura', () => {
    expect(evaluarAsignacionTurno(cargaOcupada, 4)).toMatchObject({
      horasCapacidad: 8,
      horasProgramadas: 8,
      horasDisponibles: 4,
      holguraHoras: 0,
      cabe: true,
      clasificacion: 'saturado',
    });
    expect(evaluarAsignacionTurno(cargaOcupada, 4.01).cabe).toBe(false);
  });

  it('descuenta la programación que se mueve dentro del mismo slot', () => {
    const evaluacion = evaluarAsignacionTurno(cargaOcupada, 4, { horasEnSlot: 4 });

    expect(evaluacion).toMatchObject({
      horasProgramadas: 4,
      horasDisponibles: 8,
      holguraHoras: 4,
      cabe: true,
    });
  });

  it('no declara capacidad cuando el turno no tiene configuración', () => {
    const evaluacion = evaluarAsignacionTurno(undefined, 2);

    expect(evaluacion).toMatchObject({
      horasCapacidad: 0,
      sinCapacidad: true,
      cabe: false,
    });
  });

  it('propone el primer día hábil con hueco y omite el fin de semana', () => {
    // 2026-09-18 es viernes; sábado y domingo no se proponen aunque tengan hueco.
    const cargas: CargaRecursoTurno[] = [
      { ...cargaOcupada, horasProgramadas: 8 },
      { ...cargaOcupada, fechaProgramada: '2026-09-19', horasProgramadas: 0 },
      { ...cargaOcupada, fechaProgramada: '2026-09-20', horasProgramadas: 0 },
      { ...cargaOcupada, fechaProgramada: '2026-09-21', horasProgramadas: 6 },
    ];

    expect(
      seleccionarPrimerHueco(cargas, {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasEstimadas: 2,
        desdeFecha: '2026-09-18',
      }),
    ).toMatchObject({
      fecha: '2026-09-21',
      horasCapacidad: 8,
      horasDisponibles: 2,
      holguraHoras: 0,
    });
  });

  it('no propone nada sin hueco, sin horas o para otro recurso/turno', () => {
    const cargas: CargaRecursoTurno[] = [
      { ...cargaOcupada, horasProgramadas: 8 },
      { ...cargaOcupada, fechaProgramada: '2026-09-19', horasProgramadas: 8 },
      { ...cargaOcupada, fechaProgramada: '2026-09-20', horasProgramadas: 8 },
    ];

    expect(
      seleccionarPrimerHueco(cargas, {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasEstimadas: 1,
        desdeFecha: '2026-09-18',
      }),
    ).toBeNull();
    expect(
      seleccionarPrimerHueco(cargas, {
        recursoId: 'recurso-1',
        turno: 'matutino',
        horasEstimadas: 0,
        desdeFecha: '2026-09-18',
      }),
    ).toBeNull();
    expect(
      seleccionarPrimerHueco(cargas, {
        recursoId: 'recurso-2',
        turno: 'nocturno',
        horasEstimadas: 1,
        desdeFecha: '2026-09-18',
      }),
    ).toBeNull();
  });
});
