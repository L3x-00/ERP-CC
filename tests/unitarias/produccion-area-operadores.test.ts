import { describe, expect, it } from 'vitest';
import { filaAAreaTrabajo } from '@/modulos/configuracion/tipos/indice';
import {
  codigosAreaFiltrada,
  type AreaCatalogoProduccion,
  type OrdenTableroProduccion,
} from '@/modulos/produccion/servicios/indice';
import { resumenTallerOrden } from '@/modulos/produccion/componentes/kanban-produccion';

const CATALOGO: AreaCatalogoProduccion[] = [
  { codigo: 'METAL_MECANICA', nombre: 'Metal mecánica', padreCodigo: null, areaPlaneacion: 'sheet_metal' },
  { codigo: 'LASER', nombre: 'Corte láser', padreCodigo: 'METAL_MECANICA', areaPlaneacion: null },
  { codigo: 'SOLD', nombre: 'Soldadura', padreCodigo: 'METAL_MECANICA', areaPlaneacion: null },
  { codigo: 'FABRICACION_DIGITAL', nombre: 'Fabricación digital', padreCodigo: null, areaPlaneacion: 'taller' },
  { codigo: 'CNC', nombre: 'CNC Router', padreCodigo: 'FABRICACION_DIGITAL', areaPlaneacion: null },
];

describe('filtro de cola por área (OBS-09/PRD-11)', () => {
  it('incluye la familia completa del área macro seleccionada', () => {
    expect([...codigosAreaFiltrada(CATALOGO, 'METAL_MECANICA')].sort()).toEqual([
      'LASER',
      'METAL_MECANICA',
      'SOLD',
    ]);
    expect([...codigosAreaFiltrada(CATALOGO, 'LASER')].sort()).toEqual([
      'LASER',
      'METAL_MECANICA',
      'SOLD',
    ]);
    expect([...codigosAreaFiltrada(CATALOGO, 'CNC')].sort()).toEqual([
      'CNC',
      'FABRICACION_DIGITAL',
    ]);
  });

  it('con un código desconocido solo filtra por el código exacto', () => {
    expect([...codigosAreaFiltrada(CATALOGO, 'SUELTO')]).toEqual(['SUELTO']);
    expect([...codigosAreaFiltrada([], 'LASER')]).toEqual(['LASER']);
  });
});

describe('resumen de taller de la tarjeta de Producción', () => {
  const ordenBase = {
    id: 'orden-1',
    folio: 'OP-000001',
    clienteId: 'cliente-1',
    cotizacionId: null,
    estado: 'en_proceso',
    prioridad: 'normal',
    fechaCompromiso: '2026-10-01T00:00:00.000Z',
    fechaInicio: null,
    fechaFin: null,
    motivoCancelacion: null,
    esInterna: false,
    archivadaEn: null,
    creadoEn: '2026-09-01T00:00:00.000Z',
    actualizadoEn: '2026-09-01T00:00:00.000Z',
    estadoKanban: 'en_proceso',
    sesiones: [],
    notasEntrega: [],
    partidas: [
      {
        id: 'partida-1',
        ordenId: 'orden-1',
        codigoPieza: 'COT-001',
        descripcion: 'Soporte',
        cantidadSolicitada: 10,
        cantidadProducida: 4,
        cantidadScrap: 0,
        unidadMedida: 'unidad',
        materialId: null,
        tiempoEstimadoMinutos: 60,
        tiempoRealMinutos: 30,
        maquinaAsignada: 'CNC-01',
        operadorAsignadoId: 'operador-1',
        areaTrabajoCodigo: 'LASER',
        procesos: ['corte'],
        creadoEn: '2026-09-01T00:00:00.000Z',
        actualizadoEn: '2026-09-01T00:00:00.000Z',
        cantidadEntregada: 0,
        programaciones: [],
      },
    ],
  } as unknown as OrdenTableroProduccion;

  it('resume área, estación y responsable con nombres legibles', () => {
    const resumen = resumenTallerOrden(ordenBase, CATALOGO, { 'operador-1': 'Ana Operadora' });
    expect(resumen).toContain('Área: Corte láser');
    expect(resumen).toContain('Estación: CNC-01');
    expect(resumen).toContain('Responsable: Ana Operadora');
  });

  it('omite los datos aún no capturados', () => {
    const sinDatos = {
      ...ordenBase,
      partidas: [
        {
          ...ordenBase.partidas[0],
          areaTrabajoCodigo: null,
          maquinaAsignada: null,
          operadorAsignadoId: null,
        },
      ],
    } as unknown as OrdenTableroProduccion;
    expect(resumenTallerOrden(sinDatos, CATALOGO, {})).toBe('');
  });
});

describe('mapper del catálogo de taller (OBS-14)', () => {
  it('normaliza la taxonomía y rechaza valores fuera del contrato', () => {
    const base = {
      id: 'area-1',
      codigo: 'LASER',
      nombre: 'Corte láser',
      color_hex: '#3B82F6',
      costo_hora_interno: '650.00',
      tarifa_hora_venta: 1100,
      es_externo: false,
      activo: true,
      orden: 10,
      padre_codigo: 'METAL_MECANICA',
      area_planeacion: 'sheet_metal',
      creado_en: '2026-09-01T00:00:00.000Z',
      actualizado_en: '2026-09-01T00:00:00.000Z',
    };
    expect(filaAAreaTrabajo({ ...base, tipo: 'proceso' })).toMatchObject({
      tipo: 'proceso',
      padreCodigo: 'METAL_MECANICA',
      areaPlaneacion: 'sheet_metal',
      costoHoraInterno: 650,
    });
    // Un valor desconocido no se propaga como si fuera válido.
    expect(filaAAreaTrabajo({ ...base, tipo: 'celda', area_planeacion: 'otra' })).toMatchObject({
      tipo: 'area',
      areaPlaneacion: null,
    });
  });
});
