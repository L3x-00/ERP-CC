// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Cliente } from '@/modulos/clientes/tipos/indice';

const { crearProspectoMock, crearClienteMock, refrescarRutaMock, usarClientesMock, usarClienteMock } =
  vi.hoisted(() => ({
    crearProspectoMock: vi.fn(),
    crearClienteMock: vi.fn(),
    refrescarRutaMock: vi.fn(),
    usarClientesMock: vi.fn(),
    usarClienteMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refrescarRutaMock }),
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

import { FormularioProspecto } from '@/modulos/pipeline/componentes/formulario-prospecto';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';

const CLIENTE: Cliente = {
  id: CLIENTE_ID,
  razonSocial: 'Metales del Norte SA de CV',
  nombreComercial: 'Metanor',
  rfc: 'MNO120101AB1',
  contacto: 'Ana Pérez',
  correo: 'ana@metanor.mx',
  telefono: '664 000 0000',
  condicionesPago: '30_dias',
  limiteCredito: 50_000,
  saldoAFavor: 0,
  tier: 'oro',
  tierManual: null,
  tierManualHasta: null,
  estado: 'activo',
  direccionFiscal: null,
  direccionEnvio: null,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

function renderizarFormulario() {
  return render(envolver(createElement(FormularioProspecto)));
}

/** Campo del formulario por su etiqueta visible. */
function campo(etiqueta: RegExp): HTMLInputElement {
  return screen.getByLabelText(etiqueta) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  usarClientesMock.mockReturnValue({
    data: { registros: [CLIENTE], total: 1, pagina: 1, porPagina: 25 },
    isLoading: false,
    isError: false,
  });
  usarClienteMock.mockReturnValue({
    data: { cliente: CLIENTE, documentos: [], consumoUltimos3Meses: 200_000, creditoUsado: 0 },
    isLoading: false,
    isError: false,
  });
  crearProspectoMock.mockResolvedValue({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
  crearClienteMock.mockResolvedValue({ exito: true, datos: { id: CLIENTE_ID } });
});

afterEach(() => {
  cleanup();
});

describe('FormularioProspecto con selector de cliente (RFQ-02/03)', () => {
  it('hereda condiciones de pago y rellena solo los campos vacíos', async () => {
    renderizarFormulario();

    // Borrador previo: la empresa ya se capturó a mano y no debe pisarse.
    fireEvent.change(campo(/Empresa/), { target: { value: 'Taller propio' } });
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));

    await waitFor(() => {
      expect(campo(/Condiciones de pago/)).toHaveProperty('value', '30_dias');
    });
    expect(campo(/Empresa/).value).toBe('Taller propio');
    expect(campo(/Nombre del contacto/).value).toBe('Ana Pérez');
    expect(campo(/Correo/).value).toBe('ana@metanor.mx');
    expect(screen.getByText(/Heredadas del cliente seleccionado/)).toBeDefined();
  });

  it('envía el clienteId al crear la oportunidad', async () => {
    renderizarFormulario();

    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Cambiar cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: CLIENTE_ID, condicionesPago: '30_dias' }),
      );
    });
  });

  it('quitar el cliente conserva lo capturado y no envía clienteId', async () => {
    renderizarFormulario();

    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Quitar');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(campo(/Nombre del contacto/).value).toBe('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledTimes(1);
    });
    expect(crearProspectoMock.mock.calls[0]?.[0]).not.toHaveProperty('clienteId');
  });

  it('el alta rápida crea el cliente, lo selecciona y no pierde el borrador', async () => {
    renderizarFormulario();

    fireEvent.change(campo(/Notas/), { target: { value: 'Urge cotizar' } });
    fireEvent.change(campo(/Orden de compra/), { target: { value: 'PO-99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));

    fireEvent.change(screen.getByLabelText(/Razón social/), {
      target: { value: 'Aceros Baja SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y usar en la RFQ' }));

    await waitFor(() => {
      expect(crearClienteMock).toHaveBeenCalledWith(
        expect.objectContaining({ razonSocial: 'Aceros Baja SA', estado: 'prospecto' }),
      );
    });
    // El cliente recién creado queda seleccionado en la RFQ…
    expect(await screen.findByText('Aceros Baja SA')).toBeDefined();
    // …y la captura previa de la oportunidad sigue intacta.
    expect(campo(/Notas/).value).toBe('Urge cotizar');
    expect(campo(/Orden de compra/).value).toBe('PO-99');
  });

  it('un fallo del alta rápida no cierra el formulario ni selecciona nada', async () => {
    crearClienteMock.mockResolvedValue({ exito: false, error: 'Sin permiso para crear clientes' });
    renderizarFormulario();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    fireEvent.change(screen.getByLabelText(/Razón social/), {
      target: { value: 'Aceros Baja SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y usar en la RFQ' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Sin permiso para crear clientes',
    );
    expect(screen.queryByRole('button', { name: 'Cambiar cliente' })).toBeNull();
  });
});
