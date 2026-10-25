// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { FichaOrdenProduccion } from '@/modulos/produccion/componentes/ficha-orden-produccion';
import type {
  OrdenTableroProduccion,
  PartidaTableroProduccion,
  AreaCatalogoProduccion,
} from '@/modulos/produccion/servicios/indice';
import type { RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const PARTIDA_ID = '33333333-3333-4333-8333-333333333333';
const META_CORTE = 'meta-corte';
const META_DOBLEZ = 'meta-doblez';

const RECURSO: RecursoPlaneacion = {
  id: '77777777-7777-4777-8777-777777777777',
  codigo: 'CNC-01',
  nombre: 'CNC principal',
  area: 'taller',
  activo: true,
  creadoEn: '2026-10-01T00:00:00.000Z',
  actualizadoEn: '2026-10-01T00:00:00.000Z',
};

const AREAS: AreaCatalogoProduccion[] = [
  { codigo: 'corte_laser', nombre: 'Corte láser', padreCodigo: 'taller', areaPlaneacion: 'taller' },
  { codigo: 'doblez', nombre: 'Doblez', padreCodigo: 'taller', areaPlaneacion: 'taller' },
];

const PARTIDA: PartidaTableroProduccion = {
  id: PARTIDA_ID,
  ordenId: ORDEN_ID,
  codigoPieza: 'PIEZA-LASER',
  descripcion: 'Charola de acero inoxidable',
  cantidadSolicitada: 100,
  cantidadProducida: 40,
  cantidadScrap: 2,
  unidadMedida: 'pieza',
  materialId: '88888888-8888-4888-8888-888888888888',
  materialCodigo: 'AC-304',
  materialNombre: 'Acero inoxidable 304',
  materialUnidad: 'lámina',
  materialAnchoMm: 1250,
  materialLargoMm: 2500,
  tiempoEstimadoMinutos: 90,
  tiempoRealMinutos: 60,
  maquinaAsignada: 'CNC-01',
  operadorAsignadoId: '99999999-9999-4999-8999-999999999999',
  areaTrabajoCodigo: 'corte_laser',
  procesos: ['Corte', 'Doblez'],
  cantidadEntregada: 10,
  programaciones: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ordenId: ORDEN_ID,
      partidaId: PARTIDA_ID,
      recursoId: RECURSO.id,
      secuencia: 1,
      fechaProgramada: '2026-10-25',
      turno: 'matutino',
      horasEstimadas: 4,
      ordenPrioridad: 1,
      estadoPlaneacion: 'programada',
      creadoEn: '2026-10-20T00:00:00.000Z',
      actualizadoEn: '2026-10-20T00:00:00.000Z',
      metaProcesoId: META_CORTE,
      operacionNombre: 'Corte',
    },
  ],
  metasProceso: [
    {
      id: META_CORTE,
      partidaId: PARTIDA_ID,
      secuencia: 1,
      nombre: 'Corte',
      metaPiezas: 100,
      hechoPiezas: 40,
      pendientePiezas: 60,
      porcentaje: 40,
      esFinal: false,
    },
    {
      id: META_DOBLEZ,
      partidaId: PARTIDA_ID,
      secuencia: 2,
      nombre: 'Doblez',
      metaPiezas: 100,
      hechoPiezas: 0,
      pendientePiezas: 100,
      porcentaje: 0,
      esFinal: true,
    },
  ],
  creadoEn: '2026-10-01T00:00:00.000Z',
  actualizadoEn: '2026-10-01T00:00:00.000Z',
};

const ORDEN: OrdenTableroProduccion = {
  id: ORDEN_ID,
  folio: 'OP-001200',
  clienteId: '22222222-2222-4222-8222-222222222222',
  clienteNombre: 'Metales del Norte',
  cotizacionId: null,
  estado: 'programada',
  estadoSii: 'PLANIFICADA',
  folioSii: null,
  prioridad: 'alta',
  fechaCompromiso: '2026-11-02T18:00:00.000Z',
  fechaCompromisoComercial: '2026-11-02',
  fechaOperativa: '2026-11-02',
  fechaInicio: null,
  fechaFin: null,
  motivoCancelacion: null,
  esInterna: false,
  archivadaEn: null,
  idHistorico: null,
  referenciaExterna: null,
  notas: 'Entregar en dos parcialidades',
  fechaTrabajo: null,
  horasEstimadas: null,
  ordenOrigenId: null,
  creadoEn: '2026-10-01T00:00:00.000Z',
  actualizadoEn: '2026-10-01T00:00:00.000Z',
  estadoKanban: 'en_proceso',
  partidas: [PARTIDA],
  sesiones: [],
  notasEntrega: [],
};

afterEach(() => cleanup());

describe('ficha de contexto de Producción', () => {
  it('reúne cliente, material, medidas, ruta y programación sin mostrar UUID', () => {
    render(
      createElement(FichaOrdenProduccion, {
        orden: ORDEN,
        areas: AREAS,
        responsables: { '99999999-9999-4999-8999-999999999999': 'Ana Operadora' },
        recursos: [RECURSO],
      }),
    );

    const ficha = screen.getByTestId('ficha-orden-produccion');
    expect(ficha.textContent).toContain('Metales del Norte');
    expect(ficha.textContent).toContain('Acero inoxidable 304');
    expect(ficha.textContent).toContain('1,250 × 2,500 mm');
    expect(ficha.textContent).toContain('Corte láser');
    expect(ficha.textContent).toContain('Ana Operadora');
    expect(ficha.textContent).toContain('Corte');
    expect(ficha.textContent).toContain('Doblez');
    expect(ficha.textContent).toContain('CNC-01');
    expect(ficha.textContent).toContain('Matutino');
    expect(ficha.textContent).toContain('25 oct');
    expect(ficha.textContent).toContain('40/100 piezas');
    expect(ficha.textContent).not.toContain(ORDEN_ID);
    expect(ficha.textContent).not.toContain(PARTIDA_ID);
    expect(ficha.textContent).not.toContain('99999999-9999');
  });

  it('declara los datos faltantes en lugar de dejar la ficha vacía', () => {
    render(
      createElement(FichaOrdenProduccion, {
        orden: {
          ...ORDEN,
          clienteNombre: undefined,
          partidas: [{
            ...PARTIDA,
            materialNombre: null,
            materialCodigo: null,
            materialAnchoMm: null,
            materialLargoMm: null,
            metasProceso: [],
            procesos: [],
            programaciones: [],
            operadorAsignadoId: null,
          }],
        },
        areas: [],
        responsables: {},
        recursos: [],
      }),
    );

    const ficha = screen.getByTestId('ficha-orden-produccion');
    expect(ficha.textContent).toContain('Por definir');
    expect(ficha.textContent).toContain('Sin programar');
    expect(ficha.textContent).toContain('Sin asignar');
    expect(ficha.textContent).toContain('Ruta por definir');
  });
});
