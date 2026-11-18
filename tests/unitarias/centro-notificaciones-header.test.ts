// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const obtenerNotificacionesAccion = vi.fn();
const marcarTodasNotificacionesLeidasAccion = vi.fn();
const marcarNotificacionesLeidasAccion = vi.fn();
const push = vi.fn();

vi.mock('@/modulos/comentarios/acciones/indice', () => ({
  obtenerNotificacionesAccion: (...argumentos: unknown[]) => obtenerNotificacionesAccion(...argumentos),
  marcarTodasNotificacionesLeidasAccion: (...argumentos: unknown[]) =>
    marcarTodasNotificacionesLeidasAccion(...argumentos),
  marcarNotificacionesLeidasAccion: (...argumentos: unknown[]) =>
    marcarNotificacionesLeidasAccion(...argumentos),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/nucleo/supabase/cliente-navegador', () => ({
  obtenerClienteSupabaseNavegador: () => ({
    channel: () => ({
      on: function encadenar() { return this; },
      subscribe: () => undefined,
    }),
    removeChannel: () => Promise.resolve(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

import { CentroNotificacionesHeader } from '@/modulos/comentarios/componentes/centro-notificaciones-header';

afterEach(cleanup);

beforeEach(() => {
  push.mockReset();
  marcarTodasNotificacionesLeidasAccion.mockReset();
  marcarNotificacionesLeidasAccion.mockReset();
  marcarNotificacionesLeidasAccion.mockResolvedValue({ exito: true });
  obtenerNotificacionesAccion.mockReset();
});

const NOTIFICACIONES = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    usuarioId: '20000000-0000-4000-8000-000000000001',
    emisorId: null,
    emisorNombre: null,
    tipo: 'alerta_sistema' as const,
    titulo: 'Solicitud de programación',
    mensaje: 'Ana solicita programar',
    enlace: '/planeacion?reclamoId=30000000-0000-4000-8000-000000000001',
    leida: false,
    creadoEn: '2026-11-18T15:00:00.000Z',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    usuarioId: '20000000-0000-4000-8000-000000000001',
    emisorId: null,
    emisorNombre: null,
    tipo: 'alerta_sistema' as const,
    titulo: 'Otra alerta',
    mensaje: 'Sin leer',
    enlace: null,
    leida: false,
    creadoEn: '2026-11-18T14:00:00.000Z',
  },
];

function montar() {
  const clienteQuery = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(createElement(
    QueryClientProvider,
    { client: clienteQuery },
    createElement(CentroNotificacionesHeader, { usuarioId: '20000000-0000-4000-8000-000000000001' }),
  ));
  return clienteQuery;
}

async function abrirPanel() {
  const boton = await screen.findByRole('button', { name: /Notificaciones \(2 sin leer\)/u });
  fireEvent.click(boton);
  return boton;
}

describe('centro de notificaciones', () => {
  it('ofrece marcar todas como leídas solo cuando hay pendientes', async () => {
    obtenerNotificacionesAccion.mockResolvedValue({ exito: true, datos: NOTIFICACIONES });
    const clienteQuery = montar();
    await abrirPanel();

    const boton = await screen.findByRole('button', { name: 'Marcar todas como leídas (2)' });
    marcarTodasNotificacionesLeidasAccion.mockResolvedValue({ exito: true, datos: 2 });
    fireEvent.click(boton);

    await waitFor(() => expect(marcarTodasNotificacionesLeidasAccion).toHaveBeenCalledTimes(1));
    // El panel se refresca desde el servidor, no con un contador optimista.
    await waitFor(() => expect(clienteQuery.getQueryCache().getAll().length).toBeGreaterThan(0));
    await waitFor(() => expect(obtenerNotificacionesAccion).toHaveBeenCalledTimes(2));
  });

  it('muestra el error de la acción sin cerrar el panel', async () => {
    obtenerNotificacionesAccion.mockResolvedValue({ exito: true, datos: NOTIFICACIONES });
    montar();
    await abrirPanel();

    marcarTodasNotificacionesLeidasAccion.mockResolvedValue({
      exito: false,
      error: 'No se pudieron marcar las notificaciones',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas (2)' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Centro de notificaciones' })).toBeTruthy();
  });

  it('abre la solicitud de programación en Planeación con su reclamo', async () => {
    obtenerNotificacionesAccion.mockResolvedValue({ exito: true, datos: NOTIFICACIONES });
    montar();
    await abrirPanel();

    fireEvent.click(await screen.findByText('Solicitud de programación'));

    await waitFor(() => expect(push).toHaveBeenCalledWith(
      '/planeacion?reclamoId=30000000-0000-4000-8000-000000000001',
    ));
  });
});
