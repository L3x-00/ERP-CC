// @vitest-environment jsdom
// Obs. cliente: la ficha de propuesta ofrece «Crear nueva versión» (en vez del
// botón «Actualizar») para copiar la versión abierta en la letra siguiente,
// exigiendo motivo y conservando el historial.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { crearNuevaRevisionMock } = vi.hoisted(() => ({
  crearNuevaRevisionMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/crear-nueva-revision', () => ({
  crearNuevaRevisionAccion: (...argumentos: unknown[]) => crearNuevaRevisionMock(...argumentos),
}));

import { BotonNuevaVersionPropuesta } from '@/modulos/propuestas/componentes/dialogo-nueva-version-propuesta';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVISION_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVISION_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function montar(parcial: {
  estado?: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'READY_TO_SEND';
  puedeCrear?: boolean;
  bloqueada?: boolean;
  onVersionCreada?: (revisionId: string, letra: string) => void;
}) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(BotonNuevaVersionPropuesta, {
        propuestaId: PROPUESTA_ID,
        revisionId: REVISION_A_ID,
        letra: 'A',
        estado: parcial.estado ?? 'SENT',
        puedeCrear: parcial.puedeCrear ?? true,
        bloqueada: parcial.bloqueada ?? false,
        onVersionCreada: parcial.onVersionCreada,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  crearNuevaRevisionMock.mockResolvedValue({
    exito: true,
    datos: {
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_B_ID,
      letra: 'B',
      folioRevision: 'CNC-0001-B',
      items: 2,
      requiereRevisionRuteo: false,
      requiereRevisionCosteo: false,
      yaExistia: false,
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('BotonNuevaVersionPropuesta (obs. cliente)', () => {
  it('sin permiso de crear versiones no se muestra', () => {
    montar({ puedeCrear: false });

    expect(screen.queryByTestId('boton-crear-nueva-version')).toBeNull();
  });

  it('en borrador no se muestra: esa versión se edita directamente', () => {
    montar({ estado: 'DRAFT' });

    expect(screen.queryByTestId('boton-crear-nueva-version')).toBeNull();
  });

  it('en «Listo para enviar» ya no se muestra: el ajuste se hace con Editar', () => {
    montar({ estado: 'READY_TO_SEND' });

    expect(screen.queryByTestId('boton-crear-nueva-version')).toBeNull();
  });

  it('en estado aceptado no se muestra', () => {
    montar({ estado: 'ACCEPTED' });

    expect(screen.queryByTestId('boton-crear-nueva-version')).toBeNull();
  });

  it('con la propuesta ya aceptada no se muestra aunque la revisión esté enviada', () => {
    montar({ estado: 'SENT', bloqueada: true });

    expect(screen.queryByTestId('boton-crear-nueva-version')).toBeNull();
  });

  it('crea la versión con motivo y avisa la nueva revisión', async () => {
    const onVersionCreada = vi.fn();
    montar({ estado: 'SENT', onVersionCreada });

    fireEvent.click(screen.getByTestId('boton-crear-nueva-version'));
    const dialogo = await screen.findByTestId('dialogo-nueva-version');
    expect(dialogo.textContent).toContain('versión B');

    const confirmar = screen.getByRole('button', { name: 'Crear versión' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Motivo de la nueva versión'), {
      target: { value: '  El cliente cambió cantidades  ' },
    });
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(crearNuevaRevisionMock).toHaveBeenCalledWith({
        revisionOrigen: REVISION_A_ID,
        motivo: 'El cliente cambió cantidades',
      }),
    );
    await waitFor(() => expect(onVersionCreada).toHaveBeenCalledWith(REVISION_B_ID, 'B'));
  });

  it('muestra el error del servidor sin cerrar el diálogo', async () => {
    crearNuevaRevisionMock.mockResolvedValue({
      exito: false,
      error: 'La propuesta ya no admite nuevas versiones',
    });
    montar({ estado: 'SENT' });

    fireEvent.click(screen.getByTestId('boton-crear-nueva-version'));
    fireEvent.change(screen.getByLabelText('Motivo de la nueva versión'), {
      target: { value: 'Cambio de material' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear versión' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('ya no admite'),
    );
    expect(screen.getByTestId('dialogo-nueva-version')).toBeDefined();
  });
});
