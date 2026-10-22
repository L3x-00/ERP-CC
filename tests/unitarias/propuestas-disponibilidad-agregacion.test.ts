// Consulta informativa de capacidad desde Propuestas: agregación pura por grupo
// de equipo. Las horas salen del ruteo real de la revisión (total_horas) y la
// capacidad de la RPC C9.3; nada se reserva ni se infiere.
import { describe, expect, it } from 'vitest';

import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import {
  agregarDisponibilidad,
  fechaLocalPlanta,
  horizonteDisponibilidad,
  type EntradaAgregacionDisponibilidad,
} from '@/modulos/propuestas/servicios/agregar-disponibilidad';

const HORIZONTE = {
  fechaInicio: '2026-10-21',
  fechaFin: '2026-11-03',
  dias: 14,
  zonaHoraria: 'America/Tijuana',
};

const G_ROUTER = { id: 'g-router', codigo: 'ROUTER', nombre: 'CNC Router', activo: true };
const G_LASER = { id: 'g-laser', codigo: 'LASER', nombre: 'Láser', activo: true };

function carga(parcial: Partial<CargaCapacidadDiaria> & Pick<CargaCapacidadDiaria, 'recursoId'>): CargaCapacidadDiaria {
  return {
    area: 'taller',
    fechaProgramada: '2026-10-21',
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

function entrada(parcial: Partial<EntradaAgregacionDisponibilidad> = {}): EntradaAgregacionDisponibilidad {
  return {
    revisionId: 'rev-1',
    horizonte: HORIZONTE,
    items: [
      { id: 'item-a', codigo: 'P-01', activo: true, esDescuento: false },
      { id: 'item-b', codigo: 'P-02', activo: true, esDescuento: false },
    ],
    ruteo: [
      { id: 'r1', itemId: 'item-a', procesoId: 'p-router', grupoEquipoId: 'g-router', setupHoras: 2, runHoras: 3, totalHoras: 5 },
      { id: 'r2', itemId: 'item-a', procesoId: 'p-laser', grupoEquipoId: 'g-laser', setupHoras: 0.5, runHoras: 1, totalHoras: 1.5 },
      { id: 'r3', itemId: 'item-b', procesoId: 'p-router', grupoEquipoId: 'g-router', setupHoras: 1, runHoras: 3, totalHoras: 4 },
    ],
    procesos: [
      { id: 'p-router', codigo: 'ROUTER', nombre: 'CNC Router', grupoEquipoId: 'g-router' },
      { id: 'p-laser', codigo: 'LASER', nombre: 'Láser', grupoEquipoId: 'g-laser' },
    ],
    grupos: [G_ROUTER, G_LASER],
    recursos: [],
    cargas: [],
    ...parcial,
  };
}

describe('agregarDisponibilidad — horas requeridas del ruteo', () => {
  it('suma total_horas por grupo con varios ítems y grupos, sin multiplicar por cantidad', () => {
    const resumen = agregarDisponibilidad(entrada());

    expect(resumen.grupos.map((grupo) => [grupo.codigo, grupo.horasRequeridas])).toEqual([
      ['ROUTER', 9],
      ['LASER', 1.5],
    ]);
    expect(resumen.revisionId).toBe('rev-1');
    expect(resumen.fechaInicio).toBe('2026-10-21');
    expect(resumen.fechaFin).toBe('2026-11-03');
    expect(resumen.sinItemsActivos).toBe(false);
  });

  it('no cuenta dos veces renglones ni ítems con ID duplicado', () => {
    const base = entrada();
    const resumen = agregarDisponibilidad({
      ...base,
      items: [...base.items, base.items[0]!],
      ruteo: [...base.ruteo, base.ruteo[0]!, base.ruteo[2]!],
    });

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')?.horasRequeridas).toBe(9);
  });

  it('excluye ítems inactivos y de descuento (ni horas ni «sin ruteo»)', () => {
    const resumen = agregarDisponibilidad(entrada({
      items: [
        { id: 'item-a', codigo: 'P-01', activo: true, esDescuento: false },
        { id: 'item-b', codigo: 'P-02', activo: false, esDescuento: false },
        { id: 'item-c', codigo: 'DESC', activo: true, esDescuento: true },
      ],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')?.horasRequeridas).toBe(5);
    expect(resumen.itemsSinRuteo).toEqual([]);
  });

  it('ignora renglones de ítems que no son de la revisión', () => {
    const base = entrada();
    const resumen = agregarDisponibilidad({
      ...base,
      ruteo: [
        ...base.ruteo,
        { id: 'r-ajeno', itemId: 'item-ajeno', procesoId: 'p-router', grupoEquipoId: 'g-router', setupHoras: 50, runHoras: 50, totalHoras: 100 },
      ],
    });

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')?.horasRequeridas).toBe(9);
  });

  it('marca ítems sin ruteo como información incompleta, no como horas cero', () => {
    const base = entrada();
    const resumen = agregarDisponibilidad({
      ...base,
      items: [...base.items, { id: 'item-c', codigo: 'P-03', activo: true, esDescuento: false }],
    });

    expect(resumen.itemsSinRuteo).toEqual(['P-03']);
    expect(resumen.grupos).toHaveLength(2);
  });

  it('reporta sin ítems activos cuando la revisión no tiene ítems vigentes', () => {
    const resumen = agregarDisponibilidad(entrada({
      items: [{ id: 'item-c', codigo: 'DESC', activo: true, esDescuento: true }],
      ruteo: [],
    }));

    expect(resumen.sinItemsActivos).toBe(true);
    expect(resumen.grupos).toEqual([]);
  });

  it('usa setup + run cuando total_horas no llegó', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-router', grupoEquipoId: 'g-router', setupHoras: 1.25, runHoras: 2, totalHoras: null },
      ],
    }));

    expect(resumen.grupos[0]?.horasRequeridas).toBe(3.25);
  });
});

describe('agregarDisponibilidad — grupo del renglón', () => {
  it('resuelve el grupo faltante con el grupo configurado en el catálogo del proceso', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-router', grupoEquipoId: null, setupHoras: 1, runHoras: 1, totalHoras: 2 },
        { id: 'r3', itemId: 'item-b', procesoId: 'p-laser', grupoEquipoId: 'g-laser', setupHoras: 1, runHoras: 1, totalHoras: 2 },
      ],
    }));

    expect(resumen.grupos.map((grupo) => grupo.codigo)).toEqual(['ROUTER', 'LASER']);
    expect(resumen.procesosSinGrupo).toEqual([]);
  });

  it('resuelve por nombre del proceso cuando el catálogo no trae grupo', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-x', grupoEquipoId: null, setupHoras: 1, runHoras: 1, totalHoras: 2 },
        { id: 'r3', itemId: 'item-b', procesoId: 'p-laser', grupoEquipoId: 'g-laser', setupHoras: 0, runHoras: 1, totalHoras: 1 },
      ],
      procesos: [
        { id: 'p-x', codigo: 'RT', nombre: 'cnc router', grupoEquipoId: null },
        { id: 'p-laser', codigo: 'LASER', nombre: 'Láser', grupoEquipoId: 'g-laser' },
      ],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')?.horasRequeridas).toBe(2);
  });

  it('no adivina si el nombre coincide con más de un grupo', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-x', grupoEquipoId: null, setupHoras: 1, runHoras: 1, totalHoras: 2 },
        { id: 'r3', itemId: 'item-b', procesoId: 'p-laser', grupoEquipoId: 'g-laser', setupHoras: 0, runHoras: 1, totalHoras: 1 },
      ],
      procesos: [
        { id: 'p-x', codigo: 'PX', nombre: 'CNC Router', grupoEquipoId: null },
        { id: 'p-laser', codigo: 'LASER', nombre: 'Láser', grupoEquipoId: 'g-laser' },
      ],
      grupos: [G_ROUTER, G_LASER, { id: 'g-router-2', codigo: 'CNC_ROUTER', nombre: 'CNC-Router', activo: true }],
    }));

    expect(resumen.grupos.map((grupo) => grupo.codigo)).toEqual(['LASER']);
    expect(resumen.procesosSinGrupo).toEqual([{ nombre: 'CNC Router', horasRequeridas: 2 }]);
  });

  it('muestra el proceso sin grupo con sus horas cuando no se puede resolver', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-pintura', grupoEquipoId: null, setupHoras: 1, runHoras: 2, totalHoras: 3 },
        { id: 'r2', itemId: 'item-b', procesoId: 'p-pintura', grupoEquipoId: null, setupHoras: 0, runHoras: 1, totalHoras: 1 },
        { id: 'r3', itemId: 'item-b', procesoId: 'p-borrado', grupoEquipoId: null, setupHoras: 0, runHoras: 1, totalHoras: 1 },
      ],
      procesos: [{ id: 'p-pintura', codigo: 'PINT', nombre: 'Pintura', grupoEquipoId: null }],
    }));

    expect(resumen.grupos).toEqual([]);
    expect(resumen.procesosSinGrupo).toEqual([
      { nombre: 'Pintura', horasRequeridas: 4 },
      { nombre: 'Proceso no identificado en el catálogo', horasRequeridas: 1 },
    ]);
  });

  it('no usa un grupo de catálogo inactivo para resolver el faltante', () => {
    const resumen = agregarDisponibilidad(entrada({
      ruteo: [
        { id: 'r1', itemId: 'item-a', procesoId: 'p-router', grupoEquipoId: null, setupHoras: 1, runHoras: 1, totalHoras: 2 },
        { id: 'r2', itemId: 'item-b', procesoId: 'p-laser', grupoEquipoId: 'g-laser', setupHoras: 1, runHoras: 1, totalHoras: 2 },
      ],
      procesos: [{ id: 'p-router', codigo: 'PR', nombre: 'Fresado', grupoEquipoId: 'g-router' }],
      grupos: [{ ...G_ROUTER, activo: false }, G_LASER],
    }));

    expect(resumen.procesosSinGrupo).toEqual([{ nombre: 'Fresado', horasRequeridas: 2 }]);
  });
});

describe('agregarDisponibilidad — capacidad, carga y disponible', () => {
  it('suma capacidad y carga del grupo y la disponibilidad no negativa por turno', () => {
    const resumen = agregarDisponibilidad(entrada({
      recursos: [
        { id: 'rec-1', grupoEquipoId: 'g-router' },
        { id: 'rec-2', grupoEquipoId: 'g-router' },
        { id: 'rec-3', grupoEquipoId: 'g-laser' },
      ],
      cargas: [
        carga({ recursoId: 'rec-1', horasCapacidad: 8, horasProgramadas: 3, horasDisponibles: 5 }),
        // Turno saturado: su déficit no resta lo libre de los otros turnos.
        carga({ recursoId: 'rec-1', turno: 'vespertino', horasCapacidad: 8, horasProgramadas: 10, horasDisponibles: -2, sobrecargado: true }),
        // Excepción de capacidad ya aplicada por la RPC.
        carga({ recursoId: 'rec-2', fechaProgramada: '2026-10-22', horasCapacidad: 4, horasProgramadas: 0, horasDisponibles: 4 }),
        carga({ recursoId: 'rec-3', horasCapacidad: 6, horasProgramadas: 6, horasDisponibles: 0 }),
      ],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')).toEqual({
      codigo: 'ROUTER',
      nombre: 'CNC Router',
      horasRequeridas: 9,
      estado: 'con_capacidad',
      horasCapacidad: 20,
      horasCarga: 13,
      horasDisponibles: 9,
      turnosSobrecargados: 1,
      recursosSinTurno: 0,
    });
    expect(resumen.grupos.find((grupo) => grupo.codigo === 'LASER')).toMatchObject({
      horasCapacidad: 6,
      horasCarga: 6,
      horasDisponibles: 0,
      turnosSobrecargados: 0,
    });
  });

  it('indica sin capacidad configurada si el grupo no tiene recurso activo', () => {
    const resumen = agregarDisponibilidad(entrada({
      recursos: [{ id: 'rec-3', grupoEquipoId: 'g-laser' }],
      cargas: [carga({ recursoId: 'rec-3' })],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')).toMatchObject({
      estado: 'sin_capacidad_configurada',
      horasCapacidad: null,
      horasCarga: null,
      horasDisponibles: null,
      horasRequeridas: 9,
    });
  });

  it('indica sin capacidad configurada si los recursos del grupo no tienen turnos', () => {
    const resumen = agregarDisponibilidad(entrada({
      recursos: [{ id: 'rec-1', grupoEquipoId: 'g-router' }],
      cargas: [],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')?.estado).toBe(
      'sin_capacidad_configurada',
    );
  });

  it('señala recursos sin turnos aun cuando otros equipos del grupo sí tienen capacidad', () => {
    const resumen = agregarDisponibilidad(entrada({
      recursos: [
        { id: 'rec-1', grupoEquipoId: 'g-router' },
        { id: 'rec-2', grupoEquipoId: 'g-router' },
      ],
      cargas: [carga({ recursoId: 'rec-1' })],
    }));
    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')).toMatchObject({
      estado: 'con_capacidad', horasCapacidad: 8, recursosSinTurno: 1,
    });
  });

  it('conserva capacidad cero de excepciones como capacidad configurada', () => {
    const resumen = agregarDisponibilidad(entrada({
      recursos: [{ id: 'rec-1', grupoEquipoId: 'g-router' }],
      cargas: [carga({ recursoId: 'rec-1', horasCapacidad: 0, horasDisponibles: 0 })],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')).toMatchObject({
      estado: 'con_capacidad',
      horasCapacidad: 0,
      horasDisponibles: 0,
    });
  });

  it('no mezcla cargas de otros grupos, fuera del horizonte ni filas repetidas', () => {
    const fila = carga({ recursoId: 'rec-1', horasCapacidad: 8, horasProgramadas: 2, horasDisponibles: 6 });
    const resumen = agregarDisponibilidad(entrada({
      recursos: [
        { id: 'rec-1', grupoEquipoId: 'g-router' },
        { id: 'rec-1', grupoEquipoId: 'g-router' },
        { id: 'rec-9', grupoEquipoId: 'g-otro' },
      ],
      cargas: [
        fila,
        fila,
        carga({ recursoId: 'rec-9', horasCapacidad: 100, horasDisponibles: 100 }),
        carga({ recursoId: 'rec-1', fechaProgramada: '2026-11-04', horasCapacidad: 50, horasDisponibles: 50 }),
      ],
    }));

    expect(resumen.grupos.find((grupo) => grupo.codigo === 'ROUTER')).toMatchObject({
      horasCapacidad: 8,
      horasCarga: 2,
      horasDisponibles: 6,
    });
  });
});

describe('horizonte de la planta (America/Tijuana)', () => {
  it('toma la fecha local de la planta, no la UTC', () => {
    // 05:30 UTC del 22 = 22:30 del 21 en Tijuana (UTC-7 en octubre).
    expect(fechaLocalPlanta(new Date('2026-10-22T05:30:00Z'))).toBe('2026-10-21');
    expect(fechaLocalPlanta(new Date('2026-10-22T08:00:00Z'))).toBe('2026-10-22');
  });

  it('abarca 14 días calendario explícitos, incluido el cambio de horario', () => {
    expect(horizonteDisponibilidad(new Date('2026-10-22T05:30:00Z'))).toEqual({
      fechaInicio: '2026-10-21',
      fechaFin: '2026-11-03',
      dias: 14,
      zonaHoraria: 'America/Tijuana',
    });
  });
});
