// @vitest-environment jsdom
// G1/G2 (obs. cliente): el ruteo estimado muestra etiquetas visibles sobre sus
// campos (Preparación/Operación/Total en horas) y el desglose «Costo total
// estimado de fabricación» deriva el tiempo por uso y el costo por proceso del
// snapshot costeado, sin sumar dos veces el costo manual de máquina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { costearRuteoRevisionAccion } from '@/modulos/propuestas/acciones/costear-ruteo-revision';
import { editarCostosRevisionAccion } from '@/modulos/propuestas/acciones/editar-costos-revision';
import { editarRuteoItemAccion } from '@/modulos/propuestas/acciones/editar-ruteo-item';
import { PanelRuteoCosteo } from '@/modulos/propuestas/componentes/panel-ruteo-costeo';
import type { FaltantesValidacionPropuesta } from '@/modulos/propuestas/utilidades/validacion-propuesta';
import type {
  CostoRevisionPropuesta,
  PermisosPropuesta,
  PropuestaItem,
  RevisionPropuesta,
  RuteoItemPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_2_ID = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
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
      origenTarifa: 'Tarifa del grupo',
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

function montar(
  parcial: {
    catalogos?: CatalogosPropuesta;
    permisos?: PermisosPropuesta;
    ruteo?: RuteoItemPropuesta[];
    items?: PropuestaItem[];
    costos?: CostoRevisionPropuesta[];
    faltantes?: FaltantesValidacionPropuesta | null;
    utilidadObjetivoPorcentaje?: number;
  } = {},
) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(PanelRuteoCosteo, {
        revision: REVISION,
        items: parcial.items ?? [ITEM],
        ruteo: parcial.ruteo ?? RUTEO,
        costos: parcial.costos ?? COSTOS,
        catalogos: parcial.catalogos ?? CATALOGOS,
        permisos: parcial.permisos ?? PERMISOS,
        faltantes: parcial.faltantes ?? null,
        utilidadObjetivoPorcentaje: parcial.utilidadObjetivoPorcentaje ?? 30,
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

  it('la utilidad sobre costo usa el snapshot costeado y no el costo manual de máquina', () => {
    montar();

    // Venta sin IVA 1000, costo 350 → (1000 − 350) / 350 = 185.71 % sobre costo.
    const celda = within(screen.getByTestId('utilidad-sobre-costo'));
    expect(celda.getByText('Utilidad estimada % sobre costo')).toBeDefined();
    expect(celda.getByText('185.71%')).toBeDefined();
    expect(screen.queryByText('Margen')).toBeNull();
  });

  it('muestra el precio mínimo recomendado (costo × 1.30) sin alerta si la venta lo supera', () => {
    montar();

    const aviso = screen.getByTestId('aviso-utilidad-propuesta');
    expect(aviso.getAttribute('data-bajo-objetivo')).toBe('no');
    expect(within(aviso).getByTestId('precio-minimo-recomendado').textContent).toBe('$455.00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('alerta, sin bloquear, cuando la utilidad queda debajo del objetivo', () => {
    // Material 700 + ruteo costeado 300 = costo 1,000 contra venta 1,000 → 0 %.
    const costosAltos = [
      { ...COSTOS[0], monto: 700 },
    ] as unknown as CostoRevisionPropuesta[];
    montar({ costos: costosAltos });

    const aviso = screen.getByTestId('aviso-utilidad-propuesta');
    expect(aviso.getAttribute('data-bajo-objetivo')).toBe('si');
    expect(within(aviso).getByRole('alert').textContent).toContain(
      'Utilidad por debajo del objetivo de 30 %',
    );
    expect(within(aviso).getByTestId('precio-minimo-recomendado').textContent).toBe('$1,300.00');
    expect(screen.getByTestId('utilidad-sobre-costo').textContent).toContain('0.00%');
    // La propuesta sigue editable: el aviso no deshabilita nada.
    expect(
      (screen.getByLabelText('Setup horas IT01 fila 1') as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('el objetivo configurado cambia el precio mínimo y la alerta sin tocar código', () => {
    montar({ utilidadObjetivoPorcentaje: 200 });

    // 185.71 % < 200 % → alerta; precio mínimo = 350 × 3.
    const aviso = screen.getByTestId('aviso-utilidad-propuesta');
    expect(aviso.getAttribute('data-bajo-objetivo')).toBe('si');
    expect(within(aviso).getByTestId('precio-minimo-recomendado').textContent).toBe('$1,050.00');
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
          utilidadObjetivoPorcentaje: 30,
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

  it('ya no ofrece el campo Máquina (la tarifa sale del grupo de equipo)', () => {
    montar();

    expect(screen.queryByLabelText(/^Máquina IT01/)).toBeNull();
    expect(screen.queryByText('Máquina (opcional)')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Máquina (tarifa del grupo)' })).toBeNull();
  });

  it('un renglón histórico con override de máquina conserva su costo en vivo', () => {
    montar({
      ruteo: [filaRuteo({ id: 'r9', recursoId: RECURSO_ID, setupHoras: 0, runHoras: 1, totalHoras: 1 })],
    });

    expect(screen.getByTestId('costo-estimado-IT01-1').textContent).toContain('$150.00');
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

describe('ruteo: el grupo de equipo se rellena con el mismo nombre del proceso (obs. cliente 2026-10-13)', () => {
  const GRUPO_ROUTER_ID = '77777777-7777-4777-8777-777777777777';
  const PROCESO_ROUTER_ID = '66666666-6666-4666-8666-666666666666';
  const catalogoRouter: CatalogosPropuesta = {
    ...CATALOGOS,
    procesos: [
      ...CATALOGOS.procesos,
      {
        id: PROCESO_ROUTER_ID,
        codigo: 'ROUTER',
        nombre: 'CNC Router',
        grupoEquipoId: null,
        grupoPlaneadoId: null,
        areaTrabajoCodigo: null,
      },
    ],
    gruposEquipo: [
      ...CATALOGOS.gruposEquipo,
      {
        id: GRUPO_ROUTER_ID,
        codigo: 'CNC_ROUTER',
        nombre: 'CNC ROUTER',
        sinTarifa: true,
        tarifaHora: null,
        tarifaMoneda: null,
        origenTarifa: null,
      },
    ],
  };

  it('sin grupo configurado en el proceso, elige el grupo que se llama igual', () => {
    montar({ catalogos: catalogoRouter });

    const proceso = screen.getByLabelText('Proceso IT01 fila 2') as HTMLSelectElement;
    const grupo = screen.getByLabelText('Grupo de equipo IT01 fila 2') as HTMLSelectElement;

    fireEvent.change(proceso, { target: { value: PROCESO_ROUTER_ID } });

    expect(grupo.value).toBe(GRUPO_ROUTER_ID);
  });

  it('la fila que nace del RFQ (proceso sin grupo) ya llega con el grupo sugerido y avisa que falta guardar', () => {
    const filaDelRfq = filaRuteo({
      id: 'rfq-1',
      procesoId: PROCESO_ROUTER_ID,
      grupoEquipoId: null,
    });
    montar({ catalogos: catalogoRouter, ruteo: [filaDelRfq] });

    const grupo = screen.getByLabelText('Grupo de equipo IT01 fila 1') as HTMLSelectElement;
    expect(grupo.value).toBe(GRUPO_ROUTER_ID);
    expect(screen.getByTestId('ruteo-sin-guardar-IT01').textContent).toMatch(/Guardar ruteo/);
  });

  it('«Costear ruteo» guarda primero lo pendiente y luego costea, en un solo paso', async () => {
    vi.mocked(editarRuteoItemAccion).mockResolvedValue({
      exito: true,
      datos: { itemId: ITEM_ID, filas: 1, requiereRevisionRuteo: false, actualizadoEn: 'T1' },
    });
    vi.mocked(costearRuteoRevisionAccion).mockResolvedValue({
      exito: true,
      datos: { renglones: 1, costoRuteo: 0 },
    });
    const filaDelRfq = filaRuteo({ id: 'rfq-1', procesoId: PROCESO_ROUTER_ID, grupoEquipoId: null });
    montar({ catalogos: catalogoRouter, ruteo: [filaDelRfq] });

    fireEvent.click(screen.getByRole('button', { name: 'Costear ruteo' }));

    expect(await screen.findByText('Ruteo guardado y costeado: 1 renglón(es).')).toBeDefined();
    expect(editarRuteoItemAccion).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      actualizadoEn: REVISION.actualizadoEn,
      filas: [
        expect.objectContaining({ procesoId: PROCESO_ROUTER_ID, grupoEquipoId: GRUPO_ROUTER_ID }),
      ],
    });
    // Costea después de guardar, no antes.
    const ordenGuardar = vi.mocked(editarRuteoItemAccion).mock.invocationCallOrder[0] ?? 0;
    const ordenCostear = vi.mocked(costearRuteoRevisionAccion).mock.invocationCallOrder[0] ?? 0;
    expect(ordenGuardar).toBeLessThan(ordenCostear);
  });

  it('con varios ítems pendientes encadena el token fresco de cada guardado', async () => {
    vi.mocked(editarRuteoItemAccion)
      .mockResolvedValueOnce({
        exito: true,
        datos: { itemId: ITEM_ID, filas: 1, requiereRevisionRuteo: false, actualizadoEn: 'T1' },
      })
      .mockResolvedValueOnce({
        exito: true,
        datos: { itemId: ITEM_2_ID, filas: 1, requiereRevisionRuteo: false, actualizadoEn: 'T2' },
      });
    vi.mocked(costearRuteoRevisionAccion).mockResolvedValue({
      exito: true,
      datos: { renglones: 2, costoRuteo: 0 },
    });
    const item2 = { ...ITEM, id: ITEM_2_ID, codigo: 'IT02' } as PropuestaItem;
    montar({
      catalogos: catalogoRouter,
      items: [ITEM, item2],
      ruteo: [
        filaRuteo({ id: 'a', procesoId: PROCESO_ROUTER_ID, grupoEquipoId: null }),
        filaRuteo({ id: 'b', itemId: ITEM_2_ID, procesoId: PROCESO_ROUTER_ID, grupoEquipoId: null }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Costear ruteo' }));

    expect(await screen.findByText('Ruteo guardado y costeado: 2 renglón(es).')).toBeDefined();
    const tokens = vi.mocked(editarRuteoItemAccion).mock.calls.map(
      ([entrada]) => (entrada as { actualizadoEn: string }).actualizadoEn,
    );
    expect(tokens).toEqual([REVISION.actualizadoEn, 'T1']);
  });

  it('si un guardado falla no costea y muestra el motivo', async () => {
    vi.mocked(editarRuteoItemAccion).mockResolvedValue({
      exito: false,
      error: 'La revisión cambió; recarga antes de reintentar',
    });
    const filaDelRfq = filaRuteo({ id: 'rfq-1', procesoId: PROCESO_ROUTER_ID, grupoEquipoId: null });
    montar({ catalogos: catalogoRouter, ruteo: [filaDelRfq] });

    fireEvent.click(screen.getByRole('button', { name: 'Costear ruteo' }));

    expect(await screen.findByText('La revisión cambió; recarga antes de reintentar')).toBeDefined();
    expect(costearRuteoRevisionAccion).not.toHaveBeenCalled();
  });

  it('sin cambios pendientes costea directamente, sin guardar nada', async () => {
    vi.mocked(costearRuteoRevisionAccion).mockResolvedValue({
      exito: true,
      datos: { renglones: 2, costoRuteo: 300 },
    });
    montar();

    fireEvent.click(screen.getByRole('button', { name: 'Costear ruteo' }));

    expect(await screen.findByText('Ruteo costeado: 2 renglón(es).')).toBeDefined();
    expect(editarRuteoItemAccion).not.toHaveBeenCalled();
  });

  it('con cambios sin guardar muestra un solo aviso (no también «falta costear»)', () => {
    const filaDelRfq = filaRuteo({ id: 'rfq-1', procesoId: PROCESO_ROUTER_ID, grupoEquipoId: null });
    montar({
      catalogos: catalogoRouter,
      ruteo: [filaDelRfq],
      faltantes: {
        sinItemsActivos: false,
        itemsSinRuteo: [],
        itemsSinCostear: ['IT01'],
        sinArchivos: false,
        confirmaciones: [],
        contenido: ['ítem IT01: costear el ruteo'],
        mensajes: ['ítem IT01: costear el ruteo'],
      },
    });

    expect(screen.getByTestId('ruteo-sin-guardar-IT01')).toBeDefined();
    expect(screen.queryByTestId('faltante-costeo-IT01')).toBeNull();
  });

  it('un ruteo ya guardado con su grupo no muestra aviso de cambios sin guardar', () => {
    montar({ catalogos: catalogoRouter });

    expect(screen.queryByTestId('ruteo-sin-guardar-IT01')).toBeNull();
  });

  it('sin permiso de ruteo no se inventan valores: el grupo vacío sigue vacío', () => {
    const filaDelRfq = filaRuteo({
      id: 'rfq-1',
      procesoId: PROCESO_ROUTER_ID,
      grupoEquipoId: null,
    });
    montar({
      catalogos: catalogoRouter,
      ruteo: [filaDelRfq],
      permisos: { ...PERMISOS, editarRuteo: false },
    });

    expect((screen.getByLabelText('Grupo de equipo IT01 fila 1') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('ruteo-sin-guardar-IT01')).toBeNull();
  });

  it('si no hay un grupo con ese nombre lo deja vacío para elegirlo', () => {
    montar({ catalogos: catalogoRouter });

    const grupo = screen.getByLabelText('Grupo de equipo IT01 fila 2') as HTMLSelectElement;
    fireEvent.change(screen.getByLabelText('Proceso IT01 fila 2'), {
      target: { value: PROCESO_SECUNDARIO_ID },
    });

    expect(grupo.value).toBe('');
  });
});

describe('costeo interno: solo Material y Otros (obs. cliente 2026-10-13)', () => {
  it('ofrece únicamente Material y Otros', () => {
    montar();

    expect(screen.getByLabelText('Costo Material')).toBeDefined();
    expect(screen.getByLabelText('Costo Otros')).toBeDefined();
    for (const retirada of ['Máquina', 'Mano de obra', 'Gastos directos', 'Subcontratación']) {
      expect(screen.queryByLabelText(`Costo ${retirada}`)).toBeNull();
    }
  });

  it('un costo histórico de categoría retirada se avisa y sigue sumando al total', () => {
    montar();

    const nota = screen.getByTestId('costos-categorias-retiradas');
    expect(nota.textContent).toContain('Máquina');
    expect(nota.textContent).toContain('$999.00');
  });

  it('al guardar conserva las categorías retiradas y guarda Otros como gastos directos', async () => {
    vi.mocked(editarCostosRevisionAccion).mockResolvedValue({ exito: true, datos: undefined });
    montar();

    fireEvent.change(screen.getByLabelText('Costo Otros'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar costos' }));

    await waitFor(() => expect(editarCostosRevisionAccion).toHaveBeenCalledTimes(1));
    expect(editarCostosRevisionAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        costos: expect.arrayContaining([
          { categoria: 'material', monto: 50 },
          { categoria: 'maquina', monto: 999 },
          { categoria: 'gastos_directos', monto: 25 },
        ]),
      }),
    );
  });
});

describe('validar: ruteo y costeo por proceso en rojo suave (obs. cliente 2026-10-13)', () => {
  const faltantes = (parcial: Partial<FaltantesValidacionPropuesta>): FaltantesValidacionPropuesta => ({
    sinItemsActivos: false,
    itemsSinRuteo: [],
    itemsSinCostear: [],
    sinArchivos: false,
    confirmaciones: [],
    contenido: [],
    mensajes: [],
    ...parcial,
  });

  it('un ítem sin ruteo se marca y explica qué agregar', () => {
    montar({ ruteo: [], faltantes: faltantes({ itemsSinRuteo: ['IT01'] }) });

    const mensaje = screen.getByTestId('faltante-ruteo-IT01');
    expect(mensaje.textContent).toMatch(/al menos un proceso/i);
    expect(mensaje.closest('[data-faltante]')?.getAttribute('data-faltante')).toBe('si');
  });

  it('un ruteo sin costear se marca y resalta el botón Costear ruteo', () => {
    montar({ faltantes: faltantes({ itemsSinCostear: ['IT01'] }) });

    expect(screen.getByTestId('faltante-costeo-IT01').textContent).toMatch(/Costear ruteo/);
    const boton = screen.getByRole('button', { name: 'Costear ruteo' });
    expect(boton.className).not.toContain('border-borde');
  });

  it('sin faltantes no hay marcas rojas', () => {
    montar();

    expect(screen.queryByTestId('faltante-ruteo-IT01')).toBeNull();
    expect(screen.queryByTestId('faltante-costeo-IT01')).toBeNull();
    expect(
      document.querySelector('[data-faltante="si"]'),
    ).toBeNull();
  });
});

describe('costeo interno: campos de texto libre con detalle (obs. cliente 2026-10-13)', () => {
  it('Material y Otros ya no son campos numéricos: aceptan lo que se teclea', () => {
    montar();

    for (const etiqueta of ['Costo Material', 'Costo Otros']) {
      const campo = screen.getByLabelText(etiqueta) as HTMLInputElement;
      expect(campo.type).toBe('text');
      expect(campo.getAttribute('inputmode')).toBe('decimal');
    }
  });

  it('interpreta «$1,250.50» como 1250.5 y guarda el detalle capturado', async () => {
    vi.mocked(editarCostosRevisionAccion).mockResolvedValue({ exito: true, datos: undefined });
    montar({ costos: [] });

    fireEvent.change(screen.getByLabelText('Costo Material'), { target: { value: '$1,250.50' } });
    fireEvent.change(screen.getByLabelText('Detalle de Material'), {
      target: { value: 'Acero A36 calibre 11' },
    });
    fireEvent.change(screen.getByLabelText('Costo Otros'), { target: { value: '80,5' } });
    fireEvent.change(screen.getByLabelText('Detalle de Otros'), { target: { value: 'Embalaje' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar costos' }));

    await waitFor(() => expect(editarCostosRevisionAccion).toHaveBeenCalledTimes(1));
    expect(editarCostosRevisionAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        costos: [
          { categoria: 'material', monto: 1250.5, nota: 'Acero A36 calibre 11' },
          { categoria: 'gastos_directos', monto: 80.5, nota: 'Embalaje' },
        ],
      }),
    );
  });

  it('muestra el detalle ya guardado y lo conserva en las categorías retiradas', async () => {
    vi.mocked(editarCostosRevisionAccion).mockResolvedValue({ exito: true, datos: undefined });
    montar({
      costos: [
        { id: 'c1', revisionId: REVISION_ID, categoria: 'material', monto: 50, nota: 'Lámina 3 mm' },
        { id: 'c2', revisionId: REVISION_ID, categoria: 'maquina', monto: 999, nota: 'Histórico' },
      ] as unknown as CostoRevisionPropuesta[],
    });

    expect((screen.getByLabelText('Detalle de Material') as HTMLInputElement).value).toBe('Lámina 3 mm');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar costos' }));
    await waitFor(() => expect(editarCostosRevisionAccion).toHaveBeenCalledTimes(1));
    expect(editarCostosRevisionAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        costos: expect.arrayContaining([
          { categoria: 'material', monto: 50, nota: 'Lámina 3 mm' },
          { categoria: 'maquina', monto: 999, nota: 'Histórico' },
        ]),
      }),
    );
  });

  it('un monto que no es número se marca en rojo y no se envía', async () => {
    montar();

    fireEvent.change(screen.getByLabelText('Costo Material'), { target: { value: 'unos cuantos' } });

    const campo = screen.getByLabelText('Costo Material') as HTMLInputElement;
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.className).toContain('border-peligro');
    expect(screen.getByText('Escribe un monto válido, por ejemplo 1250.50.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar costos' }));
    expect(await screen.findByText(/Revisa el monto de Material/)).toBeDefined();
    expect(editarCostosRevisionAccion).not.toHaveBeenCalled();
  });

  it('un campo vacío no es un error (la categoría simplemente no se guarda)', () => {
    montar({ costos: [] });

    expect(screen.getByLabelText('Costo Otros').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Escribe un monto válido, por ejemplo 1250.50.')).toBeNull();
  });
});

describe('ruteo: la tarifa dice de dónde sale (tarifario único)', () => {
  it('rotula la tarifa de la estación de Tarifas / TC', () => {
    const catalogos: CatalogosPropuesta = {
      ...CATALOGOS,
      gruposEquipo: [
        {
          ...CATALOGOS.gruposEquipo[0]!,
          tarifaHora: 650,
          origenTarifa: 'Tarifas / TC · Corte láser',
        },
      ],
    };
    montar({ catalogos });

    expect(screen.getByTestId('costo-estimado-IT01-1').textContent).toContain(
      '$650.00/h · Tarifas / TC · Corte láser',
    );
  });

  it('sin tarifa explica dónde configurarla', () => {
    montar();

    fireEvent.change(screen.getByLabelText('Proceso IT01 fila 2'), {
      target: { value: PROCESO_SECUNDARIO_ID },
    });

    const aviso = screen.getByTestId('costo-estimado-IT01-2').textContent ?? '';
    expect(aviso).toContain('Sin tarifa configurada');
    expect(aviso).toContain('Elige el grupo de equipo.');
  });
});
