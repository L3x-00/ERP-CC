// @vitest-environment jsdom
// Nota de convención: `vitest.config.ts` solo incluye `tests/**/*.test.ts`
// (sin `.tsx`), así que el componente se monta con `createElement` en vez de
// JSX (mismo patrón que `rfq-resumen.test.ts`).
//
// C2.3a / CLI-06 / DC-04: la Propuesta lee el linaje completo de archivos
// (`entidad + entidad_id + tema + nombre_erp`), muestra la versión vigente por
// defecto y permite consultar/abrir las históricas sin ofrecer borrado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  firmarMock,
  abrirVentanaMock,
  prepararSubidaMock,
  confirmarSubidaMock,
  descartarSubidaMock,
  subirDirectoMock,
} = vi.hoisted(() => ({
  firmarMock: vi.fn(),
  abrirVentanaMock: vi.fn(),
  prepararSubidaMock: vi.fn(),
  confirmarSubidaMock: vi.fn(),
  descartarSubidaMock: vi.fn(),
  subirDirectoMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/firmar-archivo-propuesta', () => ({
  firmarArchivoPropuestaAccion: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));
vi.mock('@/modulos/propuestas/acciones/subir-archivo-propuesta', () => ({
  prepararSubidaArchivoPropuestaAccion: (...argumentos: unknown[]) =>
    prepararSubidaMock(...argumentos),
  confirmarArchivoPropuestaAccion: (...argumentos: unknown[]) => confirmarSubidaMock(...argumentos),
  descartarSubidaArchivoPropuestaAccion: (...argumentos: unknown[]) =>
    descartarSubidaMock(...argumentos),
}));
// El binario sube directo a Storage con el cliente del navegador: aquí solo se
// ejercita el contrato de metadatos que el panel pasa a las Server Actions.
vi.mock('@/nucleo/almacenamiento/archivos/subida-navegador', () => ({
  subirArchivoDirecto: (...argumentos: unknown[]) => subirDirectoMock(...argumentos),
}));

import {
  obtenerArchivosDePropuesta,
  type ArchivoPropuesta,
} from '@/modulos/propuestas/servicios/obtener-propuesta';
import { PanelArchivosPropuesta } from '@/modulos/propuestas/componentes/panel-archivos-propuesta';
import { PanelPdfsPropuesta } from '@/modulos/propuestas/componentes/panel-pdfs-propuesta';
import type {
  PdfRevisionPropuesta,
  PropuestaItem,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPUESTA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RFQ_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RFQ_ITEM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REVISION_OTRA_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_OTRO_ID = '22222222-2222-4222-8222-222222222222';
const RFQ_ITEM_OTRO_ID = '33333333-3333-4333-8333-333333333333';
const PROPIO_V2 = 'e1111111-1111-4111-8111-111111111111';
const PROPIO_V1 = 'e2222222-2222-4222-8222-222222222222';
const HEREDADO = 'e3333333-3333-4333-8333-333333333333';
const POR_ITEM = 'e4444444-4444-4444-8444-444444444444';

type ConsultaFalsa = { eq: Record<string, unknown>; or: string[] };

/** Cadena mínima de PostgREST para `archivos` con `.or()` y `.order()`. */
function clienteFalso(filas: unknown[]) {
  const consulta: ConsultaFalsa = { eq: {}, or: [] };
  const cadena = {
    select: () => cadena,
    eq: (columna: string, valor: unknown) => {
      consulta.eq[columna] = valor;
      return cadena;
    },
    or: (expresion: string) => {
      consulta.or.push(expresion);
      return cadena;
    },
    order: async () => ({ data: filas, error: null }),
  };
  return { cliente: { from: () => cadena }, consulta };
}

function archivo(parcial: Partial<ArchivoPropuesta> & { id: string }): ArchivoPropuesta {
  return {
    entidad: 'propuesta_revision',
    entidadId: REVISION_ID,
    temaCodigo: 'general',
    nombreOriginal: 'cotizacion.pdf',
    nombreErp: 'cotizacion.pdf',
    rutaStorage: `propuesta_revision/${REVISION_ID}/x-cotizacion.pdf`,
    bucket: 'adjuntos',
    mime: 'application/pdf',
    tamanoBytes: 1024,
    version: 1,
    vigente: true,
    reemplazaA: null,
    creadoEn: '2026-10-01T15:00:00.000Z',
    ...parcial,
  };
}

const REVISION = {
  id: REVISION_ID,
  propuestaId: PROPUESTA_ID,
  estado: 'DRAFT',
  letra: 'A',
} as unknown as RevisionPropuesta;

const REVISION_OTRA = {
  id: REVISION_OTRA_ID,
  propuestaId: PROPUESTA_ID,
  estado: 'DRAFT',
  letra: 'B',
} as unknown as RevisionPropuesta;

const ITEM_BAJA_ID = '77777777-7777-4777-8777-777777777777';

const ITEMS = [
  {
    id: ITEM_ID,
    revisionId: REVISION_ID,
    rfqItemId: RFQ_ITEM_ID,
    codigo: 'IT01',
    descripcion: 'Brida mecanizada',
    activo: true,
  },
  {
    id: ITEM_OTRO_ID,
    revisionId: REVISION_OTRA_ID,
    rfqItemId: RFQ_ITEM_OTRO_ID,
    codigo: 'IT02',
    descripcion: 'Soporte de otra revisión',
    activo: true,
  },
  {
    id: ITEM_BAJA_ID,
    revisionId: REVISION_ID,
    rfqItemId: null,
    codigo: 'IT03',
    descripcion: 'Ítem dado de baja',
    activo: false,
  },
] as unknown as PropuestaItem[];

const PROPIOS = [
  archivo({
    id: PROPIO_V2,
    version: 2,
    vigente: true,
    reemplazaA: PROPIO_V1,
    creadoEn: '2026-10-02T15:00:00.000Z',
  }),
  archivo({ id: PROPIO_V1, version: 1, vigente: false }),
];
const HEREDADOS = [
  archivo({
    id: HEREDADO,
    entidad: 'rfq',
    entidadId: RFQ_ID,
    temaCodigo: null,
    nombreOriginal: 'plano.dxf',
    nombreErp: 'plano.dxf',
  }),
];
const POR_ITEMS = [
  archivo({
    id: POR_ITEM,
    entidad: 'propuesta_item',
    entidadId: ITEM_ID,
    nombreOriginal: 'brida.dwg',
    nombreErp: 'brida.dwg',
  }),
];

function renderizarPanel() {
  const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: clienteConsultas },
      createElement(PanelArchivosPropuesta, {
        revision: REVISION,
        revisiones: [REVISION, REVISION_OTRA],
        archivosPropios: PROPIOS,
        archivosHeredados: HEREDADOS,
        archivosPorItem: POR_ITEMS,
        items: ITEMS,
        puedeSubir: true,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  firmarMock.mockResolvedValue({ exito: true, datos: { url: 'https://firmada/propuesta' } });
  prepararSubidaMock.mockResolvedValue({
    exito: true,
    datos: { bucket: 'propuestas-archivos', ruta: 'ruta/pendiente.dxf', token: 't', mime: 'x' },
  });
  confirmarSubidaMock.mockResolvedValue({ exito: true, datos: { id: 'nuevo', version: 1 } });
  descartarSubidaMock.mockResolvedValue({ exito: true, datos: null });
  // Replica el orquestador real: prepara, "sube" y confirma con la ruta emitida.
  subirDirectoMock.mockImplementation(
    async (
      _archivo: File,
      pasos: {
        preparar: () => Promise<{ exito: boolean; datos?: { ruta: string }; error?: string }>;
        confirmar: (ruta: string) => Promise<{ exito: boolean; datos?: unknown; error?: string }>;
      },
    ) => {
      const preparada = await pasos.preparar();
      if (!preparada.exito || !preparada.datos) {
        throw new Error(preparada.error ?? 'No se pudo preparar el archivo');
      }
      const confirmada = await pasos.confirmar(preparada.datos.ruta);
      if (!confirmada.exito) throw new Error(confirmada.error ?? 'No se pudo vincular el archivo');
      return confirmada.datos;
    },
  );
  vi.stubGlobal('open', abrirVentanaMock);
});

/** Selecciona un archivo en el input del formulario de subida. */
function elegirArchivo(nombre = 'brida.dxf', tamano = 2048): File {
  const archivo = new File(['x'], nombre, { type: 'application/octet-stream' });
  Object.defineProperty(archivo, 'size', { value: tamano });
  fireEvent.change(screen.getByLabelText('Archivo de la propuesta'), {
    target: { files: [archivo] },
  });
  return archivo;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('obtenerArchivosDePropuesta — linaje completo', () => {
  it('no filtra por vigencia y expone vigencia, nombre ERP y reemplazo', async () => {
    const { cliente, consulta } = clienteFalso([
      {
        id: PROPIO_V2,
        entidad: 'propuesta_revision',
        entidad_id: REVISION_ID,
        tema_codigo: 'general',
        nombre_original: 'cotizacion.pdf',
        nombre_erp: 'cotizacion.pdf',
        ruta_storage: 'propuesta_revision/x.pdf',
        bucket: 'adjuntos',
        mime: 'application/pdf',
        tamano_bytes: '2048',
        version: 2,
        vigente: true,
        reemplaza_a: PROPIO_V1,
        creado_en: '2026-10-02T15:00:00.000Z',
      },
      {
        id: PROPIO_V1,
        entidad: 'propuesta_revision',
        entidad_id: REVISION_ID,
        tema_codigo: 'general',
        nombre_original: 'cotizacion.pdf',
        nombre_erp: 'cotizacion.pdf',
        ruta_storage: 'propuesta_revision/y.pdf',
        bucket: 'adjuntos',
        mime: 'application/pdf',
        tamano_bytes: '1024',
        version: 1,
        vigente: false,
        reemplaza_a: null,
        creado_en: '2026-10-01T15:00:00.000Z',
      },
    ]);

    const archivos = await obtenerArchivosDePropuesta(cliente as never, {
      revisionIds: [REVISION_ID],
      itemIds: [ITEM_ID],
      rfqId: RFQ_ID,
      rfqItemIds: [],
    });

    expect('vigente' in consulta.eq).toBe(false);
    expect(archivos).toHaveLength(2);
    expect(archivos[0]).toMatchObject({
      id: PROPIO_V2,
      version: 2,
      vigente: true,
      nombreErp: 'cotizacion.pdf',
      reemplazaA: PROPIO_V1,
    });
    expect(archivos[1]).toMatchObject({ id: PROPIO_V1, vigente: false, reemplazaA: null });
  });
});

describe('PanelArchivosPropuesta — vigente por defecto y «Ver versiones»', () => {
  it('muestra solo la versión vigente de cada linaje', async () => {
    renderizarPanel();

    expect(screen.getByTestId(`archivo-propuesta-${PROPIO_V2}`)).toBeDefined();
    expect(screen.queryByTestId(`archivo-propuesta-${PROPIO_V1}`)).toBeNull();
    expect(screen.getByTestId(`archivo-propuesta-${HEREDADO}`)).toBeDefined();
    expect(screen.getByTestId(`archivo-propuesta-${POR_ITEM}`)).toBeDefined();
  });

  it('no mezcla archivos por ítem de otra revisión', () => {
    const heredadoDeRevision = archivo({
      id: '66666666-6666-4666-8666-666666666666',
      entidad: 'rfq_item',
      entidadId: RFQ_ITEM_ID,
      nombreOriginal: 'actual-rfq.dxf',
      nombreErp: 'actual-rfq.dxf',
    });
    const heredadoDeOtraRevision = archivo({
      id: '44444444-4444-4444-8444-444444444444',
      entidad: 'rfq_item',
      entidadId: RFQ_ITEM_OTRO_ID,
      nombreOriginal: 'otro-rfq.dxf',
      nombreErp: 'otro-rfq.dxf',
    });
    const propioDeOtraRevision = archivo({
      id: '55555555-5555-4555-8555-555555555555',
      entidad: 'propuesta_item',
      entidadId: ITEM_OTRO_ID,
      nombreOriginal: 'otro-propuesta.dwg',
      nombreErp: 'otro-propuesta.dwg',
    });
    const cabeceraFutura = archivo({
      id: '99999999-9999-4999-8999-999999999991',
      entidadId: REVISION_OTRA_ID,
      nombreOriginal: 'cabecera-futura.pdf',
      nombreErp: 'cabecera-futura.pdf',
    });
    const itemCopiadoFuturo = {
      ...ITEMS[0]!,
      id: '99999999-9999-4999-8999-999999999992',
      revisionId: REVISION_OTRA_ID,
      revisionOrigenId: REVISION_ID,
    } as PropuestaItem;
    const archivoItemFuturo = archivo({
      id: '99999999-9999-4999-8999-999999999993',
      entidad: 'propuesta_item',
      entidadId: itemCopiadoFuturo.id,
      nombreOriginal: 'it01-futuro.dwg',
      nombreErp: 'it01-futuro.dwg',
    });
    const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: clienteConsultas },
        createElement(PanelArchivosPropuesta, {
          revision: REVISION,
          revisiones: [REVISION, REVISION_OTRA],
          archivosPropios: [...PROPIOS, cabeceraFutura],
          archivosHeredados: [...HEREDADOS, heredadoDeRevision, heredadoDeOtraRevision],
          archivosPorItem: [...POR_ITEMS, propioDeOtraRevision, archivoItemFuturo],
          items: [...ITEMS, itemCopiadoFuturo],
          puedeSubir: true,
        }),
      ),
    );

    expect(screen.getByText('actual-rfq.dxf')).toBeDefined();
    expect(screen.queryByText('otro-rfq.dxf')).toBeNull();
    expect(screen.queryByText('otro-propuesta.dwg')).toBeNull();
    expect(screen.queryByText('cabecera-futura.pdf')).toBeNull();
    expect(screen.queryByText('it01-futuro.dwg')).toBeNull();
  });

  it('conserva en B los archivos de cabecera y del mismo ITxx adjuntados en A', () => {
    const itemBase = ITEMS[0]!;
    const itemCopiadoB = {
      ...itemBase,
      id: '88888888-8888-4888-8888-888888888888',
      revisionId: REVISION_OTRA_ID,
      revisionOrigenId: REVISION_ID,
    } as PropuestaItem;
    const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      createElement(
        QueryClientProvider,
        { client: clienteConsultas },
        createElement(PanelArchivosPropuesta, {
          revision: REVISION_OTRA,
          revisiones: [REVISION, REVISION_OTRA],
          archivosPropios: PROPIOS,
          archivosHeredados: HEREDADOS,
          archivosPorItem: POR_ITEMS,
          items: [itemBase, itemCopiadoB],
          puedeSubir: true,
        }),
      ),
    );

    expect(screen.getByTestId(`archivo-propuesta-${PROPIO_V2}`).textContent).toContain(
      'General · Rev A',
    );
    expect(screen.getByTestId(`archivo-propuesta-${POR_ITEM}`).textContent).toContain(
      'Ítem IT01 · Rev A',
    );
  });

  it('expande el historial del linaje de forma accesible y no ofrece borrado', async () => {
    renderizarPanel();

    const boton = screen.getByRole('button', { name: /ver versiones/i });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.getAttribute('aria-controls')).toBe(`versiones-propuesta-${PROPIO_V2}`);

    fireEvent.click(boton);

    expect(screen.getByTestId(`archivo-propuesta-${PROPIO_V1}`)).toBeDefined();
    expect(screen.queryByRole('button', { name: /eliminar|quitar|borrar/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ocultar versiones/i }));
    expect(screen.queryByTestId(`archivo-propuesta-${PROPIO_V1}`)).toBeNull();
  });

  it('abre una versión histórica autorizada', async () => {
    renderizarPanel();

    fireEvent.click(screen.getByRole('button', { name: /ver versiones/i }));
    const fila = screen.getByTestId(`archivo-propuesta-${PROPIO_V1}`);
    const ver = Array.from(fila.querySelectorAll('button')).find((elemento) =>
      /ver/i.test(elemento.textContent ?? ''),
    );
    expect(ver).toBeDefined();
    fireEvent.click(ver as HTMLButtonElement);

    await waitFor(() => {
      expect(firmarMock).toHaveBeenCalledWith({
        propuestaId: PROPUESTA_ID,
        archivoId: PROPIO_V1,
      });
      expect(abrirVentanaMock).toHaveBeenCalledWith(
        'https://firmada/propuesta',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('firma la versión vigente con el contexto de la propuesta abierta', async () => {
    renderizarPanel();

    const fila = screen.getByTestId(`archivo-propuesta-${PROPIO_V2}`);
    const ver = Array.from(fila.querySelectorAll('button')).find((elemento) =>
      /ver/i.test(elemento.textContent ?? ''),
    );
    fireEvent.click(ver as HTMLButtonElement);

    await waitFor(() => {
      expect(firmarMock).toHaveBeenCalledWith({
        propuestaId: PROPUESTA_ID,
        archivoId: PROPIO_V2,
      });
    });
  });

  it('informa el error cuando la firma se rechaza y no abre ventana', async () => {
    firmarMock.mockResolvedValue({ exito: false, error: 'El archivo no pertenece a esta propuesta' });
    renderizarPanel();

    const fila = screen.getByTestId(`archivo-propuesta-${HEREDADO}`);
    const ver = Array.from(fila.querySelectorAll('button')).find((elemento) =>
      /ver/i.test(elemento.textContent ?? ''),
    );
    fireEvent.click(ver as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText('El archivo no pertenece a esta propuesta')).toBeDefined();
    });
    expect(abrirVentanaMock).not.toHaveBeenCalled();
  });

  it('declara DXF/DWG y el límite de 20 MiB en el selector', () => {
    renderizarPanel();

    const entrada = screen.getByLabelText('Archivo de la propuesta') as HTMLInputElement;
    const accept = entrada.getAttribute('accept') ?? '';
    expect(accept).toContain('.dxf');
    expect(accept).toContain('.dwg');
    expect(screen.getByText(/DXF/)).toBeDefined();
    expect(screen.getByText(/20 MiB/)).toBeDefined();
  });
});

describe('PanelArchivosPropuesta — destino del archivo (revisión o ítem)', () => {
  it('ofrece la revisión y solo los ítems activos de la revisión activa', () => {
    renderizarPanel();

    const destino = screen.getByLabelText('Destino del archivo') as HTMLSelectElement;
    const opciones = Array.from(destino.options).map((opcion) => opcion.textContent);
    expect(destino.value).toBe('');
    expect(opciones[0]).toMatch(/revisión/i);
    expect(opciones.some((texto) => texto?.includes('IT01'))).toBe(true);
    expect(opciones.some((texto) => texto?.includes('IT02'))).toBe(false);
    expect(opciones.some((texto) => texto?.includes('IT03'))).toBe(false);
  });

  it('sube un archivo propio del ítem elegido con su contrato de metadatos', async () => {
    renderizarPanel();

    fireEvent.change(screen.getByLabelText('Destino del archivo'), {
      target: { value: ITEM_ID },
    });
    elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /subir archivo/i }));

    await waitFor(() => {
      expect(prepararSubidaMock).toHaveBeenCalledWith({
        revisionId: REVISION_ID,
        itemId: ITEM_ID,
        tema: 'general',
        nombreArchivo: 'brida.dxf',
        tamano: 2048,
        mime: 'application/octet-stream',
      });
      expect(confirmarSubidaMock).toHaveBeenCalledWith({
        revisionId: REVISION_ID,
        itemId: ITEM_ID,
        tema: 'general',
        nombreArchivo: 'brida.dxf',
        ruta: 'ruta/pendiente.dxf',
      });
      expect(screen.getByRole('status').textContent).toMatch(/subido/i);
    });
  });

  it('mantiene la cabecera de la revisión como destino por omisión', async () => {
    renderizarPanel();

    elegirArchivo('cotizacion.pdf', 1024);
    fireEvent.click(screen.getByRole('button', { name: /subir archivo/i }));

    await waitFor(() => {
      expect(prepararSubidaMock).toHaveBeenCalledWith({
        revisionId: REVISION_ID,
        tema: 'general',
        nombreArchivo: 'cotizacion.pdf',
        tamano: 1024,
        mime: 'application/octet-stream',
      });
    });
  });

  it('valida la extensión contra el perfil del ítem sin llamar al servidor', async () => {
    renderizarPanel();

    fireEvent.change(screen.getByLabelText('Destino del archivo'), {
      target: { value: ITEM_ID },
    });
    elegirArchivo('notas.txt');
    fireEvent.click(screen.getByRole('button', { name: /subir archivo/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/no permitido/i);
    });
    expect(prepararSubidaMock).not.toHaveBeenCalled();
  });

  it('anuncia el rechazo del servidor en una región de alerta', async () => {
    prepararSubidaMock.mockResolvedValue({
      exito: false,
      error: 'El ítem no pertenece a esta revisión',
    });
    renderizarPanel();

    fireEvent.change(screen.getByLabelText('Destino del archivo'), {
      target: { value: ITEM_ID },
    });
    elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /subir archivo/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('El ítem no pertenece a esta revisión');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bloquea el formulario mientras la subida está en vuelo', async () => {
    const control: { liberar: () => void } = { liberar: () => undefined };
    subirDirectoMock.mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          control.liberar = () => resolver();
        }),
    );
    renderizarPanel();

    elegirArchivo();
    const boton = screen.getByRole('button', { name: /subir archivo/i });
    fireEvent.click(boton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /subiendo/i }).hasAttribute('disabled')).toBe(true);
    });
    expect((screen.getByLabelText('Destino del archivo') as HTMLSelectElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /subiendo/i }));
    expect(subirDirectoMock).toHaveBeenCalledTimes(1);

    control.liberar();
  });
});

const PDF_V2 = 'a1111111-1111-4111-8111-111111111111';
const PDF_V1 = 'a2222222-2222-4222-8222-222222222222';

const PDFS = [
  {
    id: 'b1111111-1111-4111-8111-111111111111',
    revisionId: REVISION_ID,
    archivoId: PDF_V2,
    version: 2,
    vigente: true,
    creadoEn: '2026-10-02T15:00:00.000Z',
  },
  {
    id: 'b2222222-2222-4222-8222-222222222222',
    revisionId: REVISION_ID,
    archivoId: PDF_V1,
    version: 1,
    vigente: false,
    creadoEn: '2026-10-01T15:00:00.000Z',
  },
] as unknown as PdfRevisionPropuesta[];

describe('PanelPdfsPropuesta — contexto de propuesta y nombre accesible', () => {
  it('nombra cada botón por versión y vigencia', () => {
    render(createElement(PanelPdfsPropuesta, { revision: REVISION, pdfs: PDFS }));

    expect(
      screen.getByRole('button', { name: /PDF de la revisión A, versión 2 \(vigente\)/i }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /PDF de la revisión A, versión 1 \(reemplazado\)/i }),
    ).toBeDefined();
  });

  it('firma el PDF con la propuesta abierta y abre con noopener,noreferrer', async () => {
    render(createElement(PanelPdfsPropuesta, { revision: REVISION, pdfs: PDFS }));

    fireEvent.click(
      screen.getByRole('button', { name: /PDF de la revisión A, versión 1 \(reemplazado\)/i }),
    );

    await waitFor(() => {
      expect(firmarMock).toHaveBeenCalledWith({ propuestaId: PROPUESTA_ID, archivoId: PDF_V1 });
      expect(abrirVentanaMock).toHaveBeenCalledWith(
        'https://firmada/propuesta',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('muestra el rechazo del servidor sin abrir ventana', async () => {
    firmarMock.mockResolvedValue({ exito: false, error: 'El archivo no pertenece a esta propuesta' });
    render(createElement(PanelPdfsPropuesta, { revision: REVISION, pdfs: PDFS }));

    fireEvent.click(
      screen.getByRole('button', { name: /PDF de la revisión A, versión 2 \(vigente\)/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('no pertenece');
    });
    expect(abrirVentanaMock).not.toHaveBeenCalled();
  });
});
