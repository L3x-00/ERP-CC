// @vitest-environment jsdom
// Obs. cliente 2026-10-12: en «Lista para enviar» el botón «Editar» devuelve la
// versión a borrador (con motivo) para ajustarla antes de enviar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { reabrirMock } = vi.hoisted(() => ({
  reabrirMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/reabrir-revision', () => ({
  reabrirRevisionAccion: (...argumentos: unknown[]) => reabrirMock(...argumentos),
}));

import { BotonEditarRevision } from '@/modulos/propuestas/componentes/dialogo-editar-revision';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVISION_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN = '2026-10-12T00:00:00+00:00';

function montar(parcial: {
  puedeEditar?: boolean;
  bloqueada?: boolean;
  onReabierta?: () => void;
}) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(BotonEditarRevision, {
        propuestaId: PROPUESTA_ID,
        revisionId: REVISION_A_ID,
        letra: 'A',
        actualizadoEn: TOKEN,
        puedeEditar: parcial.puedeEditar ?? true,
        bloqueada: parcial.bloqueada ?? false,
        onReabierta: parcial.onReabierta,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reabrirMock.mockResolvedValue({
    exito: true,
    datos: { revisionId: REVISION_A_ID, estado: 'DRAFT' },
  });
});

afterEach(() => {
  cleanup();
});

describe('BotonEditarRevision (obs. cliente)', () => {
  it('sin permiso no se muestra', () => {
    montar({ puedeEditar: false });

    expect(screen.queryByTestId('boton-editar-revision')).toBeNull();
  });

  it('con la propuesta ya aceptada no se muestra', () => {
    montar({ bloqueada: true });

    expect(screen.queryByTestId('boton-editar-revision')).toBeNull();
  });

  it('exige motivo y reabre la revisión con el token vigente', async () => {
    const onReabierta = vi.fn();
    montar({ onReabierta });

    fireEvent.click(screen.getByTestId('boton-editar-revision'));
    const dialogo = await screen.findByTestId('dialogo-editar-revision');
    expect(dialogo.textContent).toContain('Editar versión A');

    const confirmar = screen.getByRole('button', { name: 'Editar versión' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Motivo de la edición'), {
      target: { value: '  Ajustar cantidades  ' },
    });
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(reabrirMock).toHaveBeenCalledWith({
        revisionId: REVISION_A_ID,
        actualizadoEn: TOKEN,
        motivo: 'Ajustar cantidades',
      }),
    );
    await waitFor(() => expect(onReabierta).toHaveBeenCalled());
  });

  it('muestra el error del servidor sin cerrar el diálogo', async () => {
    reabrirMock.mockResolvedValue({
      exito: false,
      error: 'La propuesta ya tiene una versión aceptada; las demás quedan solo como historial',
    });
    montar({});

    fireEvent.click(screen.getByTestId('boton-editar-revision'));
    fireEvent.change(screen.getByLabelText('Motivo de la edición'), {
      target: { value: 'Ajuste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar versión' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('versión aceptada'),
    );
    expect(screen.getByTestId('dialogo-editar-revision')).toBeDefined();
  });
});
