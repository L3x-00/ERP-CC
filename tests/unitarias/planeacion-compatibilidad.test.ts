// C9.2/P10: grupos requeridos por el ruteo y compatibilidad del recurso.
import { describe, expect, it } from 'vitest';
import {
  evaluarCompatibilidadRecurso,
  normalizarTextoCatalogo,
  resolverGrupoRequeridoOperacion,
  resolverGruposRequeridos,
  type EntradaResolverGruposRequeridos,
} from '@/modulos/planeacion/utilidades/compatibilidad';

const GRUPO_LASER = 'grupo-laser-0000001';
const GRUPO_DOBLEZ = 'grupo-doblez-000002';

function entrada(
  overrides: Partial<EntradaResolverGruposRequeridos> = {},
): EntradaResolverGruposRequeridos {
  return {
    procesos: [],
    maquinaAsignada: null,
    grupoPorProceso: new Map(),
    grupoPorCodigoRecurso: new Map(),
    ...overrides,
  };
}

describe('normalizarTextoCatalogo (C9.2/P10)', () => {
  it('iguala mayúsculas, espacios de sobra y bordes', () => {
    expect(normalizarTextoCatalogo('  Corte  Láser ')).toBe('corte láser');
    expect(normalizarTextoCatalogo('CORTE')).toBe('corte');
  });
});

describe('resolverGruposRequeridos (C9.2/P10)', () => {
  it('resuelve por nombre o código sin mayúsculas ni espacios sobrantes', () => {
    const grupos = resolverGruposRequeridos(
      entrada({
        procesos: [' Corte Láser ', 'DBL'],
        grupoPorProceso: new Map([
          ['corte láser', GRUPO_LASER],
          ['dbl', GRUPO_DOBLEZ],
        ]),
      }),
    );

    expect(grupos).toEqual([GRUPO_LASER, GRUPO_DOBLEZ]);
  });

  it('devuelve null cuando ningún proceso resuelve y el desglose no trae equipo', () => {
    expect(resolverGruposRequeridos(entrada({ procesos: ['Soldadura'] }))).toBeNull();
  });

  it('ignora procesos resueltos sin grupo de equipo', () => {
    expect(
      resolverGruposRequeridos(
        entrada({ procesos: ['Corte'], grupoPorProceso: new Map([['corte', null]]) }),
      ),
    ).toBeNull();
  });

  it('usa el grupo del recurso anotado como equipo cuando el ruteo no resuelve', () => {
    expect(
      resolverGruposRequeridos(
        entrada({
          procesos: ['Proceso desconocido'],
          maquinaAsignada: 'CNC-02',
          grupoPorCodigoRecurso: new Map([['cnc-02', GRUPO_LASER]]),
        }),
      ),
    ).toEqual([GRUPO_LASER]);
  });
});

describe('resolverGrupoRequeridoOperacion (C11)', () => {
  it('prioriza el grupo guardado en el ruteo de la propuesta', () => {
    expect(
      resolverGrupoRequeridoOperacion(
        { nombre: 'Láser fibra', grupoEquipoId: GRUPO_LASER },
        new Map([['láser fibra', GRUPO_DOBLEZ]]),
      ),
    ).toEqual([GRUPO_LASER]);
  });

  it('si el ruteo no lo guardó, usa el grupo del catálogo del proceso', () => {
    expect(
      resolverGrupoRequeridoOperacion(
        { nombre: '  Láser   Fibra ', grupoEquipoId: null },
        new Map([['láser fibra', GRUPO_LASER]]),
      ),
    ).toEqual([GRUPO_LASER]);
  });

  it('devuelve null cuando la operación no tiene grupo conocido', () => {
    expect(
      resolverGrupoRequeridoOperacion(
        { nombre: 'Proceso sin catálogo', grupoEquipoId: null },
        new Map(),
      ),
    ).toBeNull();
  });
});

describe('evaluarCompatibilidadRecurso (C9.2/P10)', () => {  it('es compatible cuando coincide cualquiera de los grupos requeridos', () => {
    expect(evaluarCompatibilidadRecurso([GRUPO_LASER, GRUPO_DOBLEZ], GRUPO_DOBLEZ)).toBe(
      'compatible',
    );
  });

  it('es incompatible solo con ambos grupos conocidos y distintos', () => {
    expect(evaluarCompatibilidadRecurso([GRUPO_LASER], GRUPO_DOBLEZ)).toBe('incompatible');
  });

  it('responde sin dato cuando falta el grupo del recurso o el requerido', () => {
    expect(evaluarCompatibilidadRecurso([GRUPO_LASER], null)).toBe('sin_dato');
    expect(evaluarCompatibilidadRecurso(null, GRUPO_LASER)).toBe('sin_dato');
    expect(evaluarCompatibilidadRecurso([], GRUPO_LASER)).toBe('sin_dato');
  });
});
