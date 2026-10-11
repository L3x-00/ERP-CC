// @vitest-environment jsdom
// Regresión del flake de CI: al guardar permisos, el refetch que dispara la
// propia invalidación reiniciaba el estado derivado y borraba «Permisos
// guardados» antes de que el usuario (o la prueba) alcanzara a verlo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { obtenerMatrizMock, actualizarMock } = vi.hoisted(() => ({
  obtenerMatrizMock: vi.fn(),
  actualizarMock: vi.fn(),
}));

vi.mock('@/modulos/permisos/acciones/indice', () => ({
  obtenerMatrizPermisosAccion: () => obtenerMatrizMock(),
  actualizarPermisosRolAccion: (...args: unknown[]) => actualizarMock(...args),
}));

import { PestanaPermisos } from '@/modulos/permisos/componentes/pestana-permisos';
import type { MatrizPermisos } from '@/modulos/permisos/tipos/indice';

function matriz(vendedorConPermiso: boolean): MatrizPermisos {
  return {
    permisos: [
      { codigo: 'ver_clientes', modulo: 'clientes', descripcion: 'Ver clientes', activo: true },
    ],
    asignaciones: {
      admin: ['ver_clientes'],
      vendedor: vendedorConPermiso ? ['ver_clientes'] : [],
      gerente: [],
      operador: [],
      contador: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  actualizarMock.mockResolvedValue({ exito: true, datos: {} });
});

afterEach(() => {
  cleanup();
});

describe('PestanaPermisos — confirmación persistente tras el refetch', () => {
  it('mantiene «Permisos guardados» cuando el refetch devuelve la matriz nueva', async () => {
    obtenerMatrizMock
      .mockResolvedValueOnce({ exito: true, datos: matriz(true) })
      .mockResolvedValue({ exito: true, datos: matriz(false) });
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: consultas },
        createElement(PestanaPermisos),
      ),
    );

    const casilla = await screen.findByTestId('check-vendedor-ver_clientes');
    fireEvent.click(casilla);
    fireEvent.click(screen.getByTestId('guardar-permisos'));

    await waitFor(() =>
      expect(actualizarMock).toHaveBeenCalledWith(
        expect.objectContaining({ rol: 'vendedor', permisos: [] }),
      ),
    );
    // Tras el refetch la confirmación sigue visible (antes desaparecía).
    await waitFor(() =>
      expect(screen.getByTestId('permisos-confirmacion').textContent).toContain(
        'Permisos guardados',
      ),
    );
  });
});
