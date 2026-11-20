// @vitest-environment jsdom

/**
 * El panel rápido debe aplicar exactamente la misma regla de consumo de piezas
 * que la ficha del proceso (C17) y mostrar el motivo en el mismo aviso modal,
 * para que un proceso posterior (Doblado, etc.) no cierre declarando piezas
 * sin consumir las del proceso anterior.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { empujarRutaMock } = vi.hoisted(() => ({ empujarRutaMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/modulos/produccion/acciones/registrar-consumo-piezas', () => ({
  registrarConsumoPiezasAccion: vi.fn().mockResolvedValue({ exito: true, datos: {} }),
}));

import { PanelOperadorProduccion } from '@/modulos/produccion/componentes/panel-operador-produccion';

afterEach(cleanup);

const metaDoblado = {
  id: 'meta-2',
  secuencia: 2,
  nombre: 'DOBLADO_CNC',
  metaPiezas: 250,
  hechoPiezas: 0,
  pendientePiezas: 250,
  porcentaje: 0,
  disponiblePiezas: 250,
  procesoPrevioNombre: 'Corte laser',
};

const orden = {
  id: 'orden-1',
  folio: 'O-1126_03',
  estadoKanban: 'en_proceso',
  sesiones: [],
  partidas: [{
    id: 'partida-1',
    codigoPieza: 'IT01',
    programaciones: [],
    metasProceso: [metaDoblado],
  }],
} as never;

const BASE = {
  orden,
  sesionActiva: {
    id: 'sesion-1',
    ordenId: 'orden-1',
    partidaId: 'partida-1',
    programacionId: 'programacion-1',
  },
  operadorDisponible: true,
  procesando: false,
  motivosPausa: [],
  materiales: [],
  responsables: {},
};

function capturarCierre() {
  fireEvent.change(screen.getByLabelText('Piezas dobladas ahora'), { target: { value: '250' } });
  fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '5' } });
  fireEvent.change(screen.getByTestId('motivo-consumo'), {
    target: { value: 'Consumo de piezas cortadas' },
  });
  fireEvent.submit(screen.getByTestId('cerrar-sesion-produccion').closest('form')!);
}

describe('PanelOperadorProduccion — cierre de un proceso posterior', () => {
  it('no cierra y explica el consumo de piezas con el mismo mensaje del detalle', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true });
    render(createElement(PanelOperadorProduccion, { ...BASE, onCerrar: cerrar, onIniciar: vi.fn(), onReanudar: vi.fn() }));

    capturarCierre();

    const aviso = await screen.findByTestId('error-cierre-panel');
    expect(aviso.getAttribute('role')).toBe('alertdialog');
    const mensaje = screen.getByTestId('error-cierre-mensaje').textContent ?? '';
    expect(mensaje).toContain('Declaraste 250 piezas producidas en DOBLADO_CNC');
    expect(mensaje).toContain('«Usado» de Corte laser tiene 5');
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('la acción sugerida rellena «Usado» con el consumo 1:1', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true });
    render(createElement(PanelOperadorProduccion, { ...BASE, onCerrar: cerrar, onIniciar: vi.fn(), onReanudar: vi.fn() }));

    capturarCierre();
    fireEvent.click(await screen.findByTestId('error-cierre-accion'));

    await waitFor(() => expect(screen.queryByTestId('error-cierre-panel')).toBeNull());
    expect((screen.getByLabelText('Usado') as HTMLInputElement).value).toBe('250');
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('ofrece pausar cuando el material no tiene costo confirmado, sin reintentar el cierre', async () => {
    const metaCorte = {
      ...metaDoblado,
      id: 'meta-1',
      secuencia: 1,
      nombre: 'CORTE_LASER',
      disponiblePiezas: null,
    };
    const ordenBase = orden as unknown as {
      partidas: Array<{ id: string; codigoPieza: string; programaciones: unknown[]; metasProceso: unknown[] }>;
    };
    const ordenCorte = {
      ...ordenBase,
      partidas: [{ ...ordenBase.partidas[0], metasProceso: [metaCorte] }],
    } as never;
    const cerrar = vi.fn().mockResolvedValue({
      exito: false,
      error: 'El material no tiene costo confirmado',
      codigo: 'costo_material_no_configurado',
    });

    render(createElement(PanelOperadorProduccion, {
      ...BASE,
      orden: ordenCorte,
      motivosPausa: [
        { codigo: 'MATERIAL', nombre: 'Falta de material', requiereNota: false, liberaMaquina: true },
      ],
      materiales: [
        { id: 'material-1', codigo: 'MDF-12', nombre: 'MDF 12 mm', unidadBase: 'm2' },
      ],
      onCerrar: cerrar,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
    }));

    fireEvent.change(screen.getByLabelText('Piezas cortadas ahora'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), { target: { value: 'Consumo MDF' } });
    fireEvent.submit(screen.getByTestId('cerrar-sesion-produccion').closest('form')!);

    const aviso = await screen.findByTestId('error-cierre-panel');
    expect(aviso.textContent).toContain('MDF 12 mm');
    fireEvent.click(screen.getByTestId('error-cierre-accion'));

    expect((screen.getByLabelText('Resultado') as HTMLSelectElement).value).toBe('pausada');
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('no ofrece continuar una pausa sin piezas nuevas del proceso anterior', () => {
    const sesionPausada = {
      id: 'sesion-pausada',
      ordenId: 'orden-1',
      partidaId: 'partida-1',
      programacionId: 'programacion-1',
      operadorId: 'operador-1',
      estadoSesion: 'pausada',
      fechaInicio: '2026-11-19T08:00:00.000Z',
      fechaFin: '2026-11-19T10:00:00.000Z',
      horasNetas: 2,
      piezasProducidas: 100,
      motivoPausa: null,
      motivoPausaCodigo: 'MATERIAL',
      motivoPausaNota: null,
      notas: null,
      creadoEn: '2026-11-19T08:00:00.000Z',
      actualizadoEn: '2026-11-19T10:00:00.000Z',
    };
    const metaSinPiezas = {
      ...metaDoblado,
      hechoPiezas: 100,
      pendientePiezas: 150,
      disponiblePiezas: 0,
    };
    const ordenBase = orden as unknown as Record<string, unknown>;
    const ordenPausada = {
      ...ordenBase,
      estadoKanban: 'pausada',
      sesiones: [sesionPausada],
      partidas: [{
        id: 'partida-1',
        codigoPieza: 'IT01',
        programaciones: [{
          id: 'programacion-1',
          metaProcesoId: 'meta-2',
          secuencia: 2,
          estadoPlaneacion: 'bloqueada',
          actualizadoEn: '2026-11-19T10:00:00.000Z',
        }],
        metasProceso: [metaSinPiezas],
      }],
    } as never;
    const reanudar = vi.fn();

    render(createElement(PanelOperadorProduccion, {
      ...BASE,
      orden: ordenPausada,
      sesionActiva: null,
      onCerrar: vi.fn(),
      onIniciar: vi.fn(),
      onReanudar: reanudar,
    }));

    const aviso = screen.getByTestId('aviso-sin-piezas-reanudar-panel');
    expect(aviso.textContent).toContain('Sin piezas de Corte laser');
    expect(screen.queryByText('Continuar sesión pausada')).toBeNull();
    expect(reanudar).not.toHaveBeenCalled();
  });
});
