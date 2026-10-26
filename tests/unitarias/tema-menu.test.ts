// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { setTheme, estado } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  estado: { tema: 'light' as 'light' | 'dark' | undefined },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: estado.tema, setTheme }),
}));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  CentroNotificacionesHeader: () => null,
}));
vi.mock('@/modulos/autenticacion/acciones/cerrar-sesion', () => ({
  cerrarSesionAccion: vi.fn(),
}));

import { EncabezadoApp } from '@/compartido/componentes/navegacion/encabezado-app';
import { OpcionTemaMenu } from '@/compartido/componentes/navegacion/opcion-tema-menu';

function montarEncabezado(): void {
  render(
    createElement(EncabezadoApp, {
      titulo: 'Dashboard',
      usuarioId: 'usuario-1',
      nombreUsuario: 'Ana Torres',
      rolUsuario: 'admin',
      onAbrirMenu: () => undefined,
    }),
  );
}

beforeEach(() => {
  estado.tema = 'light';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('cambio de tema global desde el menú de usuario', () => {
  it('en tema claro ofrece pasar a oscuro y aplica la elección', () => {
    const seleccionar = vi.fn();
    render(createElement(OpcionTemaMenu, { onSeleccionar: seleccionar }));

    const opcion = screen.getByTestId('menu-tema');
    expect(opcion.textContent).toContain('Cambiar a tema oscuro');

    fireEvent.click(opcion);
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(seleccionar).toHaveBeenCalledTimes(1);
  });

  it('en tema oscuro ofrece volver a claro', () => {
    estado.tema = 'dark';
    render(createElement(OpcionTemaMenu, { onSeleccionar: vi.fn() }));

    const opcion = screen.getByTestId('menu-tema');
    expect(opcion.textContent).toContain('Cambiar a tema claro');

    fireEvent.click(opcion);
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('se muestra dentro del menú desplegable junto a «Cerrar sesión»', () => {
    montarEncabezado();
    fireEvent.click(screen.getByTestId('menu-usuario'));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByTestId('menu-tema')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(within(menu).getByRole('separator')).toBeTruthy();
  });

  it('cierra el menú después de cambiar el tema', () => {
    montarEncabezado();
    fireEvent.click(screen.getByTestId('menu-usuario'));
    fireEvent.click(screen.getByTestId('menu-tema'));

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
