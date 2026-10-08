// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { obtenerEntregablesMock, firmarMock, abrirVentanaMock } = vi.hoisted(() => ({
  obtenerEntregablesMock: vi.fn(),
  firmarMock: vi.fn(),
  abrirVentanaMock: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/obtener-documentos-orden', () => ({
  obtenerDocumentosOrdenAccion: (...argumentos: unknown[]) => obtenerEntregablesMock(...argumentos),
}));
vi.mock('@/modulos/produccion/acciones/obtener-url-documento-orden', () => ({
  obtenerUrlDocumentoOrdenAccion: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));
vi.mock('@/modulos/produccion/acciones/archivos-sesion', () => ({
  obtenerArchivosSesionOrdenAccion: vi.fn().mockResolvedValue({ exito: true, datos: [] }),
  obtenerUrlArchivoSesionAccion: vi.fn(),
}));
vi.mock('@/modulos/produccion/subir-archivo-sesion-cliente', () => ({
  subirArchivoSesionDesdeNavegador: vi.fn(),
}));
vi.mock('@/modulos/produccion/componentes/nota-entrega-documento-boton', () => ({
  NotaEntregaDocumentoBoton: () => null,
}));
vi.mock('@/modulos/produccion/acciones/subir-documento-orden', () => ({
  prepararDocumentoOrdenAccion: vi.fn(),
  confirmarDocumentoOrdenAccion: vi.fn(),
  descartarDocumentoOrdenAccion: vi.fn(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/subida-navegador', () => ({
  subirArchivoDirecto: vi.fn(),
}));

import { DocumentosOrdenPanel } from '@/modulos/produccion/componentes/documentos-orden-panel';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const FALTANTE = '44444444-4444-4444-8444-444444444444';
const LINAJE = `orden|${ORDEN_ID}||ajuste.dwg`;

function documento(id: string, version: number, vigente: boolean) {
  return {
    id,
    ruta: `orden/${ORDEN_ID}/ajuste-v${version}.dwg`,
    nombre: 'ajuste.dwg',
    tamano: 1024,
    tipo: 'image/vnd.dwg',
    creadoEn: `2026-10-0${version}T10:00:00.000Z`,
    version,
    vigente,
    origen: 'orden',
    itemCodigo: null,
    congelado: false,
    disponible: true,
    linaje: LINAJE,
  };
}

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(DocumentosOrdenPanel, {
        ordenId: ORDEN_ID,
        ordenFolio: 'O-1026_01',
        sesionFinalId: null,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerEntregablesMock.mockResolvedValue({
    exito: true,
    datos: {
      orden: { id: ORDEN_ID, folio: 'O-1026_01', cotizacionId: null, cotizacionFolio: null },
      documentos: [
        documento(V2, 2, true),
        documento(V1, 1, false),
        {
          ...documento(FALTANTE, 1, false),
          ruta: null,
          nombre: 'plano-no-disponible.step',
          version: null,
          vigente: null,
          origen: 'snapshot',
          congelado: true,
          disponible: false,
          linaje: `snapshot|${FALTANTE}`,
        },
      ],
      notas: [],
    },
  });
  firmarMock.mockResolvedValue({ exito: true, datos: { url: 'https://firmada/ajuste' } });
  vi.stubGlobal('open', abrirVentanaMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('historial de documentos propios de la Orden', () => {
  it('muestra la vigente, conserva la histórica y avisa si falta una referencia congelada', async () => {
    renderizar();

    await waitFor(() => expect(screen.getByTestId(`documento-orden-${V2}`)).toBeDefined());
    expect(screen.queryByTestId(`documento-orden-${V1}`)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Documento congelado no disponible');

    fireEvent.click(screen.getByRole('button', { name: 'Ver versiones (1)' }));
    const historica = screen.getByTestId(`documento-orden-${V1}`);
    expect(historica.textContent).toContain('histórica');
    const abrir = screen.getByRole('button', { name: /Abrir ajuste\.dwg, Orden, versión 1/ });
    fireEvent.click(abrir);

    await waitFor(() => {
      expect(firmarMock).toHaveBeenCalledWith({ ordenId: ORDEN_ID, archivoId: V1 });
      expect(abrirVentanaMock).toHaveBeenCalledWith(
        'https://firmada/ajuste',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });
});
