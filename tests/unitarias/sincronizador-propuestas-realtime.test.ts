// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';

import { SincronizadorPropuestasRealtime } from '@/modulos/propuestas/componentes/sincronizador-propuestas-realtime';

const estado = vi.hoisted(() => ({
  invalidar: vi.fn(),
  manejadores: [] as Array<() => void>,
  removeChannel: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: estado.invalidar }),
}));

vi.mock('@/nucleo/supabase/cliente-navegador', () => {
  const canal = {
    on: (_evento: string, _filtro: unknown, manejador: () => void) => {
      estado.manejadores.push(manejador);
      return canal;
    },
    subscribe: vi.fn(),
  };
  return {
    obtenerClienteSupabaseNavegador: () => ({
      channel: () => canal,
      removeChannel: estado.removeChannel,
    }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: () => 'canal-diagnostico' });
  estado.invalidar.mockClear();
  estado.manejadores.length = 0;
  estado.removeChannel.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SincronizadorPropuestasRealtime', () => {
  it('invalida detalle y listados, pero no los catálogos', () => {
    render(createElement(SincronizadorPropuestasRealtime));
    expect(estado.manejadores.length).toBe(2);

    act(() => estado.manejadores[0]());
    act(() => vi.advanceTimersByTime(300));

    expect(estado.invalidar).toHaveBeenCalledWith({ queryKey: ['propuestas', 'lista'] });
    expect(estado.invalidar).toHaveBeenCalledWith({ queryKey: ['propuesta'] });
    expect(estado.invalidar).not.toHaveBeenCalledWith({ queryKey: ['propuestas'] });
  });
});
