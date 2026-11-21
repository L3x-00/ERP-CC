// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';

import { PantallaBienvenida } from '@/compartido/componentes/retroalimentacion/pantalla-bienvenida';

const { navegacion } = vi.hoisted(() => ({ navegacion: { ruta: '/iniciar-sesion' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.ruta,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement('img', { src, alt }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  navegacion.ruta = '/iniciar-sesion';
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PantallaBienvenida', () => {
  it('permanece visible exactamente 2 segundos', () => {
    render(createElement(PantallaBienvenida));

    expect(screen.getByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('la navegación no lo oculta antes de cumplir los 2 segundos', () => {
    const { rerender } = render(createElement(PantallaBienvenida));

    act(() => vi.advanceTimersByTime(500));
    navegacion.ruta = '/dashboard';
    rerender(createElement(PantallaBienvenida));

    act(() => vi.advanceTimersByTime(1400));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('no se repite en la misma sesión del navegador', () => {
    window.sessionStorage.setItem('orca-bienvenida-visual-v1', '1');

    render(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });
});
