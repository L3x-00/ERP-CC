import { describe, expect, it } from 'vitest';
import {
  esquemaCambiarModoPreparacion,
  esquemaProgramarOrden,
} from '@/modulos/planeacion/validaciones/indice';
import {
  filaACapacidadRecursoTurno,
  filaAProgramacionArea,
  filaARecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import type {
  FilaCapacidadRecursoTurno,
  FilaProgramacionArea,
  FilaRecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

const uuidOrden = '11111111-1111-4111-8111-111111111111';
const uuidPartida = '22222222-2222-4222-8222-222222222222';
const uuidRecurso = '33333333-3333-4333-8333-333333333333';
const uuidProgramacion = '44444444-4444-4444-8444-444444444444';

const programacionValida = {
  ordenId: uuidOrden,
  partidaId: uuidPartida,
  recursoId: uuidRecurso,
  secuencia: 1,
  fechaProgramada: '2026-09-15',
  turno: 'matutino',
  horasEstimadas: 7.5,
};

describe('esquemaProgramarOrden', () => {
  it('acepta una programación válida y aplica prioridad 1 por defecto', () => {
    const resultado = esquemaProgramarOrden.safeParse(programacionValida);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.ordenPrioridad).toBe(1);
      expect(resultado.data.turno).toBe('matutino');
      expect(resultado.data.horasEstimadas).toBe(7.5);
    }
  });

  it('acepta prioridad explícita y el límite superior de horas', () => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      ordenPrioridad: 5,
      horasEstimadas: 24,
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.ordenPrioridad).toBe(5);
      expect(resultado.data.horasEstimadas).toBe(24);
    }
  });

  it.each([
    ['ordenId', 'orden-1'],
    ['partidaId', ''],
    ['recursoId', '33333333-3333-4333-8333'],
  ])('rechaza %s con UUID inválido', (campo, valor) => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      [campo]: valor,
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual([campo]);
    }
  });

  it.each(['15-09-2026', '2026-09-15T10:00:00.000Z', '2026-13-01', 'mañana'])(
    'rechaza fechaProgramada inválida: %s',
    (fecha) => {
      const resultado = esquemaProgramarOrden.safeParse({
        ...programacionValida,
        fechaProgramada: fecha,
      });

      expect(resultado.success).toBe(false);
    },
  );

  it.each(['nocturno_extra', 'MATUTINO', 'tercero', ''])(
    'rechaza turno fuera del contrato: %s',
    (turno) => {
      const resultado = esquemaProgramarOrden.safeParse({
        ...programacionValida,
        turno,
      });

      expect(resultado.success).toBe(false);
    },
  );

  it.each([0, -1, 1.5])('rechaza secuencia no entera positiva: %s', (secuencia) => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      secuencia,
    });

    expect(resultado.success).toBe(false);
  });

  it.each([0, -3, 24.5, 48])('rechaza horasEstimadas fuera de rango: %s', (horas) => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      horasEstimadas: horas,
    });

    expect(resultado.success).toBe(false);
  });

  it.each([0, -2, 2.7])('rechaza ordenPrioridad no entera positiva: %s', (prioridad) => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      ordenPrioridad: prioridad,
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza claves extra no declaradas en el contrato', () => {
    const resultado = esquemaProgramarOrden.safeParse({
      ...programacionValida,
      estadoPlaneacion: 'completada',
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza una programación sin recurso explícito', () => {
    const sinRecurso = { ...programacionValida };
    Reflect.deleteProperty(sinRecurso, 'recursoId');
    const resultado = esquemaProgramarOrden.safeParse(sinRecurso);

    expect(resultado.success).toBe(false);
  });
});

describe('esquemaCambiarModoPreparacion', () => {
  const cambioValido = {
    programacionId: uuidProgramacion,
    activar: true,
    actualizadoEnEsperado: '2026-08-13T18:30:00.000Z',
  };

  it('acepta un cambio con compare-and-set válido', () => {
    const resultado = esquemaCambiarModoPreparacion.safeParse(cambioValido);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.activar).toBe(true);
    }
  });

  it('acepta la desactivación del modo preparación', () => {
    const resultado = esquemaCambiarModoPreparacion.safeParse({
      ...cambioValido,
      activar: false,
    });

    expect(resultado.success).toBe(true);
  });

  it('rechaza programacionId con UUID inválido', () => {
    const resultado = esquemaCambiarModoPreparacion.safeParse({
      ...cambioValido,
      programacionId: 'programacion-1',
    });

    expect(resultado.success).toBe(false);
  });

  it.each(['2026-08-13', 'ayer', '13/08/2026 18:30'])(
    'rechaza actualizadoEnEsperado no ISO datetime: %s',
    (marca) => {
      const resultado = esquemaCambiarModoPreparacion.safeParse({
        ...cambioValido,
        actualizadoEnEsperado: marca,
      });

      expect(resultado.success).toBe(false);
    },
  );

  it('rechaza activar no booleano', () => {
    const resultado = esquemaCambiarModoPreparacion.safeParse({
      ...cambioValido,
      activar: 'si',
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza un cambio sin compare-and-set', () => {
    const sinMarca = { ...cambioValido };
    Reflect.deleteProperty(sinMarca, 'actualizadoEnEsperado');
    const resultado = esquemaCambiarModoPreparacion.safeParse(sinMarca);

    expect(resultado.success).toBe(false);
  });

  it('rechaza claves extra no declaradas en el contrato', () => {
    const resultado = esquemaCambiarModoPreparacion.safeParse({
      ...cambioValido,
      forzar: true,
    });

    expect(resultado.success).toBe(false);
  });
});

describe('mappers de Planeación', () => {
  const filaRecurso: FilaRecursoPlaneacion = {
    id: uuidRecurso,
    codigo: 'SM-LASER-01',
    nombre: 'Láser fibra 3kW',
    area: 'sheet_metal',
    activo: true,
    creado_en: '2026-08-01T12:00:00.000Z',
    actualizado_en: '2026-08-10T12:00:00.000Z',
  };

  const filaCapacidad: FilaCapacidadRecursoTurno = {
    recurso_id: uuidRecurso,
    turno: 'vespertino',
    horas_capacidad: 8,
    creado_en: '2026-08-01T12:00:00.000Z',
    actualizado_en: '2026-08-10T12:00:00.000Z',
  };

  const filaProgramacion: FilaProgramacionArea = {
    id: uuidProgramacion,
    orden_id: uuidOrden,
    partida_id: uuidPartida,
    recurso_id: uuidRecurso,
    secuencia: 2,
    fecha_programada: '2026-09-15',
    turno: 'nocturno',
    horas_estimadas: 6.25,
    orden_prioridad: 3,
    estado_planeacion: 'en_preparacion',
    creado_en: '2026-08-01T12:00:00.000Z',
    actualizado_en: '2026-08-10T12:00:00.000Z',
  };

  it('mapea un recurso a camelCase conservando área y estado activo', () => {
    expect(filaARecursoPlaneacion(filaRecurso)).toEqual({
      id: uuidRecurso,
      codigo: 'SM-LASER-01',
      nombre: 'Láser fibra 3kW',
      area: 'sheet_metal',
      activo: true,
      creadoEn: '2026-08-01T12:00:00.000Z',
      actualizadoEn: '2026-08-10T12:00:00.000Z',
    });
  });

  it('mapea capacidad por turno con horas numéricas', () => {
    const capacidad = filaACapacidadRecursoTurno(filaCapacidad);

    expect(capacidad.recursoId).toBe(uuidRecurso);
    expect(capacidad.turno).toBe('vespertino');
    expect(capacidad.horasCapacidad).toBe(8);
  });

  it('mapea una programación completa a camelCase', () => {
    expect(filaAProgramacionArea(filaProgramacion)).toEqual({
      id: uuidProgramacion,
      ordenId: uuidOrden,
      partidaId: uuidPartida,
      recursoId: uuidRecurso,
      secuencia: 2,
      fechaProgramada: '2026-09-15',
      turno: 'nocturno',
      horasEstimadas: 6.25,
      ordenPrioridad: 3,
      estadoPlaneacion: 'en_preparacion',
      creadoEn: '2026-08-01T12:00:00.000Z',
      actualizadoEn: '2026-08-10T12:00:00.000Z',
    });
  });

  it('mapea todas las áreas del contrato', () => {
    for (const area of ['sheet_metal', 'taller', 'acabados', 'ext']) {
      expect(filaARecursoPlaneacion({ ...filaRecurso, area }).area).toBe(area);
    }
  });

  it('mapea todos los estados del contrato', () => {
    for (const estado of [
      'programada',
      'en_preparacion',
      'en_proceso',
      'bloqueada',
      'completada',
      'cancelada',
    ]) {
      expect(
        filaAProgramacionArea({ ...filaProgramacion, estado_planeacion: estado })
          .estadoPlaneacion,
      ).toBe(estado);
    }
  });

  it('rechaza un área corrupta en el recurso', () => {
    expect(() => filaARecursoPlaneacion({ ...filaRecurso, area: 'pintura' })).toThrow(
      /área de recurso: pintura/,
    );
  });

  it('rechaza un turno corrupto en la capacidad', () => {
    expect(() =>
      filaACapacidadRecursoTurno({ ...filaCapacidad, turno: 'madrugada' }),
    ).toThrow(/turno de capacidad: madrugada/);
  });

  it('rechaza un turno corrupto en la programación', () => {
    expect(() => filaAProgramacionArea({ ...filaProgramacion, turno: '' })).toThrow(
      /turno de programación/,
    );
  });

  it('rechaza un estado de planeación corrupto', () => {
    expect(() =>
      filaAProgramacionArea({ ...filaProgramacion, estado_planeacion: 'pausada' }),
    ).toThrow(/estado de planeación: pausada/);
  });
});
