// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const { accesosMock } = vi.hoisted(() => ({ accesosMock: vi.fn() }));

vi.mock('@/modulos/produccion/acciones/obtener-accesos-orden', () => ({
  obtenerAccesosOrdenAccion: (...argumentos: unknown[]) => accesosMock(...argumentos),
}));

import { AccesosRapidosOrden } from '@/modulos/produccion/componentes/accesos-rapidos-orden';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const RFQ_ID = '22222222-2222-4222-8222-222222222222';
const PROPUESTA_ID = '33333333-3333-4333-8333-333333333333';

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(AccesosRapidosOrden, { ordenId: ORDEN_ID }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accesosMock.mockResolvedValue({
    exito: true,
    datos: {
      ordenFolio: 'OP-001178',
      rfq: { id: RFQ_ID, folio: 'CNC-1026_01' },
      propuesta: { id: PROPUESTA_ID, folio: 'PRO-1026_01' },
      facturas: [],
      permisos: { rfq: true, propuesta: true, entregas: true, facturas: false, ficha: true },
    },
  });
});

afterEach(() => cleanup());

describe('accesos rápidos de la orden concluida', () => {
  it('enlaza RFQ, propuesta, entregas y ficha completa', async () => {
    renderizar();

    await waitFor(() => expect(screen.getByTestId('acceso-rapido-rfq')).toBeTruthy());
    expect(screen.getByTestId('acceso-rapido-rfq').getAttribute('href'))
      .toBe(`/rfq?rfq=${RFQ_ID}`);
    expect(screen.getByTestId('acceso-rapido-propuesta').getAttribute('href'))
      .toBe(`/propuestas?propuesta=${PROPUESTA_ID}`);
    expect(screen.getByTestId('acceso-rapido-entregas').getAttribute('href'))
      .toBe(`/entregas?orden=${ORDEN_ID}`);
    // Facturación está retirada: la empresa no emite facturas fiscales.
    expect(screen.queryByTestId('acceso-rapido-facturas')).toBeNull();
    expect(screen.getByTestId('acceso-rapido-ficha').getAttribute('href'))
      .toBe(`/ordenes/${ORDEN_ID}`);
  });

  it('oculta los accesos sin permiso', async () => {
    accesosMock.mockResolvedValue({
      exito: true,
      datos: {
        ordenFolio: 'OP-001178',
        rfq: null,
        propuesta: null,
        facturas: [],
        permisos: { rfq: false, propuesta: false, entregas: false, facturas: false, ficha: false },
      },
    });
    renderizar();

    await waitFor(() => expect(screen.getByTestId('accesos-rapidos-orden')).toBeTruthy());
    expect(screen.queryByTestId('acceso-rapido-rfq')).toBeNull();
    expect(screen.queryByTestId('acceso-rapido-propuesta')).toBeNull();
    expect(screen.queryByTestId('acceso-rapido-entregas')).toBeNull();
    expect(screen.queryByTestId('acceso-rapido-facturas')).toBeNull();
    expect(screen.queryByTestId('acceso-rapido-ficha')).toBeNull();
    expect(screen.queryByTestId('facturas-orden')).toBeNull();
  });
});
