// @vitest-environment jsdom
// Nota de convención: el componente usa JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const { usarPipelineMock } = vi.hoisted(() => ({
  usarPipelineMock: vi.fn(),
}));

vi.mock('@/modulos/pipeline/hooks/usar-pipeline', () => ({
  usarPipeline: (...args: unknown[]) => usarPipelineMock(...args),
}));

import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';

const OPORTUNIDAD: Oportunidad = {
  id: 'op-1',
  folioOp: 'OP-000001',
  folioCnc: null,
  folioRfq: 'RFQ-1026_01',
  estadoRfq: 'NEW',
  nombreContacto: 'Ana Pérez',
  empresa: 'Metales del Norte SA de CV',
  correo: 'ana@metanor.mx',
  telefono: '664 000 0000',
  clienteId: null,
  contactoId: null,
  vendedorId: 'vend-1',
  responsableId: null,
  canal: null,
  fechaSolicitud: '2026-10-01',
  descripcionGeneral: 'Corte de lámina',
  moneda: 'MXN',
  condicionesPago: null,
  prioridad: 'normal',
  ivaPorcentaje: 16,
  etiquetas: [],
  esOrdenInterna: false,
  poCliente: null,
  fechaRequerida: null,
  horasEstimadas: null,
  notas: null,
  proximaAccionCodigo: null,
  proximaAccionTexto: null,
  fechaProximaAccion: null,
  responsableProximaAccionId: null,
  motivoPerdida: null,
  notasPerdida: null,
  fechaUltimoContacto: null,
  fechaEnvioCotizacion: null,
  creadoEn: '2026-10-01T00:00:00Z',
  actualizadoEn: '2026-10-01T00:00:00Z',
};

function renderizarCola() {
  return render(createElement(ColaRfq));
}

afterEach(() => {
  cleanup();
});

describe('ColaRfq — solo lista (CLI-01, DC-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no ofrece alternar entre Tablero y Lista', () => {
    usarPipelineMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false });
    renderizarCola();

    expect(screen.queryByRole('button', { name: 'Tablero' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lista' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Vista de la cola RFQ' })).toBeNull();
  });

  it('con datos muestra la tabla de oportunidades, sin columnas por estado', () => {
    usarPipelineMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false });
    renderizarCola();

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByText('Folio')).toBeDefined();
    expect(screen.getByText('Metales del Norte SA de CV')).toBeDefined();
    for (const estado of ['NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL']) {
      expect(screen.queryByTestId(`columna-${estado}`)).toBeNull();
    }
  });

  it('durante la carga muestra el esqueleto de tabla, no el de tablero', () => {
    usarPipelineMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderizarCola();

    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeDefined();
    expect(screen.queryByRole('status', { name: 'Cargando RFQ' })).toBeNull();
  });

  it('conserva el estado vacío cuando no hay RFQ', () => {
    usarPipelineMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderizarCola();

    expect(screen.getByText('Sin RFQ')).toBeDefined();
  });

  it('conserva el estado de error', () => {
    usarPipelineMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderizarCola();

    expect(screen.getByRole('alert')).toBeDefined();
  });
});
