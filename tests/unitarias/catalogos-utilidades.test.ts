import { describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import type {
  CatalogosBase,
  EspesorCatalogo,
  MaterialCatalogo,
} from '@/modulos/catalogos/tipos/indice';
import {
  contarRegistrosPorSeccion,
  espesoresDeMaterial,
  materialDeEspesor,
  puedeEditarCatalogos,
  puedeVerCatalogos,
  SECCIONES_CATALOGOS_BASE,
  soloActivos,
} from '@/modulos/catalogos/utilidades/indice';

const MATERIAL_ACERO = '00000000-0000-4000-8000-0000000c0a01';
const MATERIAL_MDF = '00000000-0000-4000-8000-0000000c0a02';

function material(id: string, codigo: string, activo = true, orden = 0): MaterialCatalogo {
  return {
    id,
    codigo,
    nombre: `Material ${codigo}`,
    activo,
    orden,
    metadata: {},
    creadoEn: '2026-10-05T00:00:00.000Z',
    actualizadoEn: '2026-10-05T00:00:00.000Z',
  };
}

function espesor(
  id: string,
  materialId: string,
  etiqueta: string,
  espesorMm: number,
  activo = true,
  orden = 0,
): EspesorCatalogo {
  return { id, materialId, etiqueta, espesorMm, activo, orden, creadoEn: '2026-10-05T00:00:00.000Z' };
}

function datosBase(): CatalogosBase {
  return {
    materiales: [material(MATERIAL_MDF, 'MDF', false, 2), material(MATERIAL_ACERO, 'ACERO_CARBON', true, 1)],
    espesores: [
      espesor('e1', MATERIAL_ACERO, '6 mm', 6, true, 2),
      espesor('e2', MATERIAL_ACERO, '3 mm', 3, true, 1),
      espesor('e3', MATERIAL_ACERO, '1/8"', 3.175, false, 0),
      espesor('e4', MATERIAL_MDF, '18 mm', 18, true, 0),
    ],
    procesos: [],
    gruposEquipo: [
      {
        id: 'g1',
        codigo: 'LASER_FIBRA',
        nombre: 'Láser Fibra',
        activo: true,
        orden: 0,
        creadoEn: '2026-10-05T00:00:00.000Z',
      },
      {
        id: 'g2',
        codigo: 'SOLDADURA',
        nombre: 'Soldadura',
        activo: false,
        orden: 1,
        creadoEn: '2026-10-05T00:00:00.000Z',
      },
    ],
    gruposPlaneados: [],
    proximasAcciones: [
      {
        id: 'a1',
        codigo: 'FOLLOW_UP',
        nombre: 'Seguimiento',
        esOtro: false,
        activo: true,
        orden: 0,
        creadoEn: '2026-10-05T00:00:00.000Z',
      },
      {
        id: 'a2',
        codigo: 'OTHER',
        nombre: 'Otro',
        esOtro: true,
        activo: false,
        orden: 1,
        creadoEn: '2026-10-05T00:00:00.000Z',
      },
    ],
    canales: [
      {
        id: 'c1',
        codigo: 'WHATSAPP',
        nombre: 'WhatsApp',
        esOtro: false,
        activo: true,
        orden: 10,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
      {
        id: 'c2',
        codigo: 'OTRO',
        nombre: 'Otro',
        esOtro: true,
        activo: true,
        orden: 60,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
      {
        id: 'c3',
        codigo: 'FAX',
        nombre: 'Fax',
        esOtro: false,
        activo: false,
        orden: 70,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
    ],
    areasTrabajo: [],
    puedeEditar: true,
  };
}

function usuario(rol: UsuarioAutenticado['rol'], activo: boolean, permisos: string[]): UsuarioAutenticado {
  return {
    id: '00000000-0000-4000-8000-0000000c0a99',
    email: 'prueba@orca.local',
    nombreCompleto: 'Prueba',
    rol,
    activo,
    permisos,
    creadoEn: '2026-10-05T00:00:00.000Z',
    actualizadoEn: '2026-10-05T00:00:00.000Z',
  };
}

describe('utilidades de catálogos base', () => {
  it('expone siete secciones únicas y bien ordenadas', () => {
    const ids = SECCIONES_CATALOGOS_BASE.map((seccion) => seccion.id);
    expect(ids).toEqual([
      'materiales',
      'espesores',
      'procesos',
      'gruposEquipo',
      'gruposPlaneados',
      'proximasAcciones',
      'canales',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SECCIONES_CATALOGOS_BASE[6].titulo).toBe('Canales RFQ');
  });

  it('cuenta activos e inactivos por sección', () => {
    const conteos = contarRegistrosPorSeccion(datosBase());
    expect(conteos.materiales).toEqual({ total: 2, activos: 1, inactivos: 1 });
    expect(conteos.espesores).toEqual({ total: 4, activos: 3, inactivos: 1 });
    expect(conteos.gruposEquipo).toEqual({ total: 2, activos: 1, inactivos: 1 });
    expect(conteos.proximasAcciones).toEqual({ total: 2, activos: 1, inactivos: 1 });
    expect(conteos.procesos).toEqual({ total: 0, activos: 0, inactivos: 0 });
    expect(conteos.canales).toEqual({ total: 3, activos: 2, inactivos: 1 });
  });

  it('solo ofrece canales activos para capturas nuevas y conserva los inactivos', () => {
    const { canales } = datosBase();
    expect(soloActivos(canales).map((canal) => canal.codigo)).toEqual(['WHATSAPP', 'OTRO']);
    expect(canales).toHaveLength(3);
  });

  it('filtra espesores por material y respeta el orden administrativo', () => {
    const { espesores } = datosBase();
    const delAcero = espesoresDeMaterial(espesores, MATERIAL_ACERO);
    expect(delAcero.map((item) => item.id)).toEqual(['e3', 'e2', 'e1']);
    expect(delAcero.map((item) => item.etiqueta)).toEqual(['1/8"', '3 mm', '6 mm']);
  });

  it('excluye inactivos en registros nuevos y los conserva en historial', () => {
    const { espesores } = datosBase();
    const nuevos = espesoresDeMaterial(espesores, MATERIAL_ACERO, false);
    expect(nuevos.map((item) => item.id)).toEqual(['e2', 'e1']);
    expect(espesoresDeMaterial(espesores, MATERIAL_ACERO, true)).toHaveLength(3);
    expect(espesoresDeMaterial(espesores, MATERIAL_MDF, false)).toHaveLength(1);
  });

  it('resuelve el material de un espesor y las opciones activas', () => {
    const datos = datosBase();
    expect(materialDeEspesor(datos.materiales, datos.espesores[0])?.codigo).toBe('ACERO_CARBON');
    expect(materialDeEspesor([], datos.espesores[0])).toBeNull();
    expect(soloActivos(datos.materiales).map((item) => item.codigo)).toEqual(['ACERO_CARBON']);
  });

  it('resuelve permisos de ver y editar (admin siempre; inactivo nunca)', () => {
    expect(puedeVerCatalogos(usuario('admin', true, []))).toBe(true);
    expect(puedeVerCatalogos(usuario('gerente', true, ['catalogo_ver']))).toBe(true);
    expect(puedeVerCatalogos(usuario('vendedor', true, ['catalogo_ver']))).toBe(true);
    expect(puedeVerCatalogos(usuario('operador', true, []))).toBe(false);
    expect(puedeVerCatalogos(usuario('gerente', false, ['catalogo_ver']))).toBe(false);

    expect(puedeEditarCatalogos(usuario('admin', true, []))).toBe(true);
    expect(puedeEditarCatalogos(usuario('gerente', true, ['catalogo_editar']))).toBe(true);
    expect(puedeEditarCatalogos(usuario('vendedor', true, ['catalogo_ver']))).toBe(false);
    expect(puedeEditarCatalogos(usuario('gerente', false, ['catalogo_editar']))).toBe(false);
  });
});
