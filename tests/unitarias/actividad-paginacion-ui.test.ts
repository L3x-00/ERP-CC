// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { obtenerActividadMock } = vi.hoisted(() => ({
  obtenerActividadMock: vi.fn(),
}));

vi.mock('@/modulos/auditoria/acciones/obtener-actividad', () => ({
  obtenerActividadAccion: obtenerActividadMock,
}));

import { TablaActividad } from '@/modulos/auditoria/componentes/tabla-actividad';

const REGISTRO_ID = '10000000-0000-4000-8000-000000000002';
const CREADO_EN = '2026-10-06T18:30:00.000Z';

describe('paginación de la vista Actividad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActividadMock.mockResolvedValue({
      exito: true,
      datos: {
        registros: [
          {
            id: REGISTRO_ID,
            creadoEn: CREADO_EN,
            correlationId: null,
            nombreUsuario: 'Ana Operadora',
            rol: 'admin',
            accion: 'actualizar',
            modulo: 'clientes',
            recursoId: 'CLI-0001',
            contexto: null,
            recursoEtiqueta: 'Cliente ACME',
            entidad: 'cliente',
          },
        ],
        hayMas: true,
      },
    });
  });

  afterEach(() => cleanup());

  it('envía el cursor plano que valida la Server Action al avanzar de página', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: cliente },
        createElement(TablaActividad, { esAdmin: false }),
      ),
    );

    await screen.findByText('Cliente ACME');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(obtenerActividadMock).toHaveBeenCalledTimes(2));
    expect(obtenerActividadMock.mock.calls[1]?.[0]).toMatchObject({
      limite: 30,
      cursorCreado: CREADO_EN,
      cursorId: REGISTRO_ID,
    });
    expect(obtenerActividadMock.mock.calls[1]?.[0]).not.toHaveProperty('cursor');
  });
});
