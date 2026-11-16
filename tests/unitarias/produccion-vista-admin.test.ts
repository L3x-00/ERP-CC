// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
  materiales: [],
  onIniciar: vi.fn().mockResolvedValue({ exito: true }),
  onReanudar: vi.fn().mockResolvedValue({ exito: true }),
  onCerrar: vi.fn().mockResolvedValue({ exito: true }),
  responsables: {},
};

afterEach(cleanup);

describe('PanelOperadorProduccion — vista de administrador (sin PIN)', () => {
  it('ofrece el piso en solo lectura y no manda al PIN', () => {
    render(createElement(PanelOperadorProduccion, { ...BASE, esAdmin: true }));
    fireEvent.click(screen.getByTestId('alternar-panel-operador'));

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

  it('envía el consumo obligatorio y muestra el resumen al finalizar', async () => {
    const cerrarSesion = vi.fn().mockResolvedValue({
      exito: true,
      datos: {
        id: 'sesion-1',
        estadoSesion: 'finalizada',
        horasBrutas: 1.5,
        horasNetas: 1.25,
        piezasProducidas: 3,
        cantidadProducidaPartida: 3,
        estadoOrden: 'en_proceso',
        estadoPlaneacion: 'en_proceso',
        actualizadoEn: '2026-10-27T00:00:00.000Z',
      },
    });
    const ordenActiva = {
      id: 'orden-1',
      folio: 'OP-000001',
      estadoKanban: 'en_proceso',
      sesiones: [],
      partidas: [{ id: 'partida-1', codigoPieza: 'PZA-01', programaciones: [], metasProceso: [] }],
    } as never;

    render(createElement(PanelOperadorProduccion, {
      ...BASE,
      orden: ordenActiva,
      sesionActiva: {
        id: 'sesion-1', ordenId: 'orden-1', partidaId: 'partida-1', programacionId: 'programacion-1',
      },
      operadorDisponible: true,
      materiales: [{ id: 'material-1', codigo: 'MAT-01', nombre: 'Lámina', unidadBase: 'pieza' }],
      onCerrar: cerrarSesion,
    }));

    fireEvent.change(screen.getByLabelText('Piezas producidas ahora'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Merma'), { target: { value: '0.25' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de producción' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar PIN'), { target: { value: '4826' } });
    fireEvent.submit(screen.getByTestId('cerrar-sesion-produccion').closest('form')!);

    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1));
    expect(cerrarSesion).toHaveBeenCalledWith(expect.objectContaining({
      sesionId: 'sesion-1',
      piezasProducidas: 3,
      consumo: {
        materialId: 'material-1',
        cantidadUsada: 2,
        cantidadScrap: 0.25,
        motivo: 'Consumo de producción',
      },
    }));
    expect(screen.getByTestId('resumen-cierre-sesion').textContent).toContain('Material usado');
    expect(screen.getByTestId('resumen-cierre-sesion').textContent).toContain('MAT-01');
  });

  it('permite al administrador finalizar sin producir una sesión abandonada (regresión QA)', async () => {
    const onCerrarComoSupervisor = vi.fn().mockResolvedValue({ exito: true });
    const ordenConSesion = {
      id: 'orden-1',
      folio: 'OP-000001',
      estadoKanban: 'en_proceso',
      sesiones: [{
        id: 'sesion-1',
        partidaId: 'partida-1',
        programacionId: 'programacion-1',
        operadorId: 'operador-1',
        fechaInicio: '2026-11-15T22:19:00.000Z',
        estadoSesion: 'activa',
      }],
      partidas: [{
        id: 'partida-1',
        codigoPieza: 'IT01',
        programaciones: [{ id: 'programacion-1', metaProcesoId: 'meta-1' }],
        metasProceso: [{ id: 'meta-1', nombre: 'Corte laser' }],
      }],
    } as never;

    render(createElement(PanelOperadorProduccion, {
      ...BASE,
      esAdmin: true,
      orden: ordenConSesion,
      onCerrarComoSupervisor,
      responsables: { 'operador-1': 'Jorge Ramírez' },
    }));

    fireEvent.click(screen.getByTestId('finalizar-sesion-supervisor-sesion-1'));
    expect(screen.getByText(/Finalizar sesión de/)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/^Notas/), {
      target: { value: 'El operador olvidó cerrar al terminar el turno.' },
    });
    fireEvent.submit(screen.getByTestId('confirmar-supervisor-sesion').closest('form')!);

    await waitFor(() => expect(onCerrarComoSupervisor).toHaveBeenCalledWith(expect.objectContaining({
      sesionId: 'sesion-1',
      piezasProducidas: 0,
      estadoDestino: 'finalizada',
      notas: 'El operador olvidó cerrar al terminar el turno.',
    })));
  });

  it('mantiene la pausa con motivo desde el panel del administrador', async () => {
    const onCerrarComoSupervisor = vi.fn().mockResolvedValue({ exito: true });
    const ordenConSesion = {
      id: 'orden-1',
      folio: 'OP-000001',
      estadoKanban: 'en_proceso',
      sesiones: [{
        id: 'sesion-2',
        partidaId: 'partida-1',
        programacionId: 'programacion-1',
        operadorId: 'operador-1',
        fechaInicio: '2026-11-15T22:19:00.000Z',
        estadoSesion: 'activa',
      }],
      partidas: [{ id: 'partida-1', codigoPieza: 'IT01', programaciones: [], metasProceso: [] }],
    } as never;

    render(createElement(PanelOperadorProduccion, {
      ...BASE,
      esAdmin: true,
      orden: ordenConSesion,
      motivosPausa: [{ codigo: 'DUDA', nombre: 'Duda', requiereNota: false, liberaMaquina: false }],
      onCerrarComoSupervisor,
      responsables: {},
    }));

    fireEvent.click(screen.getByTestId('pausar-sesion-supervisor-sesion-2'));
    fireEvent.submit(screen.getByTestId('confirmar-supervisor-sesion').closest('form')!);

    await waitFor(() => expect(onCerrarComoSupervisor).toHaveBeenCalledWith(expect.objectContaining({
      sesionId: 'sesion-2',
      estadoDestino: 'pausada',
      motivoPausa: 'DUDA',
    })));
  });
});
