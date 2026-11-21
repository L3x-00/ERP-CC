// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  EVENTO_ACCESO_PERMITIDO,
  EVENTO_INICIO_SESION,
} from '@/compartido/constantes/bienvenida';
import { validarPinAccion } from '@/modulos/autenticacion/acciones/validar-pin';
import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/modulos/autenticacion/acciones/validar-pin', () => ({
  validarPinAccion: vi.fn(),
}));

const validarPinMock = vi.mocked(validarPinAccion);

beforeEach(() => {
  vi.clearAllMocks();
  validarPinMock.mockResolvedValue({ exito: false, error: 'PIN inválido' } as never);
});

afterEach(cleanup);

describe('TecladoPin', () => {
  it('acepta solo dígitos y nunca más de seis', () => {
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, 6 dígitos') as HTMLInputElement;

    fireEvent.change(campo, { target: { value: '12ab34' } });
    expect(campo.value).toBe('1234');

    fireEvent.change(campo, { target: { value: '9876543210' } });
    expect(campo.value).toBe('987654');
  });

  it('solo habilita OK al completar exactamente seis dígitos', () => {
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, 6 dígitos') as HTMLInputElement;
    const confirmar = screen.getByRole('button', { name: 'Confirmar PIN' }) as HTMLButtonElement;

    for (const digito of ['5', '6', '7', '8', '9']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${digito}$`) }));
    }
    expect(campo.value).toBe('56789');
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^0$/ }));
    expect(campo.value).toBe('567890');
    expect(confirmar.disabled).toBe(false);
  });

  it('valida automáticamente al sexto dígito y anuncia el acceso permitido', async () => {
    validarPinMock.mockResolvedValue({ exito: true, datos: {} } as never);
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, 6 dígitos') as HTMLInputElement;

    fireEvent.change(campo, { target: { value: '123456' } });

    await waitFor(() => expect(validarPinMock).toHaveBeenCalledWith({ pin: '123456' }));
    expect(await screen.findByText('Acceso permitido', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('resultado-pin').getAttribute('data-resultado')).toBe('permitido');
    expect(screen.queryByText('Acceso denegado')).toBeNull();
  });

  it('mantiene el splash desde que empieza a validar hasta que termina', async () => {
    validarPinMock.mockResolvedValue({ exito: true, datos: {} } as never);
    const alIniciar = vi.fn();
    const alAcceso = vi.fn();
    window.addEventListener(EVENTO_INICIO_SESION, alIniciar);
    window.addEventListener(EVENTO_ACCESO_PERMITIDO, alAcceso);

    try {
      render(createElement(TecladoPin));
      const campo = screen.getByLabelText('PIN de operador, 6 dígitos') as HTMLInputElement;
      fireEvent.change(campo, { target: { value: '123456' } });

      await waitFor(() => expect(alIniciar).toHaveBeenCalledTimes(1), { timeout: 3000 });
      expect(alAcceso).not.toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();

      await waitFor(() => expect(alAcceso).toHaveBeenCalledTimes(1), { timeout: 5000 });
      await waitFor(
        () => expect(pushMock).toHaveBeenCalledWith('/produccion-piso'),
        { timeout: 5000 },
      );
    } finally {
      window.removeEventListener(EVENTO_INICIO_SESION, alIniciar);
      window.removeEventListener(EVENTO_ACCESO_PERMITIDO, alAcceso);
    }
  });

  it('muestra acceso denegado con animación y limpia el PIN', async () => {
    render(createElement(TecladoPin));
    const campo = screen.getByLabelText('PIN de operador, 6 dígitos') as HTMLInputElement;

    fireEvent.change(campo, { target: { value: '654321' } });

    await waitFor(() => expect(validarPinMock).toHaveBeenCalledWith({ pin: '654321' }));
    expect(await screen.findByText('Acceso denegado', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('resultado-pin').getAttribute('data-resultado')).toBe('denegado');

    await waitFor(
      () => {
        expect(screen.queryByText('Acceso denegado')).toBeNull();
        expect(campo.value).toBe('');
      },
      { timeout: 5000 },
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
