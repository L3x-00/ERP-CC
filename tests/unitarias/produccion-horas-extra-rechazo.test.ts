// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { resolverMock, obtenerMock } = vi.hoisted(() => ({
  resolverMock: vi.fn(),
  obtenerMock: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/indice', () => ({
  resolverSolicitudHorasExtraAccion: (...args: unknown[]) => resolverMock(...args),
}));
vi.mock('@/modulos/produccion/acciones/consultas-b6', () => ({
  obtenerAutorizacionesHoraExtraAccion: (...args: unknown[]) => obtenerMock(...args),
}));

import { esquemaResolverHorasExtra } from '@/modulos/produccion/validaciones/corridas';
import { PanelHorasExtraProduccion } from '@/modulos/produccion/componentes/panel-horas-extra-produccion';

const ID = '11111111-1111-4111-8111-111111111111';
const ORDEN = { id: 'orden-1', folio: 'O-1' } as never;

function renderPanel() {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(PanelHorasExtraProduccion, { orden: ORDEN }),
    ),
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  obtenerMock.mockResolvedValue({
    exito: true,
    datos: [{
      id: ID,
      ordenId: 'orden-1',
      ordenFolio: 'O-1',
      sesionId: null,
      horasAutorizadas: 2,
      motivo: 'Solicitud automática',
      estado: 'SOLICITADA',
      autorizadoPorNombre: null,
      creadoEn: '2026-11-17T12:00:00.000Z',
      notaRechazo: null,
    }],
  });
  resolverMock.mockResolvedValue({
    exito: true,
    datos: { id: ID, estado: 'RECHAZADA', horasAutorizadas: 2 },
  });
});

describe('esquemaResolverHorasExtra', () => {
  it('exige nota al rechazar y la rechaza si está vacía', () => {
    expect(esquemaResolverHorasExtra.safeParse({ id: ID, aprobar: true }).success).toBe(true);
    expect(esquemaResolverHorasExtra.safeParse({ id: ID, aprobar: false }).success).toBe(false);
    expect(esquemaResolverHorasExtra.safeParse({ id: ID, aprobar: false, nota: '   ' }).success).toBe(false);
    expect(esquemaResolverHorasExtra.safeParse({
      id: ID,
      aprobar: false,
      nota: 'Falta autorización del cliente',
    }).success).toBe(true);
  });
});

describe('PanelHorasExtraProduccion', () => {
  it('pide nota antes de rechazar y explica que el operador puede volver a solicitar', async () => {
    renderPanel();

    fireEvent.click(await screen.findByTestId(`rechazar-horas-extra-${ID}`));
    const nota = await screen.findByTestId(`nota-rechazo-horas-extra-${ID}`);
    fireEvent.change(nota, { target: { value: 'Falta autorización del cliente' } });
    fireEvent.click(screen.getByTestId(`confirmar-rechazo-horas-extra-${ID}`));

    await waitFor(() => expect(resolverMock).toHaveBeenCalledWith({
      id: ID,
      aprobar: false,
      nota: 'Falta autorización del cliente',
    }));
    expect((await screen.findByRole('status')).textContent).toContain('volver a solicitar');
  });
});
