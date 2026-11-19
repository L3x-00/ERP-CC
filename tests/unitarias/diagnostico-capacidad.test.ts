// Cliente 2026-11-10: la guía de capacidad debe nombrar el pendiente real y no
// repetir configuración ya resuelta (tarifas, grupo del proceso, equipos).
import { describe, expect, it } from 'vitest';

import type {
  CargaCapacidadDiaria,
} from '@/modulos/planeacion/tipos/indice';
import { diagnosticarCapacidadTurno } from '@/modulos/planeacion/utilidades/diagnostico-capacidad';
import type {
  DisponibilidadGrupo,
  ResumenDisponibilidadPropuesta,
} from '@/modulos/propuestas/tipos/disponibilidad';
import { diagnosticarCapacidadDisponibilidad } from '@/modulos/propuestas/utilidades/diagnostico-capacidad';

function grupo(parcial: Partial<DisponibilidadGrupo> = {}): DisponibilidadGrupo {
  return {
    codigo: 'ROUTER',
    nombre: 'CNC Router',
    horasRequeridas: 9,
    estado: 'sin_capacidad_configurada',
    horasCapacidad: null,
    horasCarga: null,
    horasDisponibles: null,
    turnosSobrecargados: 0,
    recursosActivos: 0,
    recursosSinTurno: 0,
    dias: [],
    ...parcial,
  };
}

function resumen(parcial: Partial<ResumenDisponibilidadPropuesta> = {}): ResumenDisponibilidadPropuesta {
  return {
    revisionId: 'rev-1',
    fechaInicio: '2026-11-10',
    fechaFin: '2026-11-23',
    dias: 14,
    zonaHoraria: 'America/Tijuana',
    grupos: [],
    procesosSinGrupo: [],
    itemsSinRuteo: [],
    sinItemsActivos: false,
    ...parcial,
  };
}

function carga(parcial: Partial<CargaCapacidadDiaria> & Pick<CargaCapacidadDiaria, 'recursoId'>): CargaCapacidadDiaria {
  return {
    area: 'taller',
    fechaProgramada: '2026-11-10',
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

const RECURSO = { id: 'rec-1', codigo: 'CNC-01', nombre: 'CNC Router 1' };

function diagnosticarTurno(entrada: {
  cargas: readonly CargaCapacidadDiaria[];
  recurso?: typeof RECURSO | null;
}) {
  return diagnosticarCapacidadTurno({
    recurso: entrada.recurso === undefined ? RECURSO : entrada.recurso,
    fecha: '2026-11-10',
    cargas: entrada.cargas,
  });
}

describe('diagnosticarCapacidadDisponibilidad (guía de Propuestas)', () => {
  it('con tarifas y grupos ya configurados solo señala lo que falta de verdad', () => {
    const pasos = diagnosticarCapacidadDisponibilidad(
      resumen({
        procesosSinGrupo: [{ nombre: 'Soladura', horasRequeridas: 3 }],
      }),
    );

    expect(pasos.map((paso) => paso.clave)).toEqual(['procesos-sin-grupo']);
    expect(pasos[0].titulo).toContain('«Soladura»');
    expect(pasos[0].href).toBe('/configuracion?pestana=tarifas');
  });

  it('no devuelve pasos cuando todo está configurado (cae en la guía general)', () => {
    expect(diagnosticarCapacidadDisponibilidad(resumen())).toEqual([]);
    expect(
      diagnosticarCapacidadDisponibilidad(
        resumen({
          procesosSinGrupo: [],
          itemsSinRuteo: [],
          grupos: [grupo({ estado: 'con_capacidad', horasCapacidad: 8, recursosActivos: 1 })],
        }),
      ),
    ).toEqual([]);
  });

  it('distingue un grupo sin equipos activos de un grupo con equipos sin capacidad', () => {
    const sinEquipos = diagnosticarCapacidadDisponibilidad(
      resumen({ grupos: [grupo({ recursosActivos: 0 })] }),
    );
    expect(sinEquipos[0].titulo).toContain('no tiene equipos activos');
    expect(sinEquipos[0].href).toBe('/configuracion?pestana=tarifas');

    const sinCapacidad = diagnosticarCapacidadDisponibilidad(
      resumen({ grupos: [grupo({ recursosActivos: 3, recursosSinTurno: 3 })] }),
    );
    expect(sinCapacidad[0].titulo).toContain(
      'Los 3 equipos del grupo «CNC Router» no tienen capacidad configurada',
    );
    expect(sinCapacidad[0].href).toBe('/planeacion#capacidad-instalada');
  });

  it('en un grupo parcial nombra cuántos equipos siguen sin capacidad', () => {
    const pasos = diagnosticarCapacidadDisponibilidad(
      resumen({ grupos: [grupo({ recursosActivos: 3, recursosSinTurno: 1 })] }),
    );

    expect(pasos[0].titulo).toBe('1 de 3 equipos de «CNC Router» no tienen capacidad');
    expect(pasos[0].detalle).toContain('resumen queda incompleto');
  });

  it('limita el diagnóstico al grupo que abrió la guía', () => {
    const pasos = diagnosticarCapacidadDisponibilidad(
      resumen({
        grupos: [
          grupo({ codigo: 'ROUTER', nombre: 'CNC Router', recursosActivos: 0 }),
          grupo({ codigo: 'PINT', nombre: 'Pintura', recursosActivos: 2, recursosSinTurno: 2 }),
        ],
      }),
      'PINT',
    );

    expect(pasos).toHaveLength(1);
    expect(pasos[0].titulo).toContain('Pintura');
  });

  it('lista los ítems sin ruteo con sus códigos', () => {
    const pasos = diagnosticarCapacidadDisponibilidad(resumen({ itemsSinRuteo: ['P-03', 'P-04'] }));

    expect(pasos[0].titulo).toBe('Los ítems P-03, P-04 no tienen ruteo');
    expect(pasos[0].href).toBeUndefined();
  });
});

describe('diagnosticarCapacidadTurno (guía de Planeación)', () => {
  it('sin filas para la fecha no inventa un pendiente', () => {
    const pasos = diagnosticarTurno({ cargas: [carga({ recursoId: 'rec-9' })] });

    expect(pasos).toEqual([]);
  });

  it('con capacidad en cero ese día explica que el equipo no tiene horas', () => {
    const pasos = diagnosticarTurno({
      cargas: [
        carga({ recursoId: RECURSO.id, fechaProgramada: '2026-11-10', horasCapacidad: 0 }),
      ],
    });

    expect(pasos[0].titulo).toBe('El equipo CNC-01 no tiene capacidad el 2026-11-10');
    expect(pasos[0].href).toBe('/planeacion#capacidad-instalada');
  });

  it('documenta que un día cerrado con solo horas reales se explica como sin capacidad', () => {
    // La RPC conserva la fila del domingo por las horas reales. La guía no puede
    // inventar capacidad: el mensaje es correcto, solo que antes el día callaba.
    const pasos = diagnosticarTurno({
      cargas: [
        carga({
          recursoId: RECURSO.id,
          fechaProgramada: '2026-11-10',
          horasCapacidad: 0,
          horasReales: 2,
        }),
      ],
    });

    expect(pasos[0].titulo).toBe('El equipo CNC-01 no tiene capacidad el 2026-11-10');
  });

  it('no inventa un pendiente cuando el equipo sí tiene capacidad ese día', () => {
    expect(diagnosticarTurno({ cargas: [carga({ recursoId: RECURSO.id })] })).toEqual([]);
  });

  it('ignora filas de otro día al diagnosticar la fecha elegida', () => {
    const pasos = diagnosticarTurno({
      cargas: [
        carga({
          recursoId: RECURSO.id,
          fechaProgramada: '2026-11-11',
          horasCapacidad: 0,
        }),
      ],
    });

    expect(pasos).toEqual([]);
  });

  it('sin recurso seleccionado no arma diagnóstico', () => {
    expect(diagnosticarTurno({ recurso: null, cargas: [] })).toEqual([]);
  });
});
