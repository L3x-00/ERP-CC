// @vitest-environment jsdom
// UI-02: «Datos de empresa» vive en el menú de usuario y solo se ofrece a quien
// tiene el permiso de configuración; el modal reutiliza el formulario existente.
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  CentroNotificacionesHeader: () => null,
}));
vi.mock('@/modulos/autenticacion/acciones/cerrar-sesion', () => ({
  cerrarSesionAccion: vi.fn(),
}));
vi.mock('@/modulos/configuracion/componentes/dialogo-datos-empresa', () => ({
  DialogoDatosEmpresa: ({ abierto }: { abierto: boolean }) =>
    createElement('div', {
      'data-testid': 'dialogo-datos-empresa',
      'data-abierto': abierto ? 'true' : 'false',
    }),
}));

import { EncabezadoApp } from '@/compartido/componentes/navegacion/encabezado-app';

function montarEncabezado(puedeAdministrarEmpresa: boolean): void {
  render(
    createElement(EncabezadoApp, {
      titulo: 'Dashboard',
      usuarioId: 'usuario-1',
      nombreUsuario: 'Ana Torres',
      rolUsuario: 'admin',
      puedeAdministrarEmpresa,
      onAbrirMenu: () => undefined,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Datos de empresa en el menú de usuario (UI-02)', () => {
  it('muestra la opción cuando el usuario tiene permiso', () => {
    montarEncabezado(true);
    fireEvent.click(screen.getByTestId('menu-usuario'));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByTestId('menu-datos-empresa').textContent).toContain('Datos de empresa');
  });

  it('oculta la opción cuando el usuario no tiene permiso', () => {
    montarEncabezado(false);
    fireEvent.click(screen.getByTestId('menu-usuario'));

    expect(screen.queryByTestId('menu-datos-empresa')).toBeNull();
    expect(screen.queryByTestId('dialogo-datos-empresa')).toBeNull();
  });

  it('abre el modal y cierra el menú al seleccionar la opción', () => {
    montarEncabezado(true);
    fireEvent.click(screen.getByTestId('menu-usuario'));
    fireEvent.click(screen.getByTestId('menu-datos-empresa'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTestId('dialogo-datos-empresa').getAttribute('data-abierto')).toBe('true');
  });
});
