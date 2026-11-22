// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const obtenerDetalleMock = vi.fn();
vi.mock('@/modulos/planeacion/acciones/indice', () => ({
  obtenerDetalleProgramacionAccion: (...args: unknown[]) => obtenerDetalleMock(...args),
}));

import { ResumenOperacionEnCurso } from '@/modulos/planeacion/componentes/resumen-operacion-en-curso';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderResumen() {
  const cliente = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  render(createElement(
    QueryClientProvider,
    { client: cliente },
    createElement(ResumenOperacionEnCurso, {
      programacion: { id: 'programacion-1', actualizadoEn: '2026-11-22T10:00:00.000Z' },
    }),
  ));
}

describe('ResumenOperacionEnCurso — cierre del módulo de Planeación', () => {
  it('muestra operador, inicio, tiempo transcurrido y avance ordenados', async () => {
    obtenerDetalleMock.mockResolvedValue({
      exito: true,
      datos: {
        operacionEnCurso: {
          operadorNombre: 'Jorge Operador',
          horaInicio: '10:38',
          horasTranscurridas: 2.5,
          piezasProducidas: 8,
          metaPiezas: 10,
          porcentajeAvance: 80,
        },
      },
    });

    renderResumen();

    const resumen = await screen.findByTestId('resumen-operacion-en-curso');
    expect(screen.getByTestId('resumen-operador').textContent).toBe('Jorge Operador');
    expect(screen.getByTestId('resumen-hora-inicio').textContent).toBe('10:38');
    expect(screen.getByTestId('resumen-tiempo-transcurrido').textContent).toBe('2 h 30 min');
    expect(screen.getByTestId('resumen-avance').textContent).toBe('8/10 · 80%');
    expect(resumen.textContent).toContain('Operador');
    expect(resumen.textContent).toContain('Inicio');
    expect(resumen.textContent).toContain('Tiempo transcurrido');
    expect(resumen.textContent).toContain('Avance');
  });

  it('no pinta la tarjeta cuando no hay sesión en marcha', async () => {
    obtenerDetalleMock.mockResolvedValue({
      exito: true,
      datos: { operacionEnCurso: null },
    });

    renderResumen();
    await waitFor(() => expect(obtenerDetalleMock).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('resumen-operacion-en-curso')).toBeNull();
  });
});
