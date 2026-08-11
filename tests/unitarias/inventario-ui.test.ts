// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Material } from '@/modulos/inventario/tipos/inventario';

// Vitest no tiene `globals: true`, así que el auto-cleanup de RTL no se registra;
// se limpia el DOM manualmente entre pruebas para no acumular renders.
afterEach(() => cleanup());

// --- Mocks de dependencias de datos ------------------------------------------
const { materialesMock, registrarSalidaMock } = vi.hoisted(() => ({
  materialesMock: vi.fn(),
  registrarSalidaMock: vi.fn(),
}));

vi.mock('@/modulos/inventario/hooks/usar-materiales', () => ({
  usarMateriales: () => materialesMock(),
}));
// Las Server Actions importan módulos de servidor: se mockean.
vi.mock('@/modulos/inventario/acciones/crear-material-accion', () => ({
  crearMaterialAccion: vi.fn(),
}));
vi.mock('@/modulos/inventario/acciones/registrar-entrada-accion', () => ({
  registrarEntradaAccion: vi.fn(),
}));
vi.mock('@/modulos/inventario/acciones/registrar-salida-accion', () => ({
  registrarSalidaAccion: (...args: unknown[]) => registrarSalidaMock(...args),
}));

import { TablaMateriales } from '@/modulos/inventario/componentes/tabla-materiales';
import { FormularioSalida } from '@/modulos/inventario/componentes/modal-registrar-salida';
import { usarInventarioTienda } from '@/estado/inventario-tienda';

function material(sobre: Partial<Material>): Material {
  return {
    id: 'mat-1',
    codigo: 'AC-1',
    nombre: 'Acero',
    descripcion: null,
    categoria: 'materia_prima',
    unidadCompra: 'hoja',
    unidadControl: 'm2',
    factorConversion: 2,
    costoUnitarioCompra: 100,
    costoUnitarioControl: 50,
    stockActualControl: 100,
    stockReservadoControl: 0,
    stockMinimoControl: 10,
    proveedorId: null,
    factorMermaPorcentaje: 8,
    creadoEn: '2026-08-01T00:00:00Z',
    actualizadoEn: '2026-08-01T00:00:00Z',
    ...sobre,
  };
}

function conProvider(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

describe('TablaMateriales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usarInventarioTienda.setState({ busqueda: '', categoria: null, soloAlerta: false, orden: 'nombre' });
  });

  it('renderiza los materiales con sus datos', () => {
    materialesMock.mockReturnValue({
      data: {
        registros: [material({ id: 'm1', codigo: 'AC-1', nombre: 'Acero' })],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(createElement(TablaMateriales));

    expect(screen.getByText('AC-1')).toBeTruthy();
    expect(screen.getByText('Acero')).toBeTruthy();
  });

  it('muestra badge de alerta solo en materiales bajo el stock mínimo', () => {
    materialesMock.mockReturnValue({
      data: {
        registros: [
          material({ id: 'm1', codigo: 'AC-1', nombre: 'Normal', stockActualControl: 100, stockMinimoControl: 10 }),
          material({ id: 'm2', codigo: 'AC-2', nombre: 'Bajo', stockActualControl: 5, stockMinimoControl: 10 }),
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
    });

    render(createElement(TablaMateriales));

    // Un único badge "Reordenar" (solo el material bajo mínimo).
    const badges = screen.getAllByText('Reordenar');
    expect(badges).toHaveLength(1);
  });
});

describe('FormularioSalida — bloqueo de stock negativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarSalidaMock.mockResolvedValue({ exito: true, datos: { id: 'x', folio: 'SAL-000001' } });
  });

  function renderFormulario(stock: number) {
    const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(createElement(FormularioSalida, { material: material({ stockActualControl: stock }), onExito: () => {} }), {
      wrapper: conProvider(cliente),
    });
    return {
      input: screen.getByRole('spinbutton') as HTMLInputElement,
      boton: screen.getByRole('button', { name: /registrar salida/i }) as HTMLButtonElement,
    };
  }

  it('deshabilita el envío y muestra error si la cantidad supera el stock', async () => {
    const { input, boton } = renderFormulario(10);
    // Inicialmente (cantidad 0) el botón no está bloqueado por stock.
    expect(boton.disabled).toBe(false);

    fireEvent.change(input, { target: { value: '20' } });

    await waitFor(() => expect(boton.disabled).toBe(true));
    expect(screen.getByText(/supera el stock disponible/i)).toBeTruthy();
  });

  it('permite el envío cuando la cantidad no supera el stock', async () => {
    const { input, boton } = renderFormulario(10);

    fireEvent.change(input, { target: { value: '5' } });

    await waitFor(() => expect(boton.disabled).toBe(false));
    expect(screen.queryByText(/supera el stock disponible/i)).toBeNull();
  });
});
