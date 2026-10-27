
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/compartido/componentes/ui/dialog', () => ({
  Dialog: ({ open, children }: {
    open: boolean;
    children: React.ReactNode;
  }) => open ? createElement('div', {}, children) : null,
  DialogContent: ({ children }: {
    children: React.ReactNode;
  }) => createElement('div', {}, children),
  DialogHeader: ({ children }: {
    children: React.ReactNode;
  }) => createElement('div', {}, children),
  DialogTitle: ({ children }: {
    children: React.ReactNode;
  }) => createElement('h2', {}, children),
  DialogDescription: ({ children }: {
    children: React.ReactNode;
  }) => createElement('p', {}, children),
}));

import { MiPanelOperador } from '@/modulos/produccion/componentes/mi-panel-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

function propiedades(procesos: ProcesoEspacioOperador[] = []) {
  return {
    abierto: true,
    onCerrar: vi.fn(),
    nombreOperador: 'Jorge Ramírez',
    operadorId: 'operador-1',
    procesos,
    hoy: '2026-10-26',
    onAbrirProceso: vi.fn(),
  };
}

describe('MiPanelOperador - interfaz', () => {
  it('muestra indicadores y mensaje cuando no hay procesos', () => {
    render(createElement(MiPanelOperador, propiedades()));

    expect(screen.getByText('Mi panel de producción')).toBeTruthy();
    expect(screen.getByText('Reclamados')).toBeTruthy();
    expect(screen.getAllByText('En proceso')).toHaveLength(2);
    expect(screen.getAllByText('Terminados')).toHaveLength(2);
    expect(screen.getByText('No hay procesos personales para mostrar.')).toBeTruthy();
  });

  it('permite cambiar entre día, semana y mes', () => {
    render(createElement(MiPanelOperador, propiedades()));

    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect(screen.getByRole('button', { name: 'Día' }).getAttribute('aria-pressed'))
      .toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByRole('button', { name: 'Mes' }).getAttribute('aria-pressed'))
      .toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('navega entre períodos sin cambiar de vista', () => {
    render(createElement(MiPanelOperador, propiedades()));

    expect(screen.getByText('2026-10-26 — 2026-11-01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(screen.getByText('2026-11-02 — 2026-11-08')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));

    expect(screen.getByText('2026-10-26 — 2026-11-01')).toBeTruthy();
  });

  it('abre el detalle de un proceso personal', () => {
    const proceso = {
      id: 'proceso-1',
      folioOrden: 'OP-001',
      codigoPieza: 'PZA-01',
      procesoNombre: 'Corte',
      areaNombre: 'Corte láser',
      columna: 'bandeja',
      porcentaje: 25,
      sesiones: [],
      reclamo: {
        id: 'reclamo-1',
        operadorId: 'operador-1',
        estado: 'activo',
        horasEstimadas: 2,
        fecha: '2026-10-26',
      },
    } as unknown as ProcesoEspacioOperador;

    const props = propiedades([proceso]);

    render(createElement(MiPanelOperador, props));

    fireEvent.click(screen.getByRole('button', {
      name: /OP-001/,
    }));

    expect(props.onCerrar).toHaveBeenCalledOnce();
    expect(props.onAbrirProceso).toHaveBeenCalledWith(proceso);
  });

  it('no renderiza el contenido cuando la ventana está cerrada', () => {
    render(createElement(MiPanelOperador, {
      ...propiedades(),
      abierto: false,
    }));

    expect(screen.queryByText('Mi panel de producción')).toBeNull();
  });
});
