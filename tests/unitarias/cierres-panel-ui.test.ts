// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { panelMock, detalleMock } = vi.hoisted(() => ({
  panelMock: vi.fn(),
  detalleMock: vi.fn(),
}));

vi.mock('@/modulos/cierres/acciones/obtener-cierres', () => ({
  obtenerPanelCierresAccion: (...args: unknown[]) => panelMock(...args),
  obtenerCierreOrdenAccion: (...args: unknown[]) => detalleMock(...args),
}));

import { PanelCierreAdministrativo } from '@/modulos/cierres/componentes/panel-cierre-administrativo';
import type { CierreOrdenDetalle, PanelCierreAdministrativo as DatosPanel } from '@/modulos/cierres/tipos/indice';

const comun = {
  ordenId: 'orden-1',
  folio: 'O-1',
  cliente: 'Cliente QA',
  esInterna: false,
  fechaCierre: '2026-11-17T10:00:00.000Z',
  venta: 1000,
  costoEstimado: 800,
  costoReal: 900,
  desviacionCosto: 12.5,
  horasEstimadas: 8,
  horasReales: 5,
  desviacionTiempo: -37.5,
  margen: 10,
  solicitado: 10,
  producido: 10,
  entregado: 10,
  cumplimientoEntrega: 100,
  nivel: 'sobrecosto' as const,
};

const panel: DatosPanel = {
  resumenes: [comun],
  tendencia: [{
    folio: comun.folio,
    fechaCierre: comun.fechaCierre,
    desviacionCosto: comun.desviacionCosto,
    desviacionTiempo: comun.desviacionTiempo,
    margen: comun.margen,
    costoEstimado: comun.costoEstimado,
    costoReal: comun.costoReal,
  }],
  promedios: {
    desviacionCosto: 12.5,
    desviacionTiempo: -37.5,
    margen: 10,
    ordenesConSobrecosto: 1,
    totalOrdenes: 1,
  },
};

const detalle: CierreOrdenDetalle = {
  ...comun,
  items: [{
    codigo: 'IT01',
    descripcion: 'Pieza de prueba',
    cantidad: 10,
    producida: 10,
    entregada: 10,
    precioUnitario: 100,
    venta: 1000,
    horasEstimadas: 8,
    horasReales: 5,
    costoEstimado: 800,
    costoReal: 900,
    desviacionCosto: 12.5,
  }] as CierreOrdenDetalle['items'],
  procesos: [{
    nombre: 'Corte láser',
    horasEstimadas: 8,
    horasReales: 5,
    costoEstimado: 800,
    costoReal: 900,
    desviacionTiempo: -37.5,
  }],
  materiales: [],
  horasRetrabajo: 0,
  costoRetrabajo: 0,
  costoManoObraEstimado: 500,
  costoManoObraReal: 550,
  costoMaterialEstimado: 250,
  costoMaterialReal: 300,
  costoOtros: 50,
  puntosCriticos: ['Tiempo: se usaron 5,0 h frente a 8,0 h planeadas (37,5 % menos).'],
};

function renderPanel() {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(PanelCierreAdministrativo),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  panelMock.mockResolvedValue({ exito: true, datos: panel });
  detalleMock.mockResolvedValue({ exito: true, datos: detalle });
});

afterEach(cleanup);

describe('Cierre administrativo — lenguaje claro y ayuda al pasar el puntero', () => {
  it('usa etiquetas entendibles y explica las cifras del resumen', async () => {
    renderPanel();

    expect(await screen.findByText('Costo: diferencia con lo previsto')).toBeDefined();
    expect(screen.queryByText('Δ costo')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Cambio en costo' })).toBeDefined();
    const cifra = screen.getAllByText('12,5 % más')[0]!;
    expect(cifra).toBeDefined();

    fireEvent.mouseEnter(cifra);
    expect(screen.getByTestId('ayuda-tooltip').textContent).toContain('compara lo que se gastó');
  });

  it('explica cada número del cierre de una orden', async () => {
    renderPanel();

    fireEvent.click(await screen.findByTestId('cierre-fila-O-1'));
    const dialogo = await screen.findByTestId('detalle-cierre-administrativo');
    await waitFor(() => expect(dialogo.textContent).toContain('Costo cotizado'));

    expect(dialogo.textContent).toContain('Diferencia de costo');
    expect(dialogo.textContent).toContain('Ganancia');
    expect(dialogo.textContent).not.toContain('Desviación');
    expect(dialogo.textContent).not.toContain('Δ');

    const rotulo = within(dialogo).getByText('Costo gastado');
    const valor = rotulo.parentElement!.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.mouseEnter(valor);
    expect(screen.getByTestId('ayuda-tooltip').textContent).toContain('consumos registrados');
  });
});
