// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KanbanProduccion } from '@/modulos/produccion/componentes/kanban-produccion';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';

afterEach(cleanup);

const LOTE: LoteTablero = {
  id: 'corrida-1',
  codigo: 'LAS02',
  estado: 'PLANIFICADA',
  ordenId: 'orden-1',
  folioOrden: 'O-1126_02',
  clienteNombre: 'Manufacturing Group',
  procesoNombre: 'CORTE LASER',
  areaCodigo: 'LASER',
  areaCodigos: ['LASER'],
  cantidadPlanificada: 180,
  items: [
    { id: null, partidaId: 'partida-1', codigoItem: 'IT01', cantidad: 60 },
    { id: null, partidaId: 'partida-2', codigoItem: 'IT02', cantidad: 120 },
  ],
  creadoEn: '2026-11-26T00:09:51.000Z',
};

describe('Kanban de Producción con lotes', () => {
  it('muestra el lote creado en la columna En proceso y abre su orden', () => {
    const onSeleccionarOrden = vi.fn();
    render(createElement(KanbanProduccion, {
      ordenes: [],
      lotes: [LOTE],
      ordenSeleccionadaId: null,
      estadosActivos: [],
      actualizando: false,
      onSeleccionarOrden,
      onAlternarEstado: vi.fn(),
    }));

    const columna = screen.getByRole('region', { name: 'En proceso' });
    const tarjeta = columna.querySelector('[data-testid="tarjeta-lote-produccion-corrida-1"]');
    expect(tarjeta).not.toBeNull();
    expect(tarjeta!.textContent).toContain('Lote LAS02');
    expect(tarjeta!.textContent).toContain('LAS02');
    expect(tarjeta!.textContent).toContain('Planificada');
    expect(tarjeta!.textContent).toContain('CORTE LASER');
    expect(tarjeta!.textContent).toContain('IT01');
    expect(tarjeta!.textContent).toContain('IT02');
    fireEvent.click(tarjeta!);
    expect(onSeleccionarOrden).toHaveBeenCalledWith('orden-1');
  });

  it('no pinta tarjetas de lote en otras columnas', () => {
    render(createElement(KanbanProduccion, {
      ordenes: [],
      lotes: [LOTE],
      ordenSeleccionadaId: null,
      estadosActivos: [],
      actualizando: false,
      onSeleccionarOrden: vi.fn(),
      onAlternarEstado: vi.fn(),
    }));

    for (const nombre of ['Bandeja', 'Pausada', 'Lista', 'Entregada']) {
      const columna = screen.getByRole('region', { name: nombre });
      expect(columna.querySelector('[data-testid^="tarjeta-lote-"]')).toBeNull();
    }
  });
});
