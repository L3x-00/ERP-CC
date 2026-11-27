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
  it('muestra el lote recién creado en Bandeja y abre su ficha', () => {
    const onSeleccionarOrden = vi.fn();
    const onAbrirLote = vi.fn();
    render(createElement(KanbanProduccion, {
      ordenes: [],
      lotes: [LOTE],
      ordenSeleccionadaId: null,
      estadosActivos: [],
      actualizando: false,
      onSeleccionarOrden,
      onAbrirLote,
      onAlternarEstado: vi.fn(),
    }));

    const columna = screen.getByRole('region', { name: 'Bandeja' });
    const tarjeta = columna.querySelector('[data-testid="tarjeta-lote-produccion-corrida-1"]');
    expect(tarjeta).not.toBeNull();
    expect(tarjeta!.textContent).toContain('Lote LAS02');
    expect(tarjeta!.textContent).toContain('LAS02');
    expect(tarjeta!.textContent).toContain('Planificada');
    expect(tarjeta!.textContent).toContain('CORTE LASER');
    expect(tarjeta!.textContent).toContain('IT01');
    expect(tarjeta!.textContent).toContain('IT02');
    fireEvent.click(tarjeta!);
    expect(onAbrirLote).toHaveBeenCalledWith(LOTE);
    expect(onSeleccionarOrden).not.toHaveBeenCalled();
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

    for (const nombre of ['En proceso', 'Pausada', 'Lista', 'Entregada']) {
      const columna = screen.getByRole('region', { name: nombre });
      expect(columna.querySelector('[data-testid^="tarjeta-lote-"]')).toBeNull();
    }
  });

  it('muestra en En proceso el lote cuya corrida ya se inició', () => {
    render(createElement(KanbanProduccion, {
      ordenes: [],
      lotes: [{ ...LOTE, id: 'corrida-2', codigo: 'LAS03', estado: 'EN_PROCESO' }],
      ordenSeleccionadaId: null,
      estadosActivos: [],
      actualizando: false,
      onSeleccionarOrden: vi.fn(),
      onAlternarEstado: vi.fn(),
    }));

    expect(screen.getByRole('region', { name: 'En proceso' })
      .querySelector('[data-testid="tarjeta-lote-produccion-corrida-2"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Bandeja' })
      .querySelector('[data-testid="tarjeta-lote-produccion-corrida-2"]')).toBeNull();
  });
});
