// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const {
  usarPipelineMock,
  crearProspectoMock,
  crearClienteMock,
  empujarRutaMock,
  refrescarRutaMock,
  usarClientesMock,
  usarClienteMock,
} = vi.hoisted(() => ({
  usarPipelineMock: vi.fn(),
  crearProspectoMock: vi.fn(),
  crearClienteMock: vi.fn(),
  empujarRutaMock: vi.fn(),
  refrescarRutaMock: vi.fn(),
  usarClientesMock: vi.fn(),
  usarClienteMock: vi.fn(),
}));

vi.mock('@/modulos/pipeline/hooks/usar-pipeline', () => ({
  usarPipeline: (...args: unknown[]) => usarPipelineMock(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: refrescarRutaMock }),
}));
vi.mock('@/modulos/pipeline/acciones/crear-prospecto', () => ({
  crearProspectoAccion: (...args: unknown[]) => crearProspectoMock(...args),
}));
vi.mock('@/modulos/clientes/acciones/crear-cliente', () => ({
  crearClienteAccion: (...args: unknown[]) => crearClienteMock(...args),
}));
vi.mock('@/modulos/clientes/hooks/usar-clientes', () => ({
  usarClientes: (...args: unknown[]) => usarClientesMock(...args),
}));
vi.mock('@/modulos/clientes/hooks/usar-cliente', () => ({
  usarCliente: (...args: unknown[]) => usarClienteMock(...args),
}));

import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';
import { TablaOportunidades } from '@/modulos/pipeline/componentes/tabla-oportunidades';

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

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

beforeEach(() => {
  vi.clearAllMocks();
  usarPipelineMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false });
  usarClientesMock.mockReturnValue({
    data: { registros: [], total: 0, pagina: 1, porPagina: 25 },
    isLoading: false,
    isError: false,
  });
  usarClienteMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  crearProspectoMock.mockResolvedValue({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
});

afterEach(() => {
  cleanup();
});

describe('Alta RFQ en modal guiado (C1.2a, DC-01/DC-03)', () => {
  it('“Nuevo RFQ” abre un diálogo modal con título y descripción accesibles', () => {
    render(envolver(createElement(ColaRfq)));

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialogo.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Nuevo RFQ/ })).toBeDefined();
  });

  it('el diálogo enumera las cinco etapas del flujo y aclara dónde continúan', () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));

    const etapas = screen.getByRole('list', { name: 'Etapas del alta de RFQ' });
    for (const etapa of ['Cliente', 'Solicitud', 'Ítems', 'Archivos', 'Revisar']) {
      expect(etapas.textContent).toContain(etapa);
    }
    expect(screen.getByTestId('etapas-alta-rfq').textContent).toMatch(
      /continúa en la ficha del RFQ/i,
    );
  });

  it('Escape cierra el diálogo y el botón vuelve a ofrecer el alta', () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nuevo RFQ' })).toBeDefined();
  });

  it('no permite cerrar el modal mientras el alta está en vuelo', async () => {
    let resolverAlta: ((valor: { exito: true; datos: { id: string; folioOp: string } }) => void) | undefined;
    crearProspectoMock.mockReturnValue(
      new Promise((resolver) => {
        resolverAlta = resolver;
      }),
    );
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear RFQ' }));

    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDefined();
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('dialog')).toBeDefined();

    await act(async () => {
      resolverAlta?.({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
    });
  });
});

describe('TablaOportunidades — reanudación de captura (DC-03)', () => {
  it('un RFQ INCOMPLETE ofrece “Continuar captura” sobre el mismo id', () => {
    render(
      createElement(TablaOportunidades, {
        oportunidades: [{ ...OPORTUNIDAD, estadoRfq: 'INCOMPLETE' }],
      }),
    );

    const enlace = screen.getByRole('link', { name: 'Continuar captura' });
    expect(enlace.getAttribute('href')).toBe('/rfq?rfq=op-1&continuar=1');
    expect(screen.queryByRole('link', { name: 'Abrir' })).toBeNull();
  });

  it('los demás estados conservan “Abrir”', () => {
    render(createElement(TablaOportunidades, { oportunidades: [OPORTUNIDAD] }));

    expect(screen.getByRole('link', { name: 'Abrir' }).getAttribute('href')).toBe('/rfq?rfq=op-1');
    expect(screen.queryByRole('link', { name: 'Continuar captura' })).toBeNull();
  });
});
