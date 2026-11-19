// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';

import { ContadorSesionVivo } from '@/modulos/produccion/componentes/contador-sesion-vivo';
import {
  estadoContadorSesion,
  formatearTiempoTranscurrido,
} from '@/modulos/produccion/utilidades/contador-sesion';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('contador de sesión · reglas', () => {
  it('queda en verde mientras no se alcanza el estimado de la orden', () => {
    expect(estadoContadorSesion(2.5, 3)).toBe('dentro');
    expect(estadoContadorSesion(3, 3)).toBe('dentro');
  });

  it('se vuelve rojo al superar el estimado', () => {
    expect(estadoContadorSesion(3.01, 3)).toBe('excedido');
  });

  it('no inventa un límite cuando la orden no trae estimado válido', () => {
    expect(estadoContadorSesion(5, null)).toBe('sin_limite');
    expect(estadoContadorSesion(5, 0)).toBe('sin_limite');
    expect(estadoContadorSesion(5, Number.NaN)).toBe('sin_limite');
  });

  it('formatea el tiempo como cronómetro sin reiniciar a las 24 horas', () => {
    expect(formatearTiempoTranscurrido(0)).toBe('00:00:00');
    expect(formatearTiempoTranscurrido(1.5)).toBe('01:30:00');
    expect(formatearTiempoTranscurrido(31 + 40 / 60 + 8 / 3600)).toBe('31:40:08');
  });
});

describe('ContadorSesionVivo', () => {
  it('renderiza el marcador neutro en el servidor para no romper la hidratación', () => {
    const html = renderToString(createElement(ContadorSesionVivo, {
      fechaInicio: '2026-11-19T10:00:00.000Z',
      limiteHoras: 3,
    }));

    expect(html).toContain('--:--:--');
    expect(html).toContain('data-estado="sin_limite"');
  });

  it('avanza y se pinta en verde dentro del límite', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));

    render(createElement(ContadorSesionVivo, {
      fechaInicio: '2026-11-19T10:00:00.000Z',
      limiteHoras: 3,
      testId: 'contador',
    }));
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const contador = screen.getByTestId('contador');
    expect(contador.textContent).toContain('02:00:00');
    expect(contador.getAttribute('data-estado')).toBe('dentro');
  });

  it('se pinta en rojo cuando la sesión superó el estimado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T14:30:00.000Z'));

    render(createElement(ContadorSesionVivo, {
      fechaInicio: '2026-11-19T10:00:00.000Z',
      limiteHoras: 3,
      testId: 'contador',
    }));

    act(() => {
      vi.advanceTimersByTime(0);
    });

    const contador = screen.getByTestId('contador');
    expect(contador.textContent).toContain('04:30:00');
    expect(contador.getAttribute('data-estado')).toBe('excedido');
  });
});
