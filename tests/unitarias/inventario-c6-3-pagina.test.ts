// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => cleanup());

const { usuarioMock, redirectMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  redirectMock: vi.fn((ruta: string) => {
    throw new Error(`redirect:${ruta}`);
  }),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('next/navigation', () => ({ redirect: (ruta: string) => redirectMock(ruta) }));
vi.mock('@/modulos/inventario/componentes/panel-inventario', () => ({
  PanelInventario: () => createElement('div', { 'data-testid': 'panel' }),
}));

import PaginaInventario from '@/app/(panel)/inventario/page';

function usuario(permisos: string[]) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'usuario@orca.test',
    nombreCompleto: 'Usuario',
    rol: 'contador',
    permisos,
    activo: true,
  };
}

describe('página Materiales y costos — lógica ligera', () => {
  it('muestra el catálogo con permiso financiero y explica el modelo sin inventario', async () => {
    usuarioMock.mockResolvedValue(usuario(['ver_finanzas']));

    render(await PaginaInventario());

    expect(screen.getByRole('heading', { name: 'Materiales y costos' })).toBeTruthy();
    expect(screen.getByText(/sin existencias ni operación de almacén/i)).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });

  it('también entra con gestionar_inventario (legado conservado sin mostrarlo)', async () => {
    usuarioMock.mockResolvedValue(usuario(['gestionar_inventario']));

    render(await PaginaInventario());

    expect(screen.getByRole('heading', { name: 'Materiales y costos' })).toBeTruthy();
    expect(screen.queryByText(/inventario histórico/i)).toBeNull();
  });

  it('rechaza el acceso directo sin permisos del módulo', async () => {
    usuarioMock.mockResolvedValue(usuario([]));

    await expect(PaginaInventario()).rejects.toThrow('redirect:/dashboard');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });
});
