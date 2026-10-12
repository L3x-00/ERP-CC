// @vitest-environment jsdom
// G1/G2 (obs. cliente): el ruteo estimado muestra etiquetas visibles sobre sus
// campos (Preparación/Operación/Total en horas) y el desglose «Costo total
// estimado de fabricación» deriva el tiempo por uso y el costo por proceso del
// snapshot costeado, sin sumar dos veces el costo manual de máquina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/modulos/propuestas/acciones/costear-ruteo-revision', () => ({
  costearRuteoRevisionAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/editar-costos-revision', () => ({
  editarCostosRevisionAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/editar-ruteo-item', () => ({
  editarRuteoItemAccion: vi.fn(),
}));

import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { PanelRuteoCosteo } from '@/modulos/propuestas/componentes/panel-ruteo-costeo';
import type {
  CostoRevisionPropuesta,
  PermisosPropuesta,
  PropuestaItem,
  RevisionPropuesta,
  RuteoItemPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROCESO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GRUPO_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const REVISION = {
  id: REVISION_ID,
  propuestaId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  letra: 'A',
  folioRevision: 'CNC-0001-A',
  estado: 'DRAFT',
  motivoCreacion: null,
  snapshotCabecera: { ivaPorcentaje: 16, moneda: 'MXN' },
  requiereRevisionRuteo: false,
  requiereRevisionCosteo: false,
  canalEnvio: null,
  destinoEnvio: null,
  enviadoEn: null,
  enviadoPor: null,
  validadaEn: null,
  validadaPor: null,
  creadoPor: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  creadoEn: '2026-10-10T00:00:00Z',
  actualizadoEn: '2026-10-10T00:00:00Z',
} as unknown as RevisionPropuesta;

const ITEM = {
  id: ITEM_ID,
  revisionId: REVISION_ID,
  revisionOrigenId: REVISION_ID,
  rfqItemId: null,
  codigo: 'IT01',
  descripcion: 'Brida',
  cantidad: 10,
  materialId: null,
  espesorId: null,
  acabado: null,
  notas: null,
  precioUnitario: 100,
  esDescuento: false,
  activo: true,
  creadoEn: '2026-10-10T00:00:00Z',
  actualizadoEn: '2026-10-10T00:00:00Z',
} as PropuestaItem;

function filaRuteo(parcial: Partial<RuteoItemPropuesta> & { id: string }): RuteoItemPropuesta {
  return {
    itemId: ITEM_ID,
    secuencia: 0,
    procesoId: PROCESO_ID,
    grupoEquipoId: GRUPO_ID,
    grupoPlaneadoId: null,
    setupHoras: 1,
    runHoras: 2,
    totalHoras: 3,
    requiereRevision: false,
    recursoId: null,
    tarifaHora: null,
    tarifaMoneda: null,
    tarifaFuente: null,
    costoSetup: null,
    costoRun: null,
    costoTotal: null,
    costeadoEn: null,
    ...parcial,
  };
}

const RUTEO = [
  filaRuteo({
    id: 'r1',
    tarifaHora: 100,
    tarifaMoneda: 'MXN',
    tarifaFuente: 'GRUPO',
    costoSetup: 100,
    costoRun: 200,
    costoTotal: 300,
    costeadoEn: '2026-10-10T00:00:00Z',
  }),
  filaRuteo({ id: 'r2', secuencia: 1, setupHoras: 0, runHoras: 1, totalHoras: 1 }),
];

const COSTOS = [
  {
    id: 'c1',
    revisionId: REVISION_ID,
    categoria: 'material',
    monto: 50,
    nota: null,
  },
  {
    id: 'c2',
    revisionId: REVISION_ID,
    categoria: 'maquina',
    monto: 999,
    nota: null,
  },
] as unknown as CostoRevisionPropuesta[];

const CATALOGOS: CatalogosPropuesta = {
  procesos: [{ id: PROCESO_ID, codigo: 'LAS', nombre: 'Láser' }],
  gruposEquipo: [{ id: GRUPO_ID, codigo: 'GLAS', nombre: 'Grupo Láser', sinTarifa: false }],
  gruposPlaneados: [],
  recursos: [],
  proximasAcciones: [],
  canales: [],
  materiales: [],
  espesores: [],
  errorItems: null,
};

const PERMISOS = {
  editarArticulo: true,
  editarPrecio: true,
  editarRuteo: true,
  editarCosto: true,
  validar: true,
  generarPdf: true,
  enviar: true,
  seguimiento: true,
  aceptar: true,
  crearRevision: true,
  cerrar: true,
} as PermisosPropuesta;

function montar() {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(PanelRuteoCosteo, {
        revision: REVISION,
        items: [ITEM],
        ruteo: RUTEO,
        costos: COSTOS,
        catalogos: CATALOGOS,
        permisos: PERMISOS,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('ruteo estimado con etiquetas visibles (obs. cliente)', () => {
  it('nombra cada campo encima de su control', () => {
    montar();

    expect(screen.getAllByText('Proceso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grupo de equipo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Preparación (h)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operación (h)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total (h)').length).toBeGreaterThan(0);
  });
});

describe('costo total estimado de fabricación (obs. cliente)', () => {
  it('deriva el tiempo por uso y el costo de cada proceso costeado', () => {
    montar();

    const desglose = within(screen.getByTestId('costeo-fabricacion'));
    expect(desglose.getByText('Láser')).toBeDefined();
    expect(desglose.getByText('Grupo Láser')).toBeDefined();
    expect(desglose.getByText('$100.00/h')).toBeDefined();
    // La fila del proceso y el pie «Costo de ruteo» muestran el mismo importe.
    expect(desglose.getAllByText('$300.00')).toHaveLength(2);
    expect(desglose.getByText('Total estimado de fabricación')).toBeDefined();
    // Ruteo costeado (300) + material manual (50); la máquina manual (999) no
    // se suma porque el ruteo costeado la sustituye (C3.3).
    expect(desglose.getAllByText('$350.00').length).toBeGreaterThan(0);
  });

  it('el margen usa el snapshot costeado y no el costo manual de máquina', () => {
    montar();

    // subtotal 1000, costo 350 → margen 65 %.
    expect(screen.getByText('65.00%')).toBeDefined();
  });

  it('sin filas costeadas explica cómo obtener el desglose', () => {
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: consultas },
        createElement(PanelRuteoCosteo, {
          revision: REVISION,
          items: [ITEM],
          ruteo: [filaRuteo({ id: 'r3' })],
          costos: [],
          catalogos: CATALOGOS,
          permisos: PERMISOS,
        }),
      ),
    );

    const desglose = within(screen.getByTestId('costeo-fabricacion'));
    expect(desglose.getByText(/Pulsa «Costear ruteo»/)).toBeDefined();
    expect(desglose.getByText('El desglose se llena al costear el ruteo.')).toBeDefined();
  });
});
