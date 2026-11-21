// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  EVENTO_ACCESO_PERMITIDO,
  EVENTO_INICIO_SESION,
} from '@/compartido/constantes/bienvenida';
import { iniciarSesionAccion } from '@/modulos/autenticacion/acciones/iniciar-sesion';
import { FormularioIniciarSesion } from '@/modulos/autenticacion/componentes/formulario-iniciar-sesion';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock('@/modulos/autenticacion/acciones/iniciar-sesion', () => ({
  iniciarSesionAccion: vi.fn(),
}));

const accion = vi.mocked(iniciarSesionAccion);

beforeEach(() => {
  vi.clearAllMocks();
  accion.mockResolvedValue({ exito: false, error: 'Credenciales inválidas' } as never);
});

afterEach(cleanup);

describe('FormularioIniciarSesion y el splash', () => {
  it('no muestra el splash con credenciales incorrectas', async () => {
    const alIniciar = vi.fn();
    window.addEventListener(EVENTO_INICIO_SESION, alIniciar);

    try {
      const { container } = render(createElement(FormularioIniciarSesion));
      fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
        target: { value: 'usuario@ejemplo.com' },
      });
      fireEvent.change(container.querySelector('#contrasena') as HTMLInputElement, {
        target: { value: 'incorrecta' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

      expect(await screen.findByText('Credenciales inválidas')).toBeTruthy();
      expect(alIniciar).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EVENTO_INICIO_SESION, alIniciar);
    }
  });

  it('muestra el splash y navega cuando las credenciales son correctas', async () => {
    accion.mockResolvedValue({ exito: true } as never);
    const alIniciar = vi.fn();
    const alAcceso = vi.fn();
    window.addEventListener(EVENTO_INICIO_SESION, alIniciar);
    window.addEventListener(EVENTO_ACCESO_PERMITIDO, alAcceso);

    try {
      const { container } = render(createElement(FormularioIniciarSesion));
      fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
        target: { value: 'admin@ejemplo.com' },
      });
      fireEvent.change(container.querySelector('#contrasena') as HTMLInputElement, {
        target: { value: 'correcta' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

      await waitFor(() => expect(alIniciar).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(alAcceso).toHaveBeenCalledTimes(1), { timeout: 5000 });
      await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    } finally {
      window.removeEventListener(EVENTO_INICIO_SESION, alIniciar);
      window.removeEventListener(EVENTO_ACCESO_PERMITIDO, alAcceso);
    }
  });
});
