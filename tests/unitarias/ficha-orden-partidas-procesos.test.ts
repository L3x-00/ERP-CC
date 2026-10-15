// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';

import { PanelPartidasFicha } from '@/modulos/ordenes/componentes/panel-partidas-ficha';
import type { PartidaFicha } from '@/modulos/ordenes/tipos/ficha-orden';

function partida(codigoItem: string, procesos: string[]): PartidaFicha {
  return {
    id: `p-${codigoItem}`,
    codigoPieza: `PZA-${codigoItem}`,
    codigoItem,
    descripcion: 'Soporte',
    cantidadSolicitada: 4,
    cantidadProducida: 0,
    cantidadScrap: 0,
    unidadMedida: 'pza',
    procesos,
    tiempoEstimadoMinutos: 30,
    tiempoRealMinutos: 0,
    areaTrabajoCodigo: null,
  };
}

afterEach(() => cleanup());

describe('panel de Partidas de la ficha · procesos (R07)', () => {
  it('dos pasos del mismo proceso salen como un resumen con su conteo', () => {
    render(createElement(PanelPartidasFicha, { partidas: [partida('IT01', ['Láser CO₂', 'Láser CO₂'])] }));

    const fila = screen.getByTestId('ficha-partida-IT01');
    expect(within(fila).getByText('Láser CO₂ (2 operaciones)')).toBeTruthy();
    expect(fila.textContent).not.toContain('Láser CO₂ · Láser CO₂');
  });

  it('mezcla de procesos: agrupa los repetidos y respeta el orden', () => {
    render(createElement(PanelPartidasFicha, { partidas: [partida('IT02', ['Corte', 'Doblez', 'Corte'])] }));

    expect(within(screen.getByTestId('ficha-partida-IT02')).getByText('Corte (2 operaciones) · Doblez')).toBeTruthy();
  });

  it('sin procesos muestra un guion', () => {
    render(createElement(PanelPartidasFicha, { partidas: [partida('IT03', [])] }));

    const celdas = within(screen.getByTestId('ficha-partida-IT03')).getAllByRole('cell');
    expect(celdas[celdas.length - 1]?.textContent).toBe('—');
  });
});
