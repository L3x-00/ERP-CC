// @vitest-environment jsdom
// Nota de convención: `vitest.config.ts` solo incluye `tests/**/*.test.ts`
// (sin `.tsx`), así que el componente se monta con `createElement` en vez de
// JSX (mismo patrón que `propuestas-archivos-historial.test.ts`).
//
// C3.1 (UI): el alta de un ítem propio aparece solo en una revisión B..Z en
// DRAFT y con permiso de artículo; filtra espesores por material, bloquea el
// doble envío, conserva lo capturado ante error, anuncia el `ITxx` asignado y
// etiqueta cada fila con la revisión donde el ítem fue agregado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { agregarMock, editarMock } = vi.hoisted(() => ({
  agregarMock: vi.fn(),
  editarMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/agregar-item-propuesta', () => ({
  agregarItemPropuestaAccion: (...argumentos: unknown[]) => agregarMock(...argumentos),
}));
vi.mock('@/modulos/propuestas/acciones/editar-item-propuesta', () => ({
  editarItemPropuestaAccion: (...argumentos: unknown[]) => editarMock(...argumentos),
}));

import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { EditorItemsPropuesta } from '@/modulos/propuestas/componentes/editor-items-propuesta';
import type {
  PermisosPropuesta,
  PropuestaItem,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REV_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REV_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_HEREDADO_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ITEM_NUEVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MATERIAL_ACERO_ID = '11111111-1111-4111-8111-111111111111';
const MATERIAL_ALUMINIO_ID = '22222222-2222-4222-8222-222222222222';
const ESPESOR_ACERO_3_ID = '33333333-3333-4333-8333-333333333333';
const ESPESOR_ACERO_6_ID = '44444444-4444-4444-8444-444444444444';

const CATALOGOS: CatalogosPropuesta = {
  procesos: [],
  gruposEquipo: [],
  gruposPlaneados: [],
  recursos: [],
  proximasAcciones: [],
  materiales: [
    { id: MATERIAL_ACERO_ID, codigo: 'ACE', nombre: 'Acero' },
    { id: MATERIAL_ALUMINIO_ID, codigo: 'ALU', nombre: 'Aluminio' },
  ],
  espesores: [
    { id: ESPESOR_ACERO_3_ID, materialId: MATERIAL_ACERO_ID, etiqueta: '3 mm', espesorMm: 3 },
    { id: ESPESOR_ACERO_6_ID, materialId: MATERIAL_ACERO_ID, etiqueta: '6 mm', espesorMm: 6 },
  ],
  errorItems: null,
};

const PERMISOS_COMPLETOS = {
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

function revision(parcial: Partial<RevisionPropuesta>): RevisionPropuesta {
  return {
    id: REV_B_ID,
    propuestaId: PROPUESTA_ID,
    letra: 'B',
    folioRevision: 'CNC-0001-B',
    estado: 'DRAFT',
    snapshotCabecera: { ivaPorcentaje: 16, moneda: 'MXN' },
    ...parcial,
  } as unknown as RevisionPropuesta;
}

const REVISION_A = revision({ id: REV_A_ID, letra: 'A', folioRevision: 'CNC-0001-A' });
const REVISION_B = revision({});
const REVISIONES = [REVISION_A, REVISION_B];

function item(parcial: Partial<PropuestaItem> & { id: string }): PropuestaItem {
  return {
    revisionId: REV_B_ID,
    revisionOrigenId: REV_A_ID,
    rfqItemId: null,
    codigo: 'IT01',
    descripcion: 'Brida heredada',
    cantidad: 2,
    materialId: null,
    espesorId: null,
    acabado: null,
    notas: null,
    precioUnitario: 100,
    esDescuento: false,
    activo: true,
    creadoEn: '2026-10-01T15:00:00.000Z',
    actualizadoEn: '2026-10-01T15:00:00.000Z',
    ...parcial,
  };
}

const ITEMS = [
  item({ id: ITEM_HEREDADO_ID }),
  item({ id: ITEM_NUEVO_ID, codigo: 'IT05', revisionOrigenId: REV_B_ID, descripcion: 'Placa nueva' }),
];

const ITEM_CREADO: PropuestaItem = item({
  id: '55555555-5555-4555-8555-555555555555',
  codigo: 'IT07',
  revisionOrigenId: REV_B_ID,
  descripcion: 'Placa base',
});

function renderizarEditor(
  opciones: {
    revisionActiva?: RevisionPropuesta;
    permisos?: PermisosPropuesta;
    catalogos?: CatalogosPropuesta | null;
    items?: PropuestaItem[];
  } = {},
) {
  const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: clienteConsultas },
      createElement(EditorItemsPropuesta, {
        revision: opciones.revisionActiva ?? REVISION_B,
        revisiones: REVISIONES,
        items: opciones.items ?? ITEMS,
        ruteo: [],
        costos: [],
        catalogos: opciones.catalogos === undefined ? CATALOGOS : opciones.catalogos,
        permisos: opciones.permisos ?? PERMISOS_COMPLETOS,
      }),
    ),
  );
}

function llenarMinimo(): void {
  fireEvent.change(screen.getByLabelText(/^Descripción \*$/), { target: { value: 'Placa base' } });
  fireEvent.change(screen.getByLabelText(/^Cantidad \*$/), { target: { value: '4' } });
}

function enviarAlta(): void {
  fireEvent.submit(screen.getByTestId('alta-item-propuesta'));
}

beforeEach(() => {
  vi.clearAllMocks();
  agregarMock.mockResolvedValue({ exito: true, datos: ITEM_CREADO });
});

afterEach(() => {
  cleanup();
});

describe('EditorItemsPropuesta — alta visible solo en B..Z DRAFT', () => {
  it('ofrece el alta en una revisión B en borrador con permiso de artículo', () => {
    renderizarEditor();

    expect(screen.getByTestId('alta-item-propuesta')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Agregar ítem' })).toBeDefined();
  });

  it('no ofrece el alta en la revisión A, ni siquiera en borrador', () => {
    renderizarEditor({ revisionActiva: REVISION_A, items: [] });

    expect(screen.queryByTestId('alta-item-propuesta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agregar ítem' })).toBeNull();
  });

  it('no ofrece el alta en una revisión B que ya no es borrador', () => {
    renderizarEditor({ revisionActiva: revision({ estado: 'SENT' }) });

    expect(screen.queryByTestId('alta-item-propuesta')).toBeNull();
  });

  it('no ofrece el alta sin permiso de artículo', () => {
    renderizarEditor({ permisos: { ...PERMISOS_COMPLETOS, editarArticulo: false } });

    expect(screen.queryByTestId('alta-item-propuesta')).toBeNull();
  });

  it('oculta el precio sin permiso de precio', () => {
    renderizarEditor({ permisos: { ...PERMISOS_COMPLETOS, editarPrecio: false } });

    expect(screen.getByTestId('alta-item-propuesta')).toBeDefined();
    expect(screen.queryByLabelText(/Precio unitario/)).toBeNull();
  });
});

describe('EditorItemsPropuesta — material, espesor y envío', () => {
  it('filtra los espesores por material y limpia el espesor al cambiarlo', () => {
    renderizarEditor();

    const espesor = screen.getByLabelText('Espesor') as HTMLSelectElement;
    expect(espesor.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Material'), { target: { value: MATERIAL_ACERO_ID } });
    expect(espesor.disabled).toBe(false);
    expect(
      Array.from(espesor.options)
        .map((opcion) => opcion.value)
        .filter((valor) => valor !== ''),
    ).toEqual([ESPESOR_ACERO_3_ID, ESPESOR_ACERO_6_ID]);

    fireEvent.change(espesor, { target: { value: ESPESOR_ACERO_6_ID } });
    expect(espesor.value).toBe(ESPESOR_ACERO_6_ID);

    fireEvent.change(screen.getByLabelText('Material'), { target: { value: MATERIAL_ALUMINIO_ID } });
    expect(espesor.value).toBe('');
    expect(espesor.disabled).toBe(true);
  });

  it('exige espesor cuando el material tiene espesores configurados', async () => {
    renderizarEditor();

    llenarMinimo();
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: MATERIAL_ACERO_ID } });
    enviarAlta();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/espesor/i);
    });
    expect(agregarMock).not.toHaveBeenCalled();
  });

  it('permite guardar sin espesor si el material no tiene espesores', async () => {
    renderizarEditor();

    llenarMinimo();
    fireEvent.change(screen.getByLabelText('Material'), {
      target: { value: MATERIAL_ALUMINIO_ID },
    });
    enviarAlta();

    await waitFor(() => {
      expect(agregarMock).toHaveBeenCalledTimes(1);
    });
    expect(agregarMock.mock.calls[0]?.[0]).toMatchObject({
      revisionId: REV_B_ID,
      descripcion: 'Placa base',
      cantidad: 4,
      materialId: MATERIAL_ALUMINIO_ID,
    });
    expect(agregarMock.mock.calls[0]?.[0]).not.toHaveProperty('espesorId');
  });

  it('omite el precio cuando se deja vacío y lo envía cuando se captura', async () => {
    renderizarEditor();

    llenarMinimo();
    enviarAlta();
    await waitFor(() => expect(agregarMock).toHaveBeenCalledTimes(1));
    expect(agregarMock.mock.calls[0]?.[0]).not.toHaveProperty('precioUnitario');

    llenarMinimo();
    fireEvent.change(screen.getByLabelText(/Precio unitario/), { target: { value: '250.5' } });
    fireEvent.click(screen.getByLabelText(/^Es descuento/));
    enviarAlta();

    await waitFor(() => expect(agregarMock).toHaveBeenCalledTimes(2));
    expect(agregarMock.mock.calls[1]?.[0]).toMatchObject({
      precioUnitario: 250.5,
      esDescuento: true,
    });
  });

  it('bloquea el doble envío mientras la acción está en vuelo', async () => {
    const enVuelo: { resolver: ((valor: unknown) => void) | null } = { resolver: null };
    agregarMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          enVuelo.resolver = resolve;
        }),
    );
    renderizarEditor();

    llenarMinimo();
    enviarAlta();
    enviarAlta();
    enviarAlta();

    expect(agregarMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: /Agregando/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    enVuelo.resolver?.({ exito: true, datos: ITEM_CREADO });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Agregar ítem' })).toBeDefined();
    });
  });

  it('conserva los datos capturados cuando el servidor rechaza', async () => {
    agregarMock.mockResolvedValue({
      exito: false,
      error: 'Un ítem nuevo solo se puede agregar en una revisión B o posterior en borrador',
    });
    renderizarEditor();

    llenarMinimo();
    fireEvent.change(screen.getByLabelText('Acabado (opcional)'), { target: { value: 'Pintura' } });
    enviarAlta();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/revisión B/i);
    });
    expect((screen.getByLabelText(/^Descripción \*$/) as HTMLInputElement).value).toBe('Placa base');
    expect((screen.getByLabelText(/^Cantidad \*$/) as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Acabado (opcional)') as HTMLInputElement).value).toBe('Pintura');
  });

  it('recupera el formulario y conserva los datos si la llamada lanza una excepción', async () => {
    agregarMock.mockRejectedValue(new Error('red no disponible'));
    renderizarEditor();

    llenarMinimo();
    enviarAlta();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/intenta nuevamente/i);
    });
    expect((screen.getByLabelText(/^Descripción \*$/) as HTMLInputElement).value).toBe('Placa base');
    expect((screen.getByRole('button', { name: 'Agregar ítem' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('anuncia el ITxx asignado y limpia el formulario solo tras el éxito', async () => {
    renderizarEditor();

    llenarMinimo();
    fireEvent.change(screen.getByLabelText('Acabado (opcional)'), { target: { value: 'Pintura' } });
    enviarAlta();

    await waitFor(() => {
      const anuncio = screen.getByText(/Ítem IT07 agregado/);
      expect(anuncio.getAttribute('role')).toBe('status');
    });
    expect((screen.getByLabelText(/^Descripción \*$/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Cantidad \*$/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Acabado (opcional)') as HTMLInputElement).value).toBe('');
  });

  it('no permite enviar mientras los catálogos no cargan', () => {
    renderizarEditor({ catalogos: null });

    expect((screen.getByRole('button', { name: 'Agregar ítem' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('explica el fallo de catálogos en vez de dejar el alta bloqueada sin motivo', () => {
    const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: clienteConsultas },
        createElement(EditorItemsPropuesta, {
          revision: REVISION_B,
          revisiones: REVISIONES,
          items: ITEMS,
          ruteo: [],
          costos: [],
          catalogos: null,
          errorCatalogos: 'No se pudieron cargar los catálogos de la propuesta',
          permisos: PERMISOS_COMPLETOS,
        }),
      ),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/no se pudieron cargar/i);
  });
});

describe('EditorItemsPropuesta — revisión de origen por fila', () => {
  it('muestra la revisión donde cada ítem fue agregado', () => {
    renderizarEditor();

    const heredado = screen.getByTestId(`item-propuesta-${ITEM_HEREDADO_ID}`);
    expect(heredado.textContent).toContain('Agregado en Rev A');
    const nuevo = screen.getByTestId(`item-propuesta-${ITEM_NUEVO_ID}`);
    expect(nuevo.textContent).toContain('Agregado en Rev B');
  });

  it('deja una revisión anterior congelada sin controles de edición ni alta', () => {
    renderizarEditor({
      revisionActiva: revision({ id: REV_A_ID, letra: 'A', estado: 'SENT' }),
      items: [item({ id: ITEM_HEREDADO_ID, revisionId: REV_A_ID, revisionOrigenId: REV_A_ID })],
    });

    expect(screen.queryByTestId('alta-item-propuesta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect((screen.getByLabelText('Descripción IT01') as HTMLInputElement).disabled).toBe(true);
  });
});
