// @vitest-environment jsdom
import { act, createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FechaHoraDashboard } from '@/modulos/dashboard/componentes/fecha-hora-dashboard';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T17:05:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('fecha y hora del Dashboard', () => {
  it('muestra la hora de Tijuana después de montar y la actualiza cada minuto', () => {
    render(createElement(FechaHoraDashboard));

    expect(screen.getByTestId('fecha-hora-dashboard').textContent).toMatch(/25.*oct.*2026.*10:05/i);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('fecha-hora-dashboard').textContent).toMatch(/10:06/i);
  });
});
