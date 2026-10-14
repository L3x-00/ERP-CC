// @vitest-environment jsdom
// Obs. cliente 2026-10-13: «Tarifas / TC» es el único lugar del tarifario. Cada
// grupo de equipo muestra su tarifa vigente y de dónde sale (propia o estación),
// y se puede vincular a una estación o ponerle una tarifa propia en texto libre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { guardarGrupoMock } = vi.hoisted(() => ({ guardarGrupoMock: vi.fn() }));

vi.mock('@/modulos/catalogos/acciones/indice', () => ({
  guardarGrupoEquipoAccion: (...argumentos: unknown[]) => guardarGrupoMock(...argumentos),
}));

import type { GrupoEquipoCatalogo } from '@/modulos/catalogos/tipos/indice';
import {
  resumenTarifaGrupo,
  SeccionTarifasGrupos,
} from '@/modulos/configuracion/componentes/seccion-tarifas-grupos';

const TARIFAS = { laser: 650, router: 550, doblado: 600, soldadura: 450, mano_obra: 350, acabado: 300 };

function grupo(parcial: Partial<GrupoEquipoCatalogo> & { id: string; codigo: string; nombre: string }): GrupoEquipoCatalogo {
  return {
    activo: true,
    orden: 0,
    creadoEn: '2026-10-13T00:00:00.000Z',
    tarifaHora: null,
    tarifaMoneda: 'MXN',
    estacionTarifa: null,
    ...parcial,
  };
}

const GRUPOS = [
  grupo({ id: 'g-laser', codigo: 'LASER_FIBRA', nombre: 'Láser Fibra', estacionTarifa: 'laser' }),
  grupo({ id: 'g-propia', codigo: 'PRESS_BRAKE', nombre: 'Press Brake', tarifaHora: 820.5, estacionTarifa: 'doblado' }),
  grupo({ id: 'g-nada', codigo: 'EXTRA', nombre: 'Grupo extra' }),
];

function montar(parcial: { puedeEditar?: boolean; grupos?: GrupoEquipoCatalogo[] } = {}) {
  const onGuardado = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  render(
    createElement(SeccionTarifasGrupos, {
      grupos: parcial.grupos ?? GRUPOS,
      tarifasEstacion: TARIFAS,
      puedeEditar: parcial.puedeEditar ?? true,
      onGuardado,
      onError,
    }),
  );
  return { onGuardado, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  guardarGrupoMock.mockResolvedValue({ exito: true, datos: {} });
});

afterEach(() => {
  cleanup();
});

describe('resumenTarifaGrupo', () => {
  it('la tarifa propia manda; sin ella se muestra la de la estación y su origen', () => {
    expect(resumenTarifaGrupo(GRUPOS[1]!, TARIFAS)).toEqual({
      texto: '820.50 MXN/h',
      origen: 'Tarifa propia del grupo',
    });
    expect(resumenTarifaGrupo(GRUPOS[0]!, TARIFAS)).toEqual({
      texto: '650.00 MXN/h',
      origen: 'Tarifas / TC · Corte láser',
    });
    expect(resumenTarifaGrupo(GRUPOS[2]!, TARIFAS)).toBeNull();
  });
});

describe('SeccionTarifasGrupos — tarifario único', () => {
  it('muestra la tarifa vigente de cada grupo y de dónde sale', () => {
    montar();

    const laser = within(screen.getByTestId('tarifa-grupo-LASER_FIBRA'));
    expect(laser.getByText('650.00 MXN/h')).toBeDefined();
    expect(laser.getByText('Tarifas / TC · Corte láser')).toBeDefined();

    const press = within(screen.getByTestId('tarifa-grupo-PRESS_BRAKE'));
    expect(press.getByText('820.50 MXN/h')).toBeDefined();
    expect(press.getByText('Tarifa propia del grupo')).toBeDefined();

    expect(within(screen.getByTestId('tarifa-grupo-EXTRA')).getByText('Sin tarifa')).toBeDefined();
  });

  it('avisa cuántos grupos activos no tienen tarifa ni estación', () => {
    montar();

    expect(screen.getByTestId('grupos-sin-tarifa').textContent).toMatch(/1 grupo activo no tiene/);
  });

  it('un grupo inactivo se distingue y no cuenta como «sin tarifa»', () => {
    montar({
      grupos: [grupo({ id: 'g-viejo', codigo: 'VIEJO', nombre: 'Grupo viejo', activo: false })],
    });

    expect(within(screen.getByTestId('tarifa-grupo-VIEJO')).getByText('Inactivo')).toBeDefined();
    expect(screen.queryByTestId('grupos-sin-tarifa')).toBeNull();
  });

  it('sin permiso de edición no ofrece editar', () => {
    montar({ puedeEditar: false });

    expect(screen.queryByRole('button', { name: 'Editar tarifa' })).toBeNull();
  });

  it('vincula el grupo a una estación sin tarifa propia', async () => {
    const { onGuardado } = montar();

    fireEvent.click(within(screen.getByTestId('tarifa-grupo-EXTRA')).getByRole('button', { name: 'Editar tarifa' }));
    const estacion = screen.getByLabelText('Estación de Tarifas / TC de Grupo extra') as HTMLSelectElement;
    expect(Array.from(estacion.options).map((opcion) => opcion.value)).toEqual([
      '',
      'laser',
      'router',
      'doblado',
      'soldadura',
      'mano_obra',
      'acabado',
    ]);
    // Cada opción muestra la tarifa actual de la estación.
    expect(screen.getByRole('option', { name: 'Router CNC · 550.00 MXN/h' })).toBeDefined();

    fireEvent.change(estacion, { target: { value: 'router' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(guardarGrupoMock).toHaveBeenCalledTimes(1));
    expect(guardarGrupoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'g-nada',
        tarifaHora: null,
        tarifaMoneda: 'MXN',
        estacionTarifa: 'router',
      }),
    );
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith('Tarifa de Grupo extra guardada'));
  });

  it('la tarifa propia se captura como texto libre ($, comas) y se guarda como número', async () => {
    montar();

    fireEvent.click(within(screen.getByTestId('tarifa-grupo-EXTRA')).getByRole('button', { name: 'Editar tarifa' }));
    const campo = screen.getByLabelText('Tarifa por hora de Grupo extra') as HTMLInputElement;
    expect(campo.type).toBe('text');
    fireEvent.change(campo, { target: { value: '$1,250.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(guardarGrupoMock).toHaveBeenCalledWith(
        expect.objectContaining({ tarifaHora: 1250.5, estacionTarifa: null }),
      ),
    );
  });

  it('dejar la tarifa propia vacía conserva la estación como fuente', async () => {
    montar();

    fireEvent.click(within(screen.getByTestId('tarifa-grupo-PRESS_BRAKE')).getByRole('button', { name: 'Editar tarifa' }));
    expect((screen.getByLabelText('Tarifa por hora de Press Brake') as HTMLInputElement).value).toBe('820.5');
    fireEvent.change(screen.getByLabelText('Tarifa por hora de Press Brake'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(guardarGrupoMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'g-propia', tarifaHora: null, estacionTarifa: 'doblado' }),
      ),
    );
  });

  it('una tarifa propia que no es un monto no se envía y avisa', async () => {
    const { onError } = montar();

    fireEvent.click(within(screen.getByTestId('tarifa-grupo-EXTRA')).getByRole('button', { name: 'Editar tarifa' }));
    fireEvent.change(screen.getByLabelText('Tarifa por hora de Grupo extra'), { target: { value: 'mucho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0]).toMatch(/monto válido/i);
    expect(guardarGrupoMock).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor y no cierra la edición', async () => {
    guardarGrupoMock.mockResolvedValue({ exito: false, error: 'Sin permiso' });
    const { onError } = montar();

    fireEvent.click(within(screen.getByTestId('tarifa-grupo-EXTRA')).getByRole('button', { name: 'Editar tarifa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Sin permiso'));
    expect(screen.getByLabelText('Tarifa por hora de Grupo extra')).toBeDefined();
  });
});
