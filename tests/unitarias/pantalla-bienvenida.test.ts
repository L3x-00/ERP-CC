// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';

import {
  CLAVE_ACTIVIDAD_BIENVENIDA,
  CLAVE_SESION_BIENVENIDA,
  EVENTO_ACCESO_PERMITIDO,
  EVENTO_FIN_VALIDACION,
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
  it('no aparece en la página de acceso antes de iniciar validación', () => {
    render(createElement(PantallaBienvenida));

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('se mantiene mientras valida, aunque supere los 2 segundos', () => {
    render(createElement(PantallaBienvenida));

    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    expect(screen.getByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => window.dispatchEvent(new Event(EVENTO_FIN_VALIDACION)));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();

    expect(window.sessionStorage.getItem(CLAVE_SESION_BIENVENIDA)).toBe('1');
  });

  it('muestra el check de acceso dentro del splash hasta que cambia la ruta', () => {
    const { rerender } = render(createElement(PantallaBienvenida));

    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    act(() => vi.advanceTimersByTime(25_000));
    expect(screen.queryByTestId('splash-acceso-permitido')).toBeNull();

    act(() => window.dispatchEvent(new Event(EVENTO_ACCESO_PERMITIDO)));
    expect(screen.getByTestId('splash-acceso-permitido')).toBeTruthy();
    expect(screen.getByText('Acceso permitido')).toBeTruthy();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    navegacion.ruta = '/dashboard';
    rerender(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('se oculta cuando la ruta ya cambió, sin mostrar el formulario validando', () => {
    const { rerender } = render(createElement(PantallaBienvenida));

    act(() => window.dispatchEvent(new Event(EVENTO_INICIO_SESION)));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    navegacion.ruta = '/dashboard';
    rerender(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
  });

  it('dura 2 segundos al recargar una sesión activa tras inactividad', () => {
    navegacion.ruta = '/dashboard';
    window.sessionStorage.setItem(CLAVE_SESION_BIENVENIDA, '1');
    window.sessionStorage.setItem(
      CLAVE_ACTIVIDAD_BIENVENIDA,
      String(Date.now() - INACTIVIDAD_BIENVENIDA_MS - 1000),
    );

    render(createElement(PantallaBienvenida));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('pantalla-bienvenida')).toBeNull();
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
