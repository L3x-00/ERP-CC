// @vitest-environment jsdom
// Obs. cliente 2026-11: «Áreas de trabajo» ya no muestra precios. El costo por
// hora vive solo en Tarifas / TC para que el administrador no vea dos listas.
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PestanaAreasTrabajo } from '@/modulos/configuracion/componentes/pestana-areas-trabajo';
import type { AreaTrabajoConfig } from '@/modulos/configuracion/tipos/indice';

const AREA: AreaTrabajoConfig = {
  id: '30000000-0000-4000-8000-000000000001',
  codigo: 'LASER_01',
  nombre: 'Corte láser',
  colorHex: '#3B82F6',
  costoHoraInterno: 650,
  tarifaHoraVenta: 1100,
  esExterno: false,
  activo: true,
  orden: 1,
  tipo: 'area',
  padreCodigo: null,
  areaPlaneacion: null,
  creadoEn: '2026-11-02T00:00:00.000Z',
  actualizadoEn: '2026-11-02T00:00:00.000Z',
};

afterEach(cleanup);

describe('PestanaAreasTrabajo — sin listas de precios duplicadas', () => {
  it('no muestra columnas ni campos de costo por hora', () => {
    render(createElement(PestanaAreasTrabajo, {
      datos: [AREA],
      operadores: [],
      onGuardado: vi.fn(),
      onOperadoresGuardados: vi.fn(),
    }));

    expect(screen.queryByText('Interno/h')).toBeNull();
    expect(screen.queryByText('Venta/h')).toBeNull();
    expect(screen.queryByLabelText('Costo interno/h')).toBeNull();
    expect(screen.queryByLabelText('Tarifa venta/h')).toBeNull();
    expect(screen.getByText(/El costo por hora se configura una sola vez/)).toBeTruthy();
  });

  it('lleva a Tarifas y costos cuando se entrega el atajo', () => {
    const irATarifas = vi.fn();
    render(createElement(PestanaAreasTrabajo, {
      datos: [AREA],
      operadores: [],
      onGuardado: vi.fn(),
      onOperadoresGuardados: vi.fn(),
      onIrATarifas: irATarifas,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Tarifas y costos' }));
    expect(irATarifas).toHaveBeenCalledTimes(1);
  });
});
