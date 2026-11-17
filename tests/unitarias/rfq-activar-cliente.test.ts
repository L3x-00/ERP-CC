// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { usarClienteMock, cambiarEstadoMock, invalidarMock } = vi.hoisted(() => ({
  usarClienteMock: vi.fn(),
  cambiarEstadoMock: vi.fn(),
  invalidarMock: vi.fn(),
}));

vi.mock('@/modulos/clientes/hooks/usar-cliente', () => ({
  usarCliente: (id: string) => usarClienteMock(id),
}));
vi.mock('@/modulos/clientes/acciones/cambiar-estado-cliente', () => ({
  cambiarEstadoClienteAccion: (...args: unknown[]) => cambiarEstadoMock(...args),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useQueryClient: () => ({ invalidateQueries: invalidarMock }),
  };
});

import { ActivarClienteRfq } from '@/modulos/rfq/componentes/activar-cliente-rfq';

const ACTUALIZADO = '2026-01-05T18:30:00+00:00';

function renderComponente(puedeEditarCliente: boolean) {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(ActivarClienteRfq, { clienteId: 'cliente-1', puedeEditarCliente }),
    ),
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  usarClienteMock.mockReturnValue({
    data: { cliente: { id: 'cliente-1', estado: 'prospecto', actualizadoEn: ACTUALIZADO } },
  });
  cambiarEstadoMock.mockResolvedValue({ exito: true, datos: { estado: 'activo' } });
});

describe('ActivarClienteRfq', () => {
  it('activa al prospecto con el CAS del cliente y sin motivo, y refresca la caché', async () => {
    renderComponente(true);

    const boton = screen.getByTestId('rfq-activar-cliente');
    expect(boton.textContent).toContain('Activar cliente');
    fireEvent.click(boton);

    await waitFor(() => expect(cambiarEstadoMock).toHaveBeenCalledWith({
      clienteId: 'cliente-1',
      nuevoEstado: 'activo',
      actualizadoEn: ACTUALIZADO,
    }));
    expect(invalidarMock).toHaveBeenCalled();
  });

  it('no muestra el botón cuando el cliente ya está activo', () => {
    usarClienteMock.mockReturnValue({
      data: { cliente: { id: 'cliente-1', estado: 'activo', actualizadoEn: ACTUALIZADO } },
    });
    renderComponente(true);
    expect(screen.queryByTestId('rfq-activar-cliente')).toBeNull();
  });

  it('no muestra el botón sin permiso de edición de clientes', () => {
    renderComponente(false);
    expect(screen.queryByTestId('rfq-activar-cliente')).toBeNull();
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor sin invalidar la caché', async () => {
    cambiarEstadoMock.mockResolvedValue({ exito: false, error: 'El cliente cambió. Actualiza.' });
    renderComponente(true);
    fireEvent.click(screen.getByTestId('rfq-activar-cliente'));
    expect((await screen.findByRole('alert')).textContent).toContain('El cliente cambió');
    expect(invalidarMock).not.toHaveBeenCalled();
  });
});
