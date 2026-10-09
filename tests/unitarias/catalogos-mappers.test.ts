import { describe, expect, it } from 'vitest';
import {
  filaACanal,
  filaAEspesor,
  filaAGrupoEquipo,
  filaAMaterial,
  filaAProceso,
  filaAProximaAccion,
  filaAVersion,
} from '@/modulos/catalogos/tipos/indice';

describe('mappers defensivos de catálogos', () => {
  it('convierte material y protege el metadata', () => {
    const base = {
      id: 'm1',
      codigo: 'ACERO_CARBON',
      nombre: 'Acero al carbón',
      activo: true,
      orden: 1,
      metadata: { densidad: 7.85 },
      creado_en: '2026-10-05T00:00:00.000Z',
      actualizado_en: '2026-10-05T00:00:00.000Z',
    };
    expect(filaAMaterial(base).metadata).toEqual({ densidad: 7.85 });
    expect(filaAMaterial({ ...base, metadata: null }).metadata).toEqual({});
    expect(filaAMaterial({ ...base, metadata: [1, 2] }).metadata).toEqual({});
  });

  it('normaliza el espesor numérico que llega como texto', () => {
    const fila = {
      id: 'e1',
      material_id: 'm1',
      etiqueta: '1/8"',
      espesor_mm: '3.175',
      activo: true,
      orden: 0,
      creado_en: '2026-10-05T00:00:00.000Z',
    };
    expect(filaAEspesor(fila).espesorMm).toBe(3.175);
    expect(filaAEspesor({ ...fila, espesor_mm: 6 }).espesorMm).toBe(6);
  });

  it('mapea proceso con banderas y nulos configurables', () => {
    const proceso = filaAProceso({
      id: 'p1',
      codigo: 'LASER_FIBRA',
      nombre: 'Láser fibra',
      prefijo_corrida: 'LAS',
      grupo_planeado_id: null,
      area_trabajo_codigo: null,
      requiere_archivo_tecnico: true,
      requiere_primera_pieza: true,
      intervalo_inspeccion_lote: 10,
      activo: true,
      orden: 10,
      creado_en: '2026-10-05T00:00:00.000Z',
    });
    expect(proceso.grupoPlaneadoId).toBeNull();
    expect(proceso.areaTrabajoCodigo).toBeNull();
    expect(proceso.requiereArchivoTecnico).toBe(true);
    expect(proceso.intervaloInspeccionLote).toBe(10);
  });

  it('mapea grupos y próximas acciones', () => {
    const grupo = filaAGrupoEquipo({
      id: 'g1',
      codigo: 'CNC_ROUTER',
      nombre: 'CNC Router',
      activo: false,
      orden: 0,
      creado_en: '2026-10-05T00:00:00.000Z',
    });
    expect(grupo.activo).toBe(false);

    const accion = filaAProximaAccion({
      id: 'a1',
      codigo: 'OTHER',
      nombre: 'Otro',
      es_otro: true,
      activo: true,
      orden: 1,
      creado_en: '2026-10-05T00:00:00.000Z',
    });
    expect(accion.esOtro).toBe(true);
  });

  it('mapea canales RFQ con su marca de "Otro" (DC-02)', () => {
    const otro = filaACanal({
      id: 'c1',
      codigo: 'OTRO',
      nombre: 'Otro',
      es_otro: true,
      activo: true,
      orden: 60,
      creado_en: '2026-10-08T00:00:00.000Z',
    });
    expect(otro).toEqual({
      id: 'c1',
      codigo: 'OTRO',
      nombre: 'Otro',
      esOtro: true,
      activo: true,
      orden: 60,
      creadoEn: '2026-10-08T00:00:00.000Z',
    });

    const inactivo = filaACanal({
      id: 'c2',
      codigo: 'FAX',
      nombre: 'Fax',
      es_otro: false,
      activo: false,
      orden: 70,
      creado_en: '2026-10-08T00:00:00.000Z',
    });
    expect(inactivo.esOtro).toBe(false);
    expect(inactivo.activo).toBe(false);
  });

  it('mapea versiones y protege snapshots no-objeto', () => {
    const base = {
      id: 'v1',
      entidad: 'catalogo_materiales',
      entidad_id: 'm1',
      version: 2,
      datos: { codigo: 'ACERO_CARBON' },
      actor_id: null,
      creado_en: '2026-10-05T00:00:00.000Z',
    };
    expect(filaAVersion(base).version).toBe(2);
    expect(filaAVersion(base).entidad).toBe('catalogo_materiales');
    expect(filaAVersion({ ...base, datos: [1, 2] }).datos).toEqual({});
  });
});
