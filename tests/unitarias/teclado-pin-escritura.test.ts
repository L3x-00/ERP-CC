// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/modulos/autenticacion/acciones/validar-pin', () => ({
  validarPinAccion: vi.fn().mockResolvedValue({ exito: false, error: 'PIN inválido' }),
}));

afterEach(cleanup);

describe('TecladoPin', () => {
  it('acepta dígitos escritos y descarta cualquier otro carácter', () => {
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, de 4 a 6 dígitos') as HTMLInputElement;

    fireEvent.change(campo, { target: { value: '12ab34' } });
    expect(campo.value).toBe('1234');

    fireEvent.change(campo, { target: { value: '9876543210' } });
    expect(campo.value).toBe('987654');
  });

  it('mantiene el teclado táctil y solo habilita OK con 4 a 6 dígitos', () => {
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, de 4 a 6 dígitos') as HTMLInputElement;
    const confirmar = screen.getByRole('button', { name: 'Confirmar PIN' }) as HTMLButtonElement;

    fireEvent.click(screen.getByRole('button', { name: /^5$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^6$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^7$/ }));
    expect(campo.value).toBe('567');
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^8$/ }));
    expect(campo.value).toBe('5678');
    expect(confirmar.disabled).toBe(false);
  });
});
