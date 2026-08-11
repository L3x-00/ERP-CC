// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

// Se mockean las Server Actions (importan módulos de servidor). Con vi.hoisted
// para poder referenciar los spies dentro de los factories de vi.mock.
const { crearMaterialMock, registrarEntradaMock, registrarSalidaMock } = vi.hoisted(() => ({
  crearMaterialMock: vi.fn(),
  registrarEntradaMock: vi.fn(),
  registrarSalidaMock: vi.fn(),
}));

vi.mock('@/modulos/inventario/acciones/crear-material-accion', () => ({
  crearMaterialAccion: (...args: unknown[]) => crearMaterialMock(...args),
}));
vi.mock('@/modulos/inventario/acciones/registrar-entrada-accion', () => ({
  registrarEntradaAccion: (...args: unknown[]) => registrarEntradaMock(...args),
}));
vi.mock('@/modulos/inventario/acciones/registrar-salida-accion', () => ({
  registrarSalidaAccion: (...args: unknown[]) => registrarSalidaMock(...args),
}));

import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { usarMutacionesInventario } from '@/modulos/inventario/hooks/usar-mutaciones-inventario';

describe('usarInventarioTienda (Zustand)', () => {
  beforeEach(() => {
    usarInventarioTienda.setState({
      busqueda: '',
      categoria: null,
      modalActivo: null,
      vista: 'tabla',
      orden: 'nombre',
    });
  });

  it('actualiza y limpia los filtros de búsqueda y categoría', () => {
    const t = usarInventarioTienda.getState();
    t.setBusqueda('acero');
    t.setCategoria('insumo');
    expect(usarInventarioTienda.getState().busqueda).toBe('acero');
    expect(usarInventarioTienda.getState().categoria).toBe('insumo');

    usarInventarioTienda.getState().limpiarFiltros();
    expect(usarInventarioTienda.getState().busqueda).toBe('');
    expect(usarInventarioTienda.getState().categoria).toBeNull();
  });

  it('gestiona apertura/cierre de modales y cambio de vista', () => {
    usarInventarioTienda.getState().abrirModal('registrar-entrada');
    expect(usarInventarioTienda.getState().modalActivo).toBe('registrar-entrada');

    usarInventarioTienda.getState().cerrarModal();
    expect(usarInventarioTienda.getState().modalActivo).toBeNull();

    usarInventarioTienda.getState().setVista('tarjetas');
    usarInventarioTienda.getState().setOrden('stock');
    expect(usarInventarioTienda.getState().vista).toBe('tarjetas');
    expect(usarInventarioTienda.getState().orden).toBe('stock');
  });
});

/** Wrapper con QueryClientProvider (sin JSX, para archivo .ts). */
function crearWrapper(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

function nuevoClienteQuery(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

describe('usarMutacionesInventario (TanStack Query)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crearMaterialMock.mockResolvedValue({ exito: true, datos: { id: 'm-1' } });
    registrarEntradaMock.mockResolvedValue({ exito: true, datos: { id: 'mov-1', folio: 'ENT-000001' } });
    registrarSalidaMock.mockResolvedValue({ exito: true, datos: { id: 'mov-2', folio: 'SAL-000001' } });
  });

  it('invalida la caché de inventario tras crear un material con éxito', async () => {
    const cliente = nuevoClienteQuery();
    const invalidarSpy = vi.spyOn(cliente, 'invalidateQueries');
    const { result } = renderHook(() => usarMutacionesInventario(), {
      wrapper: crearWrapper(cliente),
    });

    await act(async () => {
      await result.current.crearMaterial.mutateAsync({
        codigo: 'AC-1',
        nombre: 'Acero',
        categoria: 'materia_prima',
        unidadCompra: 'hoja',
        unidadControl: 'm2',
        factorConversion: 2,
        costoUnitarioCompra: 100,
        stockMinimoControl: 0,
        factorMermaPorcentaje: 8,
      });
    });

    expect(crearMaterialMock).toHaveBeenCalledTimes(1);
    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['inventario'] });
  });

  it('invalida la caché tras registrar una entrada con éxito', async () => {
    const cliente = nuevoClienteQuery();
    const invalidarSpy = vi.spyOn(cliente, 'invalidateQueries');
    const { result } = renderHook(() => usarMutacionesInventario(), {
      wrapper: crearWrapper(cliente),
    });

    await act(async () => {
      await result.current.registrarEntrada.mutateAsync({
        materialId: '11111111-1111-4111-8111-111111111111',
        cantidadCompra: 5,
        costoUnitarioCompra: 100,
      });
    });

    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['inventario'] });
  });

  it('una salida rechazada marca error y NO invalida la caché', async () => {
    registrarSalidaMock.mockResolvedValue({
      exito: false,
      error: 'Stock insuficiente para la salida',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cliente = nuevoClienteQuery();
    const invalidarSpy = vi.spyOn(cliente, 'invalidateQueries');
    const { result } = renderHook(() => usarMutacionesInventario(), {
      wrapper: crearWrapper(cliente),
    });

    await act(async () => {
      await expect(
        result.current.registrarSalida.mutateAsync({
          materialId: '11111111-1111-4111-8111-111111111111',
          cantidadControl: 999,
        }),
      ).rejects.toThrow('Stock insuficiente para la salida');
    });

    expect(invalidarSpy).not.toHaveBeenCalled();
    // Trazabilidad en consola del cliente (mensaje genérico ya saneado).
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
