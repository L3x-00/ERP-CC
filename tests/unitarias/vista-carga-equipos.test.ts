// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { VistaCargaEquipos } from '@/modulos/produccion/componentes/vista-carga-equipos';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

afterEach(cleanup);

const HOY = '2026-11-18'; // miércoles; la semana va del lunes 16 al domingo 22.

const RECURSOS: RecursoPlaneacion[] = [
  {
    id: 'recurso-cnc',
    codigo: 'CNC-01',
    nombre: 'CNC principal',
    area: 'sheet_metal',
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'recurso-laser',
    codigo: 'LASER-01',
    nombre: 'Láser de fibra',
    area: 'sheet_metal',
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  },
];

function carga(
  recursoId: string,
  fecha: string,
  programadas: number,
  capacidad = 8,
): CargaCapacidadDiaria {
  return {
    recursoId,
    area: 'sheet_metal',
    fechaProgramada: fecha,
    turno: 'jornada',
    horasCapacidad: capacidad,
    horasProgramadas: programadas,
    horasReales: 0,
    horasExceso: Math.max(0, programadas - capacidad),
    horasDisponibles: Math.max(0, capacidad - programadas),
    porcentajeOcupacion: capacidad === 0 ? 0 : (programadas / capacidad) * 100,
    sobrecargado: programadas > capacidad,
  };
}

const CARGAS: CargaCapacidadDiaria[] = [
  carga('recurso-cnc', '2026-11-16', 8),
  carga('recurso-cnc', '2026-11-17', 2),
  carga('recurso-cnc', '2026-11-18', 4),
  carga('recurso-cnc', '2026-11-21', 0, 4),
  carga('recurso-laser', '2026-11-18', 6),
  carga('recurso-laser', '2026-11-21', 0, 4),
];

function renderizar() {
  return render(
    createElement(VistaCargaEquipos, {
      cargas: CARGAS,
      recursos: RECURSOS,
      hoy: HOY,
    }),
  );
}

describe('VistaCargaEquipos', () => {
  it('abre en modo Semana con la matriz de equipos y la semana en curso', () => {
    renderizar();

    expect(screen.getByRole('heading', { name: 'Carga de equipos' })).toBeTruthy();
    expect(screen.getByText(/Semana del lunes 16 de noviembre al domingo 22 de noviembre/))
      .toBeTruthy();
    expect(
      (screen.getByTestId('carga-modo-semana') as HTMLButtonElement).getAttribute('aria-pressed'),
    ).toBe('true');

    const resumen = screen.getByTestId('resumen-carga-semanal');
    expect(within(resumen).getByRole('heading', { name: 'Carga semanal' })).toBeTruthy();
    expect(resumen.textContent).toContain('CNC-01 · CNC principal');
    expect(resumen.textContent).toContain('LASER-01 · Láser de fibra');
    // Columnas de lunes a sábado; el domingo sin carga no se pinta.
    expect(within(resumen).getByText('lun 16 nov')).toBeTruthy();
    expect(within(resumen).getByText('sáb 21 nov')).toBeTruthy();
    expect(within(resumen).queryByText('dom 22 nov')).toBeNull();
  });

  it('en modo Día muestra sólo el día elegido y su capacidad libre', () => {
    renderizar();

    fireEvent.click(screen.getByTestId('carga-modo-dia'));

    const resumen = screen.getByTestId('resumen-carga-semanal');
    expect(within(resumen).getByRole('heading', { name: 'Carga del día' })).toBeTruthy();
    expect(within(resumen).getAllByText('mié 18 nov')).toHaveLength(1);
    expect(within(resumen).queryByText('lun 16 nov')).toBeNull();
    expect(within(resumen).getByTestId('libre-CNC-01').textContent).toBe('4 h');
    expect(within(resumen).getByTestId('libre-LASER-01').textContent).toBe('2 h');

    fireEvent.click(screen.getByTestId('carga-dia-2026-11-16'));

    const lunes = screen.getByTestId('resumen-carga-semanal');
    expect(within(lunes).getAllByText('lun 16 nov')).toHaveLength(1);
    expect(within(lunes).getByTestId('libre-CNC-01').textContent).toBe('0 h');
    expect(within(lunes).queryByText('LASER-01 · Láser de fibra')).not.toBeNull();
  });

  it('muestra un aviso si la lectura de capacidad falló y conserva el panel', () => {
    render(createElement(VistaCargaEquipos, {
      cargas: [],
      recursos: [],
      hoy: HOY,
      error: true,
    }));

    expect(screen.getByRole('heading', { name: 'Carga de equipos' })).toBeTruthy();
    expect(screen.getByTestId('carga-equipos-error').textContent)
      .toContain('No se pudo leer la carga de equipos');
    expect(screen.queryByTestId('resumen-carga-semanal')).toBeNull();
    expect(screen.queryByTestId('carga-dia-cerrado')).toBeNull();
  });

  it('marca el día de hoy y explica que el domingo no se labora', () => {
    renderizar();

    fireEvent.click(screen.getByTestId('carga-modo-dia'));

    const hoy = screen.getByTestId(`carga-dia-${HOY}`);
    expect(hoy.getAttribute('aria-current')).toBe('date');
    expect(hoy.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('carga-dia-2026-11-22'));

    expect(screen.getByTestId('carga-dia-cerrado').textContent).toContain(
      'La empresa no labora el domingo',
    );
    expect(screen.queryByTestId('resumen-carga-semanal')).toBeNull();
  });
});
