// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/compartido/componentes/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  DialogContent: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    createElement('div', props, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => createElement('h2', {}, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) => createElement('p', {}, children),
}));

import { DialogoChecklistInicio } from '@/modulos/produccion/componentes/dialogo-checklist-inicio';

afterEach(cleanup);

function casillas(): HTMLInputElement[] {
  const checklist = screen.getByTestId('checklist-inicio');
  return Array.from(checklist.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .filter((input) => input.dataset.testid !== 'marcar-todos-checklist');
}

const propsBase = {
  abierto: true,
  procesando: false,
  titulo: 'OP-001 · IT01 · Corte',
  procesoNombre: 'Corte láser',
  areaMacro: 'CORTE',
  onAbiertoCambiar: vi.fn(),
};

describe('Checklist de inicio (punto 11)', () => {
  it('«Marcar todos» marca y desmarca todos los eventos críticos', () => {
    render(createElement(DialogoChecklistInicio, { ...propsBase, onConfirmar: vi.fn() }));

    const todos = screen.getByTestId('marcar-todos-checklist') as HTMLInputElement;
    fireEvent.click(todos);
    expect(casillas().length).toBeGreaterThan(0);
    expect(casillas().every((casilla) => casilla.checked)).toBe(true);
    expect((screen.getByTestId('confirmar-checklist-inicio') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(todos);
    expect(casillas().every((casilla) => !casilla.checked)).toBe(true);
    expect((screen.getByTestId('confirmar-checklist-inicio') as HTMLButtonElement).disabled).toBe(true);
  });

  it('se cierra solo cuando el inicio se registra aunque el padre siga procesando', async () => {
    let resolver: (resultado: { exito: true }) => void = () => undefined;
    const onConfirmar = vi.fn(() => new Promise<{ exito: true }>((resolverPromesa) => {
      resolver = resolverPromesa;
    }));
    const onAbiertoCambiar = vi.fn();

    const elemento = (procesando: boolean) => createElement(DialogoChecklistInicio, {
      ...propsBase,
      procesando,
      onAbiertoCambiar,
      onConfirmar,
    });

    const { rerender } = render(elemento(false));
    fireEvent.click(screen.getByTestId('marcar-todos-checklist'));
    fireEvent.click(screen.getByTestId('confirmar-checklist-inicio'));

    // El padre marca `procesando` mientras espera la respuesta del servidor.
    rerender(elemento(true));
    await act(async () => {
      resolver({ exito: true });
      await Promise.resolve();
    });

    expect(onConfirmar).toHaveBeenCalledOnce();
    expect(onAbiertoCambiar).toHaveBeenCalledWith(false);
  });

  it('conserva el modal abierto si el servidor rechaza el inicio', async () => {
    const onAbiertoCambiar = vi.fn();
    render(createElement(DialogoChecklistInicio, {
      ...propsBase,
      onAbiertoCambiar,
      onConfirmar: vi.fn().mockResolvedValue({ exito: false, error: 'Falta el archivo técnico' }),
    }));

    fireEvent.click(screen.getByTestId('marcar-todos-checklist'));
    fireEvent.click(screen.getByTestId('confirmar-checklist-inicio'));

    expect((await screen.findByRole('alert')).textContent).toContain('Falta el archivo técnico');
    expect(onAbiertoCambiar).not.toHaveBeenCalledWith(false);
  });
});
