// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/estado/tienda-ui', () => ({
  usarTiendaUI: <T,>(selector: (estado: {
    barraLateralContraida: boolean;
    contraerBarra: () => void;
    expandirBarra: () => void;
  }) => T): T => selector({
    barraLateralContraida: false,
    contraerBarra: () => undefined,
    expandirBarra: () => undefined,
  }),
}));

import { BarraLateral } from '@/compartido/componentes/navegacion/barra-lateral';

afterEach(cleanup);

describe('identidad de la navegación', () => {
  it('muestra CC Manufacturing Group en escritorio y en el menú móvil', () => {
    render(createElement(BarraLateral, {
      modulos: [],
      abiertoMovil: true,
      onCerrarMovil: () => undefined,
    }));

    expect(screen.getAllByText('CC Manufacturing Group')).toHaveLength(2);
    expect(screen.queryByText('ORCA MFG ERP')).toBeNull();
  });
});
