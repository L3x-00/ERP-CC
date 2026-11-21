// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const setTheme = vi.fn();
const estado = { resolvedTheme: 'light' as string };

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: estado.resolvedTheme, setTheme }),
}));

import { BotonTema } from '@/compartido/componentes/navegacion/boton-tema';

beforeEach(() => {
  setTheme.mockClear();
  estado.resolvedTheme = 'light';
});

afterEach(cleanup);

describe('BotonTema de acceso', () => {
  it('cambia a tema oscuro cuando está en claro', () => {
    render(createElement(BotonTema));

    fireEvent.click(screen.getByTestId('alternar-tema-acceso'));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('cambia a tema claro cuando está en oscuro', () => {
    estado.resolvedTheme = 'dark';
    render(createElement(BotonTema));

    fireEvent.click(screen.getByTestId('alternar-tema-acceso'));

    expect(setTheme).toHaveBeenCalledWith('light');
  });
});
