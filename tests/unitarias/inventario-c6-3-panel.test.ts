// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => cleanup());

vi.mock('@/modulos/inventario/componentes/panel-costos-materiales', () => ({
  PanelCostosMateriales: () => createElement('div', null, 'Contenido de costos'),
}));
vi.mock('@/modulos/inventario/componentes/filtros-inventario', () => ({
  FiltrosInventario: () => createElement('div', null, 'Filtros históricos'),
}));
vi.mock('@/modulos/inventario/componentes/tabla-materiales', () => ({
  TablaMateriales: () => createElement('div', null, 'Existencias conservadas'),
}));
vi.mock('@/modulos/inventario/componentes/tabla-movimientos', () => ({
  TablaMovimientos: () => createElement('div', null, 'Movimientos conservados'),
}));
vi.mock('@/modulos/inventario/componentes/sincronizador-inventario-realtime', () => ({
  SincronizadorInventarioRealtime: () => null,
}));

import { PanelInventario } from '@/modulos/inventario/componentes/panel-inventario';

describe('PanelInventario C6.3', () => {
  it('conserva costos, existencias y kardex sin ofrecer operación diaria', () => {
    render(createElement(PanelInventario, { puedeVerHistorico: true }));

    expect(screen.getByText('Contenido de costos')).toBeTruthy();
    expect(screen.getByRole('button', { name: /existencias históricas/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /kardex histórico/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /entrada|salida|reserva|ajuste/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /existencias históricas/i }));
    expect(screen.getByText('Existencias conservadas')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /kardex histórico/i }));
    expect(screen.getByText('Movimientos conservados')).toBeTruthy();
  });

  it('limita el legado a usuarios con permiso de inventario', () => {
    render(createElement(PanelInventario, { puedeVerHistorico: false }));

    expect(screen.getByText('Contenido de costos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /existencias históricas/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /kardex histórico/i })).toBeNull();
  });
});
