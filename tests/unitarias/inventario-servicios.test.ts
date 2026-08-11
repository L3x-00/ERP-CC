import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import {
  calcularCostoPromedioPonderado,
  convertirCompraAControl,
  costoControlDesdeCompra,
  stockSuficiente,
} from '@/modulos/inventario/servicios/calculos-inventario';
import {
  ErrorInventario,
  registrarMovimientoServicio,
} from '@/modulos/inventario/servicios/inventario-servicio';

describe('calcularCostoPromedioPonderado (CPP)', () => {
  it('primer ingreso sin stock previo: el costo es el entrante', () => {
    expect(
      calcularCostoPromedioPonderado({
        stockActual: 0,
        costoActual: 0,
        cantidadEntrante: 10,
        costoEntrante: 100,
      }),
    ).toBe(100);
  });

  it('promedia stock previo y entrada (mismas cantidades)', () => {
    // (10*50 + 10*100) / 20 = 75
    expect(
      calcularCostoPromedioPonderado({
        stockActual: 10,
        costoActual: 50,
        cantidadEntrante: 10,
        costoEntrante: 100,
      }),
    ).toBe(75);
  });

  it('promedia ponderando por cantidad', () => {
    // (100*20 + 50*26) / 150 = (2000+1300)/150 = 22
    expect(
      calcularCostoPromedioPonderado({
        stockActual: 100,
        costoActual: 20,
        cantidadEntrante: 50,
        costoEntrante: 26,
      }),
    ).toBe(22);
  });

  it('caso con decimales', () => {
    // (3*10 + 7*13) / 10 = (30+91)/10 = 12.1
    expect(
      calcularCostoPromedioPonderado({
        stockActual: 3,
        costoActual: 10,
        cantidadEntrante: 7,
        costoEntrante: 13,
      }),
    ).toBeCloseTo(12.1, 5);
  });
});

describe('conversión de unidades compra ↔ control', () => {
  it('convierte cantidad de compra a control con el factor', () => {
    // 5 hojas * 2.88 m²/hoja = 14.4 m²
    expect(convertirCompraAControl(5, 2.88)).toBeCloseTo(14.4, 5);
  });

  it('deriva el costo por unidad de control desde el de compra', () => {
    // 1500 $/hoja / 2.88 m²/hoja = 520.833... $/m²
    expect(costoControlDesdeCompra(1500, 2.88)).toBeCloseTo(520.8333, 3);
  });

  it('factor inválido (<= 0) devuelve costo 0 (evita división por cero)', () => {
    expect(costoControlDesdeCompra(1500, 0)).toBe(0);
  });
});

describe('stockSuficiente', () => {
  it('permite salida menor o igual al stock', () => {
    expect(stockSuficiente(10, 5)).toBe(true);
    expect(stockSuficiente(5, 5)).toBe(true);
  });

  it('rechaza salida mayor al stock', () => {
    expect(stockSuficiente(5, 10)).toBe(false);
  });
});

/** Construye una fila de material con overrides. */
function filaMaterial(sobre: Partial<Tables<'materiales'>>): Tables<'materiales'> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    codigo: 'MAT-1',
    nombre: 'Material 1',
    descripcion: null,
    categoria: 'materia_prima',
    unidad_compra: 'hoja',
    unidad_control: 'm2',
    factor_conversion: 1,
    costo_unitario_compra: 100,
    costo_unitario_control: 100,
    stock_actual_control: 5,
    stock_reservado_control: 0,
    stock_minimo_control: 0,
    proveedor_id: null,
    factor_merma_porcentaje: 8,
    creado_en: '2026-08-01T00:00:00Z',
    actualizado_en: '2026-08-01T00:00:00Z',
    ...sobre,
  };
}

/** Cliente Supabase mínimo que solo resuelve la carga del material. */
function clienteConMaterial(fila: Tables<'materiales'>): SupabaseClient<Database> {
  const stub = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fila, error: null }),
        }),
      }),
    }),
  };
  return stub as unknown as SupabaseClient<Database>;
}

describe('registrarMovimientoServicio — rechazo de salida sin stock', () => {
  it('rebota con ErrorInventario stock_insuficiente antes de tocar la RPC', async () => {
    const admin = clienteConMaterial(filaMaterial({ stock_actual_control: 5 }));

    await expect(
      registrarMovimientoServicio(admin, {
        tipo: 'salida_produccion',
        materialId: '11111111-1111-4111-8111-111111111111',
        cantidadControl: 10,
      }),
    ).rejects.toMatchObject({
      name: 'ErrorInventario',
      codigo: 'stock_insuficiente',
    });
  });

  it('material inexistente rebota con material_inexistente', async () => {
    const stub = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    await expect(
      registrarMovimientoServicio(stub, {
        tipo: 'salida_produccion',
        materialId: '22222222-2222-4222-8222-222222222222',
        cantidadControl: 1,
      }),
    ).rejects.toBeInstanceOf(ErrorInventario);
  });
});
