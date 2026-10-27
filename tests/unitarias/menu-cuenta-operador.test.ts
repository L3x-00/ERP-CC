
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const configurarTema = vi.hoisted(() => vi.fn());

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'dark',
    setTheme: configurarTema,
  }),
}));

import { MenuCuentaOperador } from '@/modulos/produccion/componentes/menu-cuenta-operador';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function abrirMenu(nombreOperador: string): void {
  fireEvent.click(
    screen.getByRole('button', {
      name: `Opciones de ${nombreOperador}`,
    }),
  );
}

describe('MenuCuentaOperador', () => {
  it('muestra la identidad y el estado del operador', () => {
    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Jorge Ramírez Ortega',
      operativo: true,
      onVerMiPanel: vi.fn(),
    }));

    expect(screen.getByText('Jorge Ramírez Ortega')).toBeTruthy();
    expect(screen.getByText('Sesión de piso activa')).toBeTruthy();
  });

  it('abre Mi panel al seleccionar la opción', () => {
    const onVerMiPanel = vi.fn();

    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Operador de prueba',
      operativo: true,
      onVerMiPanel,
    }));

    abrirMenu('Operador de prueba');

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Ver mi panel',
      }),
    );

    expect(onVerMiPanel).toHaveBeenCalledOnce();
  });

  it('ejecuta el cierre de acceso suministrado por el contenedor', () => {
    const onSalir = vi.fn();

    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Operador de prueba',
      operativo: true,
      onVerMiPanel: vi.fn(),
      onSalir,
    }));

    abrirMenu('Operador de prueba');

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Salir',
      }),
    );

    expect(onSalir).toHaveBeenCalledOnce();
  });

  it('permite cambiar del tema oscuro al claro', () => {
    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Operador de prueba',
      operativo: true,
      onVerMiPanel: vi.fn(),
    }));

    abrirMenu('Operador de prueba');

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Cambiar a tema claro',
      }),
    );

    expect(configurarTema).toHaveBeenCalledWith('light');
  });

  it('no ofrece salir si no existe una acción de cierre', () => {
    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Administrador',
      operativo: false,
      onVerMiPanel: vi.fn(),
    }));

    abrirMenu('Administrador');

    expect(
      screen.queryByRole('menuitem', { name: 'Salir' }),
    ).toBeNull();

    expect(screen.getByText('Solo lectura')).toBeTruthy();
  });

  it('permite cerrar el menú al pulsar nuevamente la identidad', () => {
    render(createElement(MenuCuentaOperador, {
      nombreOperador: 'Operador de prueba',
      operativo: true,
      onVerMiPanel: vi.fn(),
    }));

    abrirMenu('Operador de prueba');

    expect(
      screen.getByRole('menuitem', { name: 'Ver mi panel' }),
    ).toBeTruthy();

    abrirMenu('Operador de prueba');

    expect(
      screen.queryByRole('menuitem', { name: 'Ver mi panel' }),
    ).toBeNull();
  });
});
