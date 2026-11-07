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
  it('delega en el módulo sin operación de kardex legado', () => {
    render(createElement(PanelInventario));

    expect(screen.getByText('Contenido de costos')).toBeTruthy();
    // Aclaraciones 06/11/2026, sección 7: no se administran existencias,
    // kardex ni operaciones de almacén.
    expect(screen.queryByRole('button', { name: /kardex/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /entrada|salida|reserva|reordenar/i }),
    ).toBeNull();
  });
});
