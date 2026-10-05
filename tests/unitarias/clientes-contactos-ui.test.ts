// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  crearClienteMock,
  marcarMock,
  desactivarMock,
  reactivarMock,
} = vi.hoisted(() => ({
  crearClienteMock: vi.fn(),
  marcarMock: vi.fn(),
  desactivarMock: vi.fn(),
  reactivarMock: vi.fn(),
}));

vi.mock('@/nucleo/supabase/cliente', () => ({
  crearClienteSupabase: () => crearClienteMock(),
}));
vi.mock('@/modulos/clientes/acciones/marcar-contacto-principal', () => ({
  marcarContactoPrincipalAccion: (...args: unknown[]) => marcarMock(...args),
}));
vi.mock('@/modulos/clientes/acciones/desactivar-contacto-cliente', () => ({
  desactivarContactoClienteAccion: (...args: unknown[]) => desactivarMock(...args),
}));
vi.mock('@/modulos/clientes/acciones/reactivar-contacto-cliente', () => ({
  reactivarContactoClienteAccion: (...args: unknown[]) => reactivarMock(...args),
}));

import { PanelContactos } from '@/modulos/clientes/componentes/contactos-cliente';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';

const CONTACTOS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    cliente_id: CLIENTE_ID,
    nombre: 'Ana Compras',
    puesto: 'Compras',
    correo: 'ana@acme.mx',
    telefono: null,
    notas: null,
    es_principal: true,
    activo: true,
    desactivado_en: null,
    desactivado_por: null,
    creado_por: null,
    creado_en: '2026-09-01T10:00:00.000Z',
    actualizado_en: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    cliente_id: CLIENTE_ID,
    nombre: 'Beto Finanzas',
    puesto: 'Finanzas',
    correo: null,
    telefono: null,
    notas: null,
    es_principal: false,
    activo: false,
    desactivado_en: '2026-10-01T10:00:00.000Z',
    desactivado_por: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    creado_por: null,
    creado_en: '2026-09-02T10:00:00.000Z',
    actualizado_en: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    cliente_id: CLIENTE_ID,
    nombre: 'Carla Centro',
    puesto: null,
    correo: null,
    telefono: null,
    notas: null,
    es_principal: false,
    activo: true,
    desactivado_en: null,
    desactivado_por: null,
    creado_por: null,
    creado_en: '2026-09-03T10:00:00.000Z',
    actualizado_en: '2026-09-03T10:00:00.000Z',
  },
];

/** Cliente Supabase falso para la consulta de contactos. */
function crearSupabaseFalso() {
  const constructor = {
    select: () => constructor,
    eq: () => constructor,
    order: () => constructor,
    then<T>(alCumplir: (valor: { data: typeof CONTACTOS; error: null }) => T) {
      return Promise.resolve({ data: CONTACTOS, error: null }).then(alCumplir);
    },
  };
  return { from: () => constructor };
}

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

beforeEach(() => {
  vi.clearAllMocks();
  crearClienteMock.mockReturnValue(crearSupabaseFalso());
  marcarMock.mockResolvedValue({ exito: true, datos: { id: 'x' } });
  desactivarMock.mockResolvedValue({ exito: true, datos: { id: 'x' } });
  reactivarMock.mockResolvedValue({ exito: true, datos: { id: 'x' } });
});

afterEach(() => cleanup());

describe('PanelContactos con baja lógica (SII-B2.3)', () => {
  it('muestra principal e inactivo sin permitir marcar como principal al inactivo', async () => {
    render(envolver(createElement(PanelContactos, { clienteId: CLIENTE_ID })));

    expect(await screen.findByText('Ana Compras')).toBeTruthy();
    expect(screen.getByText('Principal')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Marcar Carla Centro como principal' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Marcar Beto Finanzas como principal' }),
    ).toBeNull();
  });

  it('marcar principal llama a la acción del servidor', async () => {
    render(envolver(createElement(PanelContactos, { clienteId: CLIENTE_ID })));
    await screen.findByText('Carla Centro');

    fireEvent.click(screen.getByRole('button', { name: 'Marcar Carla Centro como principal' }));

    await waitFor(() =>
      expect(marcarMock).toHaveBeenCalledWith({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        clienteId: CLIENTE_ID,
      }),
    );
  });

  it('la baja exige motivo y envía la versión del contacto (CAS)', async () => {
    render(envolver(createElement(PanelContactos, { clienteId: CLIENTE_ID })));
    await screen.findByText('Ana Compras');

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar contacto Ana Compras' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar baja' });
    expect(confirmar.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Motivo de la baja'), {
      target: { value: 'cambió de proveedor' },
    });
    await waitFor(() => expect(confirmar.hasAttribute('disabled')).toBe(false));
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(desactivarMock).toHaveBeenCalledWith({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        clienteId: CLIENTE_ID,
        motivo: 'cambió de proveedor',
        actualizadoEn: '2026-09-01T10:00:00.000Z',
      }),
    );
  });

  it('reactivar llama a la acción del servidor', async () => {
    render(envolver(createElement(PanelContactos, { clienteId: CLIENTE_ID })));
    await screen.findByText('Beto Finanzas');

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar contacto Beto Finanzas' }));

    await waitFor(() =>
      expect(reactivarMock).toHaveBeenCalledWith({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        clienteId: CLIENTE_ID,
      }),
    );
  });
});
