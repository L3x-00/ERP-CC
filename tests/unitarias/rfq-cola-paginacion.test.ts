// @vitest-environment jsdom
// Convención del repo: Vitest solo incluye `tests/**/*.test.ts`, así que este
// archivo usa `createElement` en vez de JSX.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const { usarPipelineMock } = vi.hoisted(() => ({
  usarPipelineMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/validar-rfqs-listo-lote', () => ({
  validarRfqsListoLoteAccion: vi.fn().mockResolvedValue({ exito: true, datos: {} }),
}));
vi.mock('@/modulos/pipeline/hooks/usar-pipeline', () => ({
  usarPipeline: (...args: unknown[]) => usarPipelineMock(...args),
}));

import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';

function oportunidad(indice: number): Oportunidad {
  return {
    id: `op-${indice}`,
    folioOp: `OP-${String(indice).padStart(6, '0')}`,
    folioCnc: null,
    folioRfq: `RFQ-${indice}`,
    estadoRfq: 'NEW',
    nombreContacto: `Contacto ${indice}`,
    empresa: `Empresa ${indice}`,
    correo: `contacto${indice}@ejemplo.mx`,
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
}

const OPORTUNIDADES = Array.from({ length: 27 }, (_, indice) => oportunidad(indice + 1));

function renderizarCola() {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: consultas }, createElement(ColaRfq)));
}

beforeEach(() => {
  vi.clearAllMocks();
  usarPipelineMock.mockReturnValue({
    data: OPORTUNIDADES,
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('ColaRfq — cabecera, filtros desplegables y paginación', () => {
  it('coloca «Nuevo RFQ» en la misma fila que el título de la página', () => {
    renderizarCola();

    const titulo = screen.getByRole('heading', { level: 1, name: 'RFQ' });
    const cabecera = titulo.closest('header');
    expect(cabecera).not.toBeNull();
    expect(
      within(cabecera as HTMLElement).getByRole('button', { name: /Nuevo RFQ/ }),
    ).toBeDefined();
  });

  it('nace con los filtros plegados y los abre con un clic', () => {
    renderizarCola();

    const botonFiltros = screen.getByRole('button', { name: /Filtros/ });
    expect(botonFiltros.getAttribute('aria-expanded')).toBe('false');

    const idPanel = botonFiltros.getAttribute('aria-controls');
    const panel = idPanel ? document.getElementById(idPanel) : null;
    expect(panel?.hasAttribute('inert')).toBe(true);

    fireEvent.click(botonFiltros);
    expect(botonFiltros.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hasAttribute('inert')).toBe(false);
  });

  it('pagina la tabla de 15 en 15 y conserva la navegación accesible', () => {
    renderizarCola();

    // 1 fila de encabezado + 15 RFQ visibles.
    expect(screen.getAllByRole('row')).toHaveLength(16);
    const navegacion = screen.getByRole('navigation', { name: 'Paginación de RFQ' });
    expect(navegacion.textContent).toContain('1–15');
    expect(navegacion.textContent).toContain('27');

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));

    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(screen.getByText('RFQ-27')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Página 2' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('vuelve a la primera página al cambiar de filtro', () => {
    renderizarCola();

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(screen.getByText('RFQ-27')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'NEW' } });

    expect(screen.getAllByRole('row')).toHaveLength(16);
    expect(screen.getByText('RFQ-1')).toBeDefined();
  });
});
