// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';

const realtime = vi.hoisted(() => {
  const manejadores: Array<() => void> = [];
  const canal = {
    on: vi.fn((_evento: string, _filtro: unknown, manejador: () => void) => {
      manejadores.push(manejador);
      return canal;
    }),
    subscribe: vi.fn(),
  };
  const removeChannel = vi.fn().mockResolvedValue('ok');
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'sesion' } } });
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));
  return {
    canal,
    getSession,
    manejadores,
    onAuthStateChange,
    removeChannel,
    unsubscribe,
  };
});

vi.mock('@/nucleo/supabase/cliente-navegador', () => ({
  obtenerClienteSupabaseNavegador: () => ({
    auth: {
      getSession: realtime.getSession,
      onAuthStateChange: realtime.onAuthStateChange,
    },
    channel: () => realtime.canal,
    removeChannel: realtime.removeChannel,
  }),
}));

import { SincronizadorPlaneacionRealtime } from '@/modulos/planeacion/componentes/sincronizador-planeacion-realtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function crearWrapper(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

describe('SincronizadorPlaneacionRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.manejadores.splice(0, realtime.manejadores.length);
    vi.stubGlobal('crypto', { randomUUID: () => 'canal-prueba' });
  });

  it('sincroniza calendario, opciones RSC e invalida por ráfaga agrupada', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidarSpy = vi.spyOn(cliente, 'invalidateQueries');
    const refrescarRsc = vi.fn();
    render(createElement(SincronizadorPlaneacionRealtime, {
      alCambiarEstructuraOperacion: refrescarRsc,
    }), { wrapper: crearWrapper(cliente) });

    await waitFor(() => expect(realtime.canal.on).toHaveBeenCalledTimes(6));
    const tablas = realtime.canal.on.mock.calls.map((llamada) => (
      (llamada[1] as { table: string }).table
    ));
    expect(tablas).toEqual([
      'recursos_planeacion',
      'capacidades_recurso_turno',
      'excepciones_capacidad_recurso',
      'programacion_areas',
      'ordenes_produccion',
      'partidas_orden_produccion',
    ]);

    vi.useFakeTimers();
    realtime.manejadores[0]?.();
    realtime.manejadores[5]?.();
    await vi.advanceTimersByTimeAsync(350);

    expect(invalidarSpy).toHaveBeenCalledTimes(1);
    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['planeacion', 'calendario'] });
    expect(refrescarRsc).toHaveBeenCalledTimes(1);
  });

  it('libera el canal y la suscripción de Auth al desmontarse', async () => {
    const cliente = new QueryClient();
    const vista = render(createElement(SincronizadorPlaneacionRealtime), {
      wrapper: crearWrapper(cliente),
    });
    await waitFor(() => expect(realtime.canal.subscribe).toHaveBeenCalledTimes(1));

    vista.unmount();

    expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.canal);
  });
});
