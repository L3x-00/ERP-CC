// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { archivosMock, urlMock, abrirVentanaMock } = vi.hoisted(() => ({
  archivosMock: vi.fn(),
  urlMock: vi.fn(),
  abrirVentanaMock: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/archivos-sesion', () => ({
  obtenerArchivosSesionOrdenAccion: (...argumentos: unknown[]) => archivosMock(...argumentos),
  obtenerUrlArchivoSesionAccion: (...argumentos: unknown[]) => urlMock(...argumentos),
}));
vi.mock('@/modulos/produccion/subir-archivo-sesion-cliente', () => ({
  subirArchivoSesionDesdeNavegador: vi.fn(),
}));

import { HistorialSesionesProduccion } from '@/modulos/produccion/componentes/historial-sesiones-produccion';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const SESION_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVO_ID = '33333333-3333-4333-8333-333333333333';

const ORDEN = {
  id: ORDEN_ID,
  sesiones: [{
    id: SESION_ID,
    operadorId: 'operador-1',
    estadoSesion: 'finalizada',
    fechaInicio: '2026-10-24T09:00:00.000Z',
    fechaFin: '2026-10-24T15:00:00.000Z',
    horasNetas: 6,
    piezasProducidas: 60,
    motivoPausa: null,
    notas: 'Lote terminado conforme a especificación.',
  }],
} as unknown as OrdenTableroProduccion;

function renderizar(soloLectura: boolean) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(HistorialSesionesProduccion, {
        orden: ORDEN,
        responsables: { 'operador-1': 'Jorge Ramírez Ortega' },
        soloLectura,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  archivosMock.mockResolvedValue({
    exito: true,
    datos: [{
      id: ARCHIVO_ID,
      sesionId: SESION_ID,
      clase: 'sesion',
      nombre: 'evidencia.jpg',
      mime: 'image/jpeg',
      tamano: 1024,
      creadoEn: '2026-10-24T15:00:00.000Z',
    }],
  });
  urlMock.mockResolvedValue({ exito: true, datos: { url: 'https://firmada/evidencia' } });
  vi.stubGlobal('open', abrirVentanaMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('historial de sesiones de una orden concluida', () => {
  it('en solo lectura muestra los archivos y oculta el formulario de carga', async () => {
    renderizar(true);

    await waitFor(() => expect(screen.getByText('evidencia.jpg')).toBeTruthy());
    expect(screen.getByTestId('sesion-solo-lectura')).toBeTruthy();
    expect(screen.queryByLabelText(/Archivo para sesión/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Subir archivo' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir en lectura' }));
    await waitFor(() => {
      expect(urlMock).toHaveBeenCalledWith({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });
      expect(abrirVentanaMock).toHaveBeenCalledWith(
        'https://firmada/evidencia',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('en operación conserva el formulario para adjuntar a la sesión', async () => {
    renderizar(false);

    await waitFor(() => expect(screen.getByText('evidencia.jpg')).toBeTruthy());
    expect(screen.getByLabelText(/Archivo para sesión/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeTruthy();
    expect(screen.queryByTestId('sesion-solo-lectura')).toBeNull();
  });
});
