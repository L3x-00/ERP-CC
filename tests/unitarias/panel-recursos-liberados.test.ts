// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const obtenerRecursosLiberablesAccion = vi.fn();
const reclamarRecursoAccion = vi.fn();
const push = vi.fn();

vi.mock('@/modulos/produccion/acciones/indice', () => ({
  reclamarRecursoAccion: (...argumentos: unknown[]) => reclamarRecursoAccion(...argumentos),
}));

vi.mock('@/modulos/produccion/acciones/consultas-b6', () => ({
  obtenerRecursosLiberablesAccion: () => obtenerRecursosLiberablesAccion(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { PanelRecursosLiberados } from '@/modulos/produccion/componentes/panel-recursos-liberados';

const RECURSO = {
  sesionId: '10000000-0000-4000-8000-0000000000a1',
  ordenId: '20000000-0000-4000-8000-0000000000b1',
  ordenFolio: 'OP-1042',
  partidaId: '30000000-0000-4000-8000-0000000000c1',
  partidaCodigo: 'P-01',
  recursoId: '40000000-0000-4000-8000-0000000000d1',
  recursoCodigo: 'CNC-02',
  recursoNombre: 'Centro de maquinado 2',
  operacionNombre: 'Doblado CNC',
  operadorNombre: 'Ana Torres',
  motivoCodigo: 'DUDA',
  motivoNombre: 'Falta información',
  pausadaDesde: '2026-11-18T15:00:00.000Z',
};

afterEach(cleanup);

beforeEach(() => {
  push.mockReset();
  reclamarRecursoAccion.mockReset();
  obtenerRecursosLiberablesAccion.mockReset();
});

function montar() {
  const clienteQuery = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(createElement(
    QueryClientProvider,
    { client: clienteQuery },
    createElement(PanelRecursosLiberados),
  ));
  return clienteQuery;
}

describe('máquinas liberadas', () => {
  it('abre el detalle de la fila sin dejar al supervisor en un callejón sin salida', async () => {
    obtenerRecursosLiberablesAccion.mockResolvedValue({ exito: true, datos: [RECURSO] });
    montar();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Ver detalle de Centro de maquinado 2 para OP-1042',
    }));

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Doblado CNC')).toBeTruthy();
    expect(within(dialogo).getByText('Ana Torres')).toBeTruthy();
    expect(within(dialogo).getByText('Falta información')).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir orden en Producción' }));
    expect(push).toHaveBeenCalledWith('/produccion?ordenId=20000000-0000-4000-8000-0000000000b1');
  });

  it('reclama la sesión mostrada y confirma que la orden volvió a Planeación', async () => {
    obtenerRecursosLiberablesAccion.mockResolvedValue({ exito: true, datos: [RECURSO] });
    reclamarRecursoAccion.mockResolvedValue({
      exito: true,
      datos: {
        sesionId: RECURSO.sesionId,
        recursoId: RECURSO.recursoId,
        ordenId: RECURSO.ordenId,
        partidaId: RECURSO.partidaId,
        motivoPausaCodigo: 'DUDA',
        pausadaDesde: RECURSO.pausadaDesde,
        yaAplicado: false,
        reclamosLiberados: 1,
        liberadoPor: 'admin-1',
        liberadoPorNombre: 'Gerente A1',
        liberadoEn: '2026-11-20T12:00:00Z',
      },
    });
    montar();

    fireEvent.click(await screen.findByTestId('reclamar-recurso-CNC-02'));

    await waitFor(() => expect(reclamarRecursoAccion).toHaveBeenCalledWith({
      recursoId: RECURSO.recursoId,
      sesionId: RECURSO.sesionId,
      correlationId: expect.any(String),
    }));
    expect((await screen.findByText(/volvió a Planeación/u)).textContent)
      .toContain('OP-1042');
  });

  it('deshabilita el botón mientras la liberación está en curso', async () => {
    obtenerRecursosLiberablesAccion.mockResolvedValue({ exito: true, datos: [RECURSO] });
    reclamarRecursoAccion.mockImplementation(() => new Promise(() => {}));
    montar();

    const boton = await screen.findByTestId('reclamar-recurso-CNC-02');
    fireEvent.click(boton);

    await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(true));
    const llamada = reclamarRecursoAccion.mock.calls[0][0] as { correlationId: string };
    expect(llamada.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('muestra el mensaje específico cuando la pausa ya no es reclamable', async () => {
    obtenerRecursosLiberablesAccion.mockResolvedValue({ exito: true, datos: [RECURSO] });
    reclamarRecursoAccion.mockResolvedValue({
      exito: false,
      error: 'Otra persona ya reclamó esta máquina; actualiza el panel.',
    });
    montar();

    fireEvent.click(await screen.findByTestId('reclamar-recurso-CNC-02'));

    expect((await screen.findByText(/Otra persona ya reclamó/u)).textContent)
      .toContain('actualiza el panel');
  });
});
