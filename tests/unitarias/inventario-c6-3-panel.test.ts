// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => cleanup());

vi.mock('@/modulos/inventario/componentes/panel-costos-materiales', () => ({
  PanelCostosMateriales: () => createElement('div', null, 'Contenido de costos'),
}));

import { PanelInventario } from '@/modulos/inventario/componentes/panel-inventario';

describe('PanelInventario — lógica ligera acordada con el cliente', () => {
  it('muestra solo el catálogo de costos, sin existencias ni kardex', () => {
    render(createElement(PanelInventario));

    expect(screen.getByText('Contenido de costos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /existencias/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /kardex/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /entrada|salida|reserva|ajuste|reordenar/i }),
    ).toBeNull();
  });
});
