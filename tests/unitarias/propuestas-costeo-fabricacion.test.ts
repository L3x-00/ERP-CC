// @vitest-environment jsdom
// G1/G2 (obs. cliente): el ruteo estimado muestra etiquetas visibles sobre sus
// campos (Preparación/Operación/Total en horas) y el desglose «Costo total
// estimado de fabricación» deriva el tiempo por uso y el costo por proceso del
// snapshot costeado, sin sumar dos veces el costo manual de máquina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const PROCESO_SECUNDARIO_ID = '99999999-9999-4999-8999-999999999999';
const GRUPO_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RECURSO_ID = '88888888-8888-4888-8888-888888888888';
const AREA_CODIGO = 'LASER';

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
  procesos: [
    {
      id: PROCESO_ID,
      codigo: 'LAS',
      nombre: 'Láser',
      grupoEquipoId: GRUPO_ID,
      grupoPlaneadoId: null,
      areaTrabajoCodigo: AREA_CODIGO,
    },
    {
      id: PROCESO_SECUNDARIO_ID,
      codigo: 'DOB',
      nombre: 'Doblez',
      grupoEquipoId: null,
      grupoPlaneadoId: null,
      areaTrabajoCodigo: null,
    },
  ],
  gruposEquipo: [
    {
      id: GRUPO_ID,
      codigo: 'GLAS',
      nombre: 'Grupo Láser',
      sinTarifa: false,
      tarifaHora: 100,
      tarifaMoneda: 'MXN',
    },
  ],
  gruposPlaneados: [],
  recursos: [
    {
      id: RECURSO_ID,
      nombre: 'Máquina 1',
      grupoEquipoId: GRUPO_ID,
      tarifaHora: 150,
      tarifaMoneda: 'MXN',
    },
  ],
  proximasAcciones: [],
  canales: [],
  areasTrabajo: [{ codigo: AREA_CODIGO, nombre: 'Área Láser' }],
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

function montar(parcial: { catalogos?: CatalogosPropuesta; permisos?: PermisosPropuesta } = {}) {
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
        catalogos: parcial.catalogos ?? CATALOGOS,
        permisos: parcial.permisos ?? PERMISOS,
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

describe('ruteo 4b: grupo por proceso y costo en vivo (obs. cliente)', () => {
  it('al elegir un proceso autocompleta su grupo de equipo y rotula el área', () => {
    montar();

    expect(
      screen.getAllByRole('option', { name: 'Láser · Área Láser' }).length,
    ).toBeGreaterThan(0);

    const procesoFila2 = screen.getByLabelText('Proceso IT01 fila 2') as HTMLSelectElement;
    const grupoFila2 = screen.getByLabelText('Grupo de equipo IT01 fila 2') as HTMLSelectElement;
    expect(grupoFila2.value).toBe(GRUPO_ID);

    fireEvent.change(procesoFila2, { target: { value: PROCESO_SECUNDARIO_ID } });
    expect(grupoFila2.value).toBe('');

    fireEvent.change(procesoFila2, { target: { value: PROCESO_ID } });
    expect(grupoFila2.value).toBe(GRUPO_ID);
  });

  it('muestra el costo estimado en vivo con la tarifa del grupo', () => {
    montar();

    // 3 h × $100/h y 1 h × $100/h antes de costear.
    expect(screen.getByTestId('costo-estimado-IT01-1').textContent).toContain('$300.00');
    expect(screen.getByTestId('costo-estimado-IT01-1').textContent).toContain('$100.00/h');
    expect(screen.getByTestId('costo-estimado-IT01-2').textContent).toContain('$100.00');
  });

  it('usa el override de la máquina cuando está seleccionada', () => {
    montar();

    const recursoFila2 = screen.getByLabelText('Máquina IT01 fila 2') as HTMLSelectElement;
    fireEvent.change(recursoFila2, { target: { value: RECURSO_ID } });

    expect(screen.getByTestId('costo-estimado-IT01-2').textContent).toContain('$150.00');
  });

  it('avisa cuando el renglón no tiene tarifa configurada', () => {
    montar();

    fireEvent.change(screen.getByLabelText('Proceso IT01 fila 2'), {
      target: { value: PROCESO_SECUNDARIO_ID },
    });

    expect(screen.getByTestId('costo-estimado-IT01-2').textContent).toContain(
      'Sin tarifa configurada',
    );
  });

  it('avisa cuando la tarifa está en otra moneda que la propuesta', () => {
    const catalogosUsd: CatalogosPropuesta = {
      ...CATALOGOS,
      gruposEquipo: [{ ...CATALOGOS.gruposEquipo[0]!, tarifaMoneda: 'USD' }],
    };
    montar({ catalogos: catalogosUsd });

    expect(screen.getByTestId('costo-estimado-IT01-1').textContent).toContain(
      'otra moneda que la propuesta',
    );
  });

  it('sin permiso de costo no se muestra el costo estimado', () => {
    montar({ permisos: { ...PERMISOS, editarCosto: false } });

    expect(screen.queryByTestId('costo-estimado-IT01-1')).toBeNull();
  });
});
