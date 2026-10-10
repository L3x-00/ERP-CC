// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { empujarRutaMock } = vi.hoisted(() => ({
  empujarRutaMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: vi.fn() }),
}));

import { PanelOperadorProduccion } from '@/modulos/produccion/componentes/panel-operador-produccion';

const BASE = {
  orden: null,
  sesionActiva: null,
  operadorDisponible: false,
  procesando: false,
  motivosPausa: [],
  onIniciar: vi.fn().mockResolvedValue({ exito: true }),
  onReanudar: vi.fn().mockResolvedValue({ exito: true }),
  onCerrar: vi.fn().mockResolvedValue({ exito: true }),
  responsables: {},
};

afterEach(cleanup);

describe('PanelOperadorProduccion — vista de administrador (sin PIN)', () => {
  it('ofrece el piso en solo lectura y no manda al PIN', () => {
    render(createElement(PanelOperadorProduccion, { ...BASE, esAdmin: true }));

    const boton = screen.getByRole('button', { name: 'Ver piso (solo lectura)' });
    expect(boton).toBeDefined();
    expect(screen.queryByRole('button', { name: /Abrir terminal de operador/ })).toBeNull();
    expect(screen.getByText(/sin PIN/i)).toBeDefined();

    fireEvent.click(boton);
    expect(empujarRutaMock).toHaveBeenCalledWith('/produccion-piso');
  });

  it('sin vista de administrador mantiene el acceso por terminal PIN', () => {
    render(createElement(PanelOperadorProduccion, { ...BASE, esAdmin: false }));

    const boton = screen.getByRole('button', { name: /Abrir terminal de operador/ });
    fireEvent.click(boton);
    expect(empujarRutaMock).toHaveBeenCalledWith('/operador');
    expect(screen.queryByRole('button', { name: 'Ver piso (solo lectura)' })).toBeNull();
  });
});
