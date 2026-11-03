// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const { prepararMock, registrarMock } = vi.hoisted(() => ({
  prepararMock: vi.fn(),
  registrarMock: vi.fn(),
}));

vi.mock('@/modulos/entregas/acciones/preparar-entrega', () => ({
  prepararEntregaAccion: (...argumentos: unknown[]) => prepararMock(...argumentos),
}));
vi.mock('@/modulos/entregas/acciones/registrar-entrega', () => ({
  registrarEntregaAccion: (...argumentos: unknown[]) => registrarMock(...argumentos),
}));

import { PanelPrepararEntrega } from '@/modulos/entregas/componentes/panel-preparar-entrega';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(PanelPrepararEntrega, {
        ordenId: ORDEN_ID,
        abierto: true,
        onCerrar: vi.fn(),
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('PanelPrepararEntrega con la orden entregada por completo', () => {
  it('explica que no hay pendientes y no pide recibido ni habilita el registro', async () => {
    prepararMock.mockResolvedValue({
      exito: true,
      datos: {
        orden: {
          id: ORDEN_ID,
          folio: 'OP-001178',
          folioSii: 'OP-001178',
          estadoSii: 'ENTREGADA',
          clienteId: '22222222-2222-4222-8222-222222222222',
          clienteRazonSocial: 'Exhibidores Comerciales MX',
          condicionesPago: null,
        },
        pendientes: [],
        partidas: [{
          id: '33333333-3333-4333-8333-333333333333',
          codigoItem: 'IT01',
          codigoPieza: 'PZA-1',
          descripcion: null,
          cantidadSolicitada: 10,
          cantidadProducida: 10,
          cantidadEntregada: 10,
        }],
        entregas: [],
        contactos: [],
      },
    });

    renderizar();

    const aviso = await screen.findByTestId('entrega-completa');
    expect(aviso.textContent).toContain('No hay nada pendiente por entregar');
    expect(screen.queryByTestId('confirmar-registrar-entrega')).toBeNull();
    expect(screen.queryByLabelText('Recibido por')).toBeNull();
    expect(screen.queryByTestId('contacto-entrega')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('cerrar-panel-preparar').textContent).toBe('Cerrar'));
  });
});
