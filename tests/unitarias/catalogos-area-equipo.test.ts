import { describe, expect, it } from 'vitest';

import {
  areaCompatibleConGrupo,
  areaMacroDeCodigo,
  areasEsperadasGrupo,
  esAreaEquipo,
} from '@/modulos/catalogos/utilidades/area-equipo';

// Bug producción 2026-11-27: el área de planeación de una máquina se deriva
// del proceso de su grupo. Estas pruebas fijan la regla que comparten la UI,
// la acción de servidor y el diagnóstico.

const AREAS = [
  {
    codigo: 'METAL_MECANICA',
    nombre: 'Metal mecánica',
    activo: true,
    padreCodigo: null,
    areaPlaneacion: 'sheet_metal',
  },
  {
    codigo: 'LASER',
    nombre: 'Corte láser',
    activo: true,
    padreCodigo: 'METAL_MECANICA',
    areaPlaneacion: null,
  },
  {
    codigo: 'ACABADOS',
    nombre: 'Acabados',
    activo: true,
    padreCodigo: null,
    areaPlaneacion: 'acabados',
  },
];

const PROCESOS = [
  {
    grupoEquipoId: 'g-laser',
    areaTrabajoCodigo: 'LASER',
    activo: true,
  },
  {
    grupoEquipoId: 'g-acabado',
    areaTrabajoCodigo: 'ACABADOS',
    activo: true,
  },
  {
    grupoEquipoId: 'g-inactivo',
    areaTrabajoCodigo: 'ACABADOS',
    activo: false,
  },
];

describe('area-equipo', () => {
  it('hereda el área macro del ancestro cuando el área de proceso no la define', () => {
    expect(areaMacroDeCodigo('LASER', AREAS)).toBe('sheet_metal');
    expect(areaMacroDeCodigo('ACABADOS', AREAS)).toBe('acabados');
  });

  it('devuelve null para un código inexistente o nulo', () => {
    expect(areaMacroDeCodigo('NO_EXISTE', AREAS)).toBeNull();
    expect(areaMacroDeCodigo(null, AREAS)).toBeNull();
  });

  it('deduce una sola área a partir de los procesos activos del grupo', () => {
    expect(areasEsperadasGrupo('g-laser', PROCESOS, AREAS)).toEqual(['sheet_metal']);
    expect(areasEsperadasGrupo('g-acabado', PROCESOS, AREAS)).toEqual(['acabados']);
  });

  it('no deduce área de procesos inactivos ni de un grupo sin procesos', () => {
    expect(areasEsperadasGrupo('g-inactivo', PROCESOS, AREAS)).toEqual([]);
    expect(areasEsperadasGrupo('g-vacio', PROCESOS, AREAS)).toEqual([]);
    expect(areasEsperadasGrupo(null, PROCESOS, AREAS)).toEqual([]);
  });

  it('devuelve todas las áreas cuando el grupo se usa en más de una', () => {
    const procesos = [
      ...PROCESOS,
      { grupoEquipoId: 'g-mixto', areaTrabajoCodigo: 'LASER', activo: true },
      { grupoEquipoId: 'g-mixto', areaTrabajoCodigo: 'ACABADOS', activo: true },
    ];
    expect(areasEsperadasGrupo('g-mixto', procesos, AREAS)).toEqual(['sheet_metal', 'acabados']);
  });

  it('considera compatible el área cuando el grupo no impone ninguna', () => {
    expect(areaCompatibleConGrupo('taller', [])).toBe(true);
    expect(areaCompatibleConGrupo('taller', ['sheet_metal'])).toBe(false);
    expect(areaCompatibleConGrupo('sheet_metal', ['sheet_metal'])).toBe(true);
    expect(areaCompatibleConGrupo(null, ['sheet_metal'])).toBe(false);
  });

  it('reconoce solo las áreas de planeación válidas', () => {
    expect(esAreaEquipo('sheet_metal')).toBe(true);
    expect(esAreaEquipo('planta_baja')).toBe(false);
    expect(esAreaEquipo(null)).toBe(false);
  });
});
