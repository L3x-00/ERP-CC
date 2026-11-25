// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';

import { SincronizadorPipelineRealtime } from '@/modulos/pipeline/componentes/sincronizador-pipeline-realtime';

const estado = vi.hoisted(() => ({
  invalidar: vi.fn(),
  reset: vi.fn(),
  manejadoresCambio: [] as Array<() => void>,
  suscripcion: null as ((estado: string) => void) | null,
  removeChannel: vi.fn(),
  consultas: null as null | {
    invalidateQueries: (...args: unknown[]) => void;
    resetQueries: (...args: unknown[]) => void;
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => estado.consultas,
}));

vi.mock('@/nucleo/supabase/cliente-navegador', () => {
  const canal = {
    on: (_evento: string, _filtro: unknown, manejador: () => void) => {
      estado.manejadoresCambio.push(manejador);
      return canal;
    },
    subscribe: (devolver: (estado: string) => void) => {
      estado.suscripcion = devolver;
      return canal;
    },
  };
  return {
    obtenerClienteSupabaseNavegador: () => ({
      channel: () => canal,
      removeChannel: estado.removeChannel,
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: () =>
          Promise.resolve({ data: { session: { user: { id: 'usuario-1' } } } }),
      },
    }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: () => 'canal-diagnostico' });
  estado.invalidar.mockClear();
  estado.reset.mockClear();
  estado.consultas = { invalidateQueries: estado.invalidar, resetQueries: estado.reset };
  estado.manejadoresCambio.length = 0;
  estado.suscripcion = null;
  estado.removeChannel.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SincronizadorPipelineRealtime', () => {
  it('no invalida al conectar, pero sí ante un cambio posterior', async () => {
    render(createElement(SincronizadorPipelineRealtime));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => estado.suscripcion?.('SUBSCRIBED'));
    act(() => vi.advanceTimersByTime(600));
    expect(estado.invalidar).not.toHaveBeenCalled();

    act(() => estado.manejadoresCambio[0]());
    act(() => vi.advanceTimersByTime(300));
    expect(estado.invalidar).toHaveBeenCalled();
  });
});
