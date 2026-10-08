// @vitest-environment jsdom
// Nota de convención: `vitest.config.ts` solo incluye `tests/**/*.test.ts`
// (sin `.tsx`), así que el componente se monta con `createElement` en vez de
// JSX (mismo patrón que `rfq-resumen.test.ts`).
//
// C2.3a / CLI-06 / DC-04: el historial documental del RFQ expone todas las
// versiones del linaje (`entidad + entidad_id + tema + nombre_erp`) sin borrar
// blobs, muestra la vigente por defecto y solo firma archivos del RFQ recibido.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { usuarioMock, firmarLecturaMock, registrarLogMock, abrirVentanaMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  firmarLecturaMock: vi.fn(),
  registrarLogMock: vi.fn(),
  abrirVentanaMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => clienteAdminFalso(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarLecturaMock(...argumentos),
  registrarArchivo: vi.fn(),
  construirRutaArchivo: vi.fn(),
  descartarSubidaArchivo: vi.fn(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));

import { firmarArchivoRfqAccion, listarArchivosRfqAccion } from '@/modulos/rfq/acciones/archivos-rfq';
import { PanelArchivosRfq } from '@/modulos/rfq/componentes/panel-archivos-rfq';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

const RFQ_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVO_V2 = '33333333-3333-4333-8333-333333333333';
const ARCHIVO_V1 = '44444444-4444-4444-8444-444444444444';
const ARCHIVO_ITEM = '55555555-5555-4555-8555-555555555555';
const ARCHIVO_AJENO = '66666666-6666-4666-8666-666666666666';
const ITEM_AJENO = '77777777-7777-4777-8777-777777777777';
const ARCHIVO_ITEM_AJENO = '88888888-8888-4888-8888-888888888888';

type FilaArchivo = {
  id: string;
  entidad: string;
  entidad_id: string;
  clase: string;
  nombre_original: string;
  nombre_erp: string | null;
  tema_codigo: string | null;
  version: number;
  vigente: boolean;
  reemplaza_a: string | null;
  creado_en: string;
};

/** Linaje `plano.dxf` del RFQ (v2 vigente + v1 histórica) y un archivo por ítem. */
const FILAS: FilaArchivo[] = [
  {
    id: ARCHIVO_V2,
    entidad: 'rfq',
    entidad_id: RFQ_ID,
    clase: 'CAD',
    nombre_original: 'plano.dxf',
    nombre_erp: 'plano.dxf',
    tema_codigo: null,
    version: 2,
    vigente: true,
    reemplaza_a: ARCHIVO_V1,
    creado_en: '2026-10-02T15:00:00.000Z',
  },
  {
    id: ARCHIVO_V1,
    entidad: 'rfq',
    entidad_id: RFQ_ID,
    clase: 'CAD',
    nombre_original: 'plano.dxf',
    nombre_erp: 'plano.dxf',
    tema_codigo: null,
    version: 1,
    vigente: false,
    reemplaza_a: null,
    creado_en: '2026-10-01T15:00:00.000Z',
  },
  {
    id: ARCHIVO_ITEM,
    entidad: 'rfq_item',
    entidad_id: ITEM_ID,
    clase: 'DIBUJO',
    nombre_original: 'brida.dwg',
    nombre_erp: 'brida.dwg',
    tema_codigo: null,
    version: 1,
    vigente: true,
    reemplaza_a: null,
    creado_en: '2026-10-03T15:00:00.000Z',
  },
  {
    id: ARCHIVO_ITEM_AJENO,
    entidad: 'rfq_item',
    entidad_id: ITEM_AJENO,
    clase: 'DIBUJO',
    nombre_original: 'ajeno.dwg',
    nombre_erp: 'ajeno.dwg',
    tema_codigo: null,
    version: 1,
    vigente: true,
    reemplaza_a: null,
    creado_en: '2026-10-03T15:00:00.000Z',
  },
  {
    id: ARCHIVO_AJENO,
    entidad: 'gasto',
    entidad_id: '99999999-9999-4999-8999-999999999999',
    clase: 'OTROS',
    nombre_original: 'factura.pdf',
    nombre_erp: 'factura.pdf',
    tema_codigo: null,
    version: 1,
    vigente: true,
    reemplaza_a: null,
    creado_en: '2026-10-03T15:00:00.000Z',
  },
];

type ConsultaFalsa = {
  tabla: string;
  eq: Record<string, unknown>;
  en: Record<string, readonly unknown[]>;
};
type RespuestaFalsa = { data: unknown; error: unknown };

let consultas: ConsultaFalsa[] = [];

/** Responde como PostgREST para las tablas que tocan las acciones de archivos. */
function responder(consulta: ConsultaFalsa): RespuestaFalsa {
  if (consulta.tabla === 'rfq_items') {
    const propios = consulta.eq.rfq_id === RFQ_ID ? [{ id: ITEM_ID, codigo: 'IT01' }] : [];
    return { data: propios, error: null };
  }
  if (consulta.tabla === 'archivos') {
    if (typeof consulta.eq.id === 'string') {
      return { data: FILAS.find((fila) => fila.id === consulta.eq.id) ?? null, error: null };
    }
    const idsEntidad = consulta.en.entidad_id ?? [];
    return {
      data: FILAS.filter(
        (fila) =>
          fila.entidad === consulta.eq.entidad &&
          (consulta.eq.entidad_id === undefined
            ? idsEntidad.includes(fila.entidad_id)
            : fila.entidad_id === consulta.eq.entidad_id),
      ),
      error: null,
    };
  }
  return { data: null, error: null };
}

/** Cadena encadenable mínima (`select/eq/in/order/maybeSingle` y `await`). */
function clienteAdminFalso() {
  const from = (tabla: string) => {
    const consulta: ConsultaFalsa = { tabla, eq: {}, en: {} };
    consultas.push(consulta);
    const cadena = {
      select: () => cadena,
      order: () => cadena,
      eq: (columna: string, valor: unknown) => {
        consulta.eq[columna] = valor;
        return cadena;
      },
      in: (columna: string, valores: readonly unknown[]) => {
        consulta.en[columna] = valores;
        return cadena;
      },
      maybeSingle: async () => responder(consulta),
      single: async () => responder(consulta),
      then: (
        resolver: (valor: RespuestaFalsa) => unknown,
        rechazar?: (razon: unknown) => unknown,
      ) => Promise.resolve(responder(consulta)).then(resolver, rechazar),
    };
    return cadena;
  };
  return { from };
}

const RFQ = {
  id: RFQ_ID,
  estadoRfq: 'NEW',
  items: [{ id: ITEM_ID, codigo: 'IT01', descripcion: 'Brida 4"', estado: 'activo' }],
} as unknown as Rfq;

function renderizarPanel() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(PanelArchivosRfq, { rfq: RFQ }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  consultas = [];
  usuarioMock.mockResolvedValue({ id: 'u1', rol: 'admin', activo: true, permisos: [] });
  firmarLecturaMock.mockResolvedValue('https://firmada/documento');
  registrarLogMock.mockResolvedValue(undefined);
  vi.stubGlobal('open', abrirVentanaMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('listarArchivosRfqAccion — linaje completo (CLI-06)', () => {
  it('devuelve también las versiones no vigentes, sin filtrar por vigencia', async () => {
    const resultado = await listarArchivosRfqAccion({ rfqId: RFQ_ID });

    expect(resultado.exito).toBe(true);
    const datos = resultado.exito ? (resultado.datos ?? []) : [];
    expect(datos.map((archivo) => archivo.id)).toEqual([ARCHIVO_ITEM, ARCHIVO_V2, ARCHIVO_V1]);

    const deArchivos = consultas.filter((consulta) => consulta.tabla === 'archivos');
    expect(deArchivos.length).toBeGreaterThan(0);
    expect(deArchivos.some((consulta) => 'vigente' in consulta.eq)).toBe(false);
  });

  it('expone vigencia, nombre ERP, tema y el enlace de reemplazo del linaje', async () => {
    const resultado = await listarArchivosRfqAccion({ rfqId: RFQ_ID });
    const datos = resultado.exito ? (resultado.datos ?? []) : [];

    expect(datos.find((archivo) => archivo.id === ARCHIVO_V2)).toMatchObject({
      vigente: true,
      version: 2,
      nombreErp: 'plano.dxf',
      temaCodigo: null,
      reemplazaA: ARCHIVO_V1,
      itemCodigo: null,
    });
    expect(datos.find((archivo) => archivo.id === ARCHIVO_V1)).toMatchObject({
      vigente: false,
      version: 1,
      reemplazaA: null,
    });
    expect(datos.find((archivo) => archivo.id === ARCHIVO_ITEM)).toMatchObject({
      entidad: 'rfq_item',
      itemCodigo: 'IT01',
      vigente: true,
    });
  });
});

describe('firmarArchivoRfqAccion — pertenencia al RFQ', () => {
  it('firma una versión histórica del propio RFQ', async () => {
    const resultado = await firmarArchivoRfqAccion({ rfqId: RFQ_ID, archivoId: ARCHIVO_V1 });

    expect(resultado).toMatchObject({ exito: true, datos: { url: 'https://firmada/documento' } });
    expect(firmarLecturaMock).toHaveBeenCalledOnce();
  });

  it('firma un archivo de un ítem del RFQ', async () => {
    const resultado = await firmarArchivoRfqAccion({ rfqId: RFQ_ID, archivoId: ARCHIVO_ITEM });

    expect(resultado).toMatchObject({ exito: true });
  });

  it('rechaza un archivo de otra entidad aunque el usuario tenga rfq_vista', async () => {
    const resultado = await firmarArchivoRfqAccion({ rfqId: RFQ_ID, archivoId: ARCHIVO_AJENO });

    expect(resultado.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de un ítem que no pertenece a este RFQ', async () => {
    const resultado = await firmarArchivoRfqAccion({ rfqId: RFQ_ID, archivoId: ARCHIVO_ITEM_AJENO });

    expect(resultado.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza una entrada sin RFQ de contexto', async () => {
    const resultado = await firmarArchivoRfqAccion({ archivoId: ARCHIVO_V1 });

    expect(resultado.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });
});

describe('PanelArchivosRfq — vigente por defecto y «Ver versiones»', () => {
  it('muestra solo la versión vigente de cada linaje', async () => {
    renderizarPanel();

    await waitFor(() => {
      expect(screen.getByTestId(`archivo-rfq-${ARCHIVO_V2}`)).toBeDefined();
    });
    expect(screen.getByTestId(`archivo-rfq-${ARCHIVO_ITEM}`)).toBeDefined();
    expect(screen.queryByTestId(`archivo-rfq-${ARCHIVO_V1}`)).toBeNull();
  });

  it('expande y contrae el historial del linaje de forma accesible', async () => {
    renderizarPanel();

    const boton = await waitFor(() => screen.getByRole('button', { name: /ver versiones/i }));
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.getAttribute('aria-controls')).toBe(`versiones-rfq-${ARCHIVO_V2}`);

    fireEvent.click(boton);

    expect(screen.getByTestId(`archivo-rfq-${ARCHIVO_V1}`)).toBeDefined();
    expect(screen.getByRole('button', { name: /ocultar versiones/i }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /ocultar versiones/i }));
    expect(screen.queryByTestId(`archivo-rfq-${ARCHIVO_V1}`)).toBeNull();
  });

  it('no ofrece quitar ni eliminar ninguna versión', async () => {
    renderizarPanel();

    const boton = await waitFor(() => screen.getByRole('button', { name: /ver versiones/i }));
    fireEvent.click(boton);

    expect(screen.queryByRole('button', { name: /eliminar|quitar|borrar/i })).toBeNull();
  });

  it('abre una versión histórica firmándola con el RFQ de contexto', async () => {
    renderizarPanel();

    const boton = await waitFor(() => screen.getByRole('button', { name: /ver versiones/i }));
    fireEvent.click(boton);

    const fila = screen.getByTestId(`archivo-rfq-${ARCHIVO_V1}`);
    const abrir = Array.from(fila.querySelectorAll('button')).find((elemento) =>
      /abrir/i.test(elemento.textContent ?? ''),
    );
    expect(abrir).toBeDefined();
    fireEvent.click(abrir as HTMLButtonElement);

    await waitFor(() => {
      expect(abrirVentanaMock).toHaveBeenCalledWith(
        'https://firmada/documento',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('declara DXF/DWG y el límite de 20 MiB en el selector', async () => {
    renderizarPanel();

    const entrada = await waitFor(() => screen.getByLabelText('Archivo') as HTMLInputElement);
    const accept = entrada.getAttribute('accept') ?? '';
    expect(accept).toContain('.dxf');
    expect(accept).toContain('.dwg');
    expect(screen.getByText(/DXF/)).toBeDefined();
    expect(screen.getByText(/20 MiB/)).toBeDefined();
  });
});
