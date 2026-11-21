// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';

import {
  CLAVE_ACTIVIDAD_BIENVENIDA,
  CLAVE_SESION_BIENVENIDA,
  EVENTO_INICIO_SESION,
  INACTIVIDAD_BIENVENIDA_MS,
} from '@/compartido/constantes/bienvenida';
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
  vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
  navegacion.ruta = '/iniciar-sesion';
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PantallaBienvenida', () => {
  it('no aparece en la página de acceso antes de iniciar sesión', () => {
    render(createElement(PantallaBienvenida));

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('aparece 2 segundos al iniciar sesión', () => {
    render(createElement(PantallaBienvenida));

    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    expect(screen.getByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();

    expect(window.sessionStorage.getItem(CLAVE_SESION_BIENVENIDA)).toBe('1');
  });

  it('la navegación no lo oculta antes de cumplir los 2 segundos', () => {
    const { rerender } = render(createElement(PantallaBienvenida));

    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    act(() => vi.advanceTimersByTime(500));
    navegacion.ruta = '/dashboard';
    rerender(createElement(PantallaBienvenida));

    act(() => vi.advanceTimersByTime(1400));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('vuelve a aparecer al recargar una sesión activa tras inactividad', () => {
    navegacion.ruta = '/dashboard';
    window.sessionStorage.setItem(CLAVE_SESION_BIENVENIDA, '1');
    window.sessionStorage.setItem(
      CLAVE_ACTIVIDAD_BIENVENIDA,
      String(Date.now() - INACTIVIDAD_BIENVENIDA_MS - 1000),
    );

    render(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByTestId('pantalla-bienvenida')).toBeTruthy();
  });

  it('no aparece al recargar si la sesión está activa y hubo actividad reciente', () => {
    navegacion.ruta = '/dashboard';
    window.sessionStorage.setItem(CLAVE_SESION_BIENVENIDA, '1');
    window.sessionStorage.setItem(CLAVE_ACTIVIDAD_BIENVENIDA, String(Date.now()));

    render(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('no aparece tras inactividad en la puerta de acceso', () => {
    window.sessionStorage.setItem(CLAVE_SESION_BIENVENIDA, '1');
    window.sessionStorage.setItem(
      CLAVE_ACTIVIDAD_BIENVENIDA,
      String(Date.now() - INACTIVIDAD_BIENVENIDA_MS - 1000),
    );

    render(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('no se muestra en el manual', () => {
    navegacion.ruta = '/es/docs/page';

    render(createElement(PantallaBienvenida));
    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });
});
