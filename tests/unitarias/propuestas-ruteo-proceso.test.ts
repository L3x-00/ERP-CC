// Obs. cliente 2026-10-13: al elegir el proceso del ruteo, el grupo de equipo se
// rellena solo cuando es "el mismo" (CNC Router → CNC Router).
import { describe, expect, it } from 'vitest';

import { resolverGrupoEquipoDelProceso } from '@/modulos/propuestas/utilidades/ruteo-proceso';

const GRUPOS = [
  { id: 'g-router', codigo: 'CNC_ROUTER', nombre: 'CNC Router' },
  { id: 'g-laser', codigo: 'LASER_FIBRA', nombre: 'Láser Fibra' },
  { id: 'g-press', codigo: 'PRESS_BRAKE', nombre: 'Press Brake' },
  { id: 'g-sold', codigo: 'SOLDADURA', nombre: 'Soldadura' },
  { id: 'g-maq', codigo: 'MAQUINADO', nombre: 'Maquinado' },
];

describe('resolverGrupoEquipoDelProceso', () => {
  it('usa el grupo configurado en el proceso cuando existe y está activo', () => {
    const proceso = { codigo: 'ROUTER', nombre: 'CNC Router', grupoEquipoId: 'g-press' };

    expect(resolverGrupoEquipoDelProceso(proceso, GRUPOS)).toBe('g-press');
  });

  it('sin grupo configurado, empareja por nombre ignorando mayúsculas y acentos', () => {
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'ROUTER', nombre: 'CNC ROUTER', grupoEquipoId: null },
        GRUPOS,
      ),
    ).toBe('g-router');
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'LASER_FIBRA', nombre: 'Laser fibra', grupoEquipoId: null },
        GRUPOS,
      ),
    ).toBe('g-laser');
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'SOLD', nombre: 'Soldadura', grupoEquipoId: null },
        GRUPOS,
      ),
    ).toBe('g-sold');
  });

  it('si el nombre no coincide, empareja por código (MAQUINADO)', () => {
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'MAQUINADO', nombre: 'Maquinado/Fabricación', grupoEquipoId: null },
        GRUPOS,
      ),
    ).toBe('g-maq');
  });

  it('un grupo configurado que ya no está activo cae al emparejamiento por nombre', () => {
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'ROUTER', nombre: 'CNC Router', grupoEquipoId: 'g-retirado' },
        GRUPOS,
      ),
    ).toBe('g-router');
  });

  it('sin correspondencia clara no adivina: devuelve vacío', () => {
    expect(
      resolverGrupoEquipoDelProceso(
        { codigo: 'DOB', nombre: 'Doblado CNC', grupoEquipoId: null },
        GRUPOS,
      ),
    ).toBe('');
    expect(
      resolverGrupoEquipoDelProceso({ codigo: 'X', nombre: 'Algo', grupoEquipoId: null }, []),
    ).toBe('');
  });
});
