import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorInventario,
  registrarMovimientoServicio,
} from '@/modulos/inventario/servicios/inventario-servicio';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Esta suite BORRA e inserta materiales y movimientos: solo stack local.
const { describir, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'movimientos de inventario',
);

const CODIGO_PRUEBA = 'PRUEBA-INV-F42';

describir('movimientos de inventario (integración Fase 4.2 — función atómica)', () => {
  let admin: SupabaseClient<Database>;
  let materialId: string;

  beforeAll(async () => {
    admin = crearClienteServicio();
    // Limpieza previa auto-sanadora.
    await admin.from('materiales').delete().eq('codigo', CODIGO_PRUEBA);

    const { data } = await admin
      .from('materiales')
      .insert({
        codigo: CODIGO_PRUEBA,
        nombre: 'Material de prueba F4.2',
        categoria: 'materia_prima',
        unidad_compra: 'hoja',
        unidad_control: 'm2',
        factor_conversion: 2, // 2 m² por hoja
        costo_unitario_compra: 0,
        costo_unitario_control: 0,
        stock_minimo_control: 0,
        factor_merma_porcentaje: 8,
      })
      .select('id')
      .single();
    materialId = data!.id;
  });

  afterAll(async () => {
    if (materialId) {
      await admin.from('movimientos_inventario').delete().eq('material_id', materialId);
    }
    await admin.from('materiales').delete().eq('codigo', CODIGO_PRUEBA);
  });

  it('entrada 1 (sin stock previo) fija costo y stock', async () => {
    // 5 hojas @ 100/hoja → 10 m², costo control = 50/m².
    await registrarMovimientoServicio(admin, {
      tipo: 'entrada_compra',
      materialId,
      cantidadCompra: 5,
      costoUnitarioCompra: 100,
    });
    const { data } = await admin
      .from('materiales')
      .select('stock_actual_control, costo_unitario_control')
      .eq('id', materialId)
      .single();
    expect(Number(data!.stock_actual_control)).toBeCloseTo(10, 4);
    expect(Number(data!.costo_unitario_control)).toBeCloseTo(50, 4);
  });

  it('entrada 2 aplica CPP', async () => {
    // 5 hojas @ 200/hoja → 10 m² @ 100/m². CPP = (10*50 + 10*100)/20 = 75.
    await registrarMovimientoServicio(admin, {
      tipo: 'entrada_compra',
      materialId,
      cantidadCompra: 5,
      costoUnitarioCompra: 200,
    });
    const { data } = await admin
      .from('materiales')
      .select('stock_actual_control, costo_unitario_control')
      .eq('id', materialId)
      .single();
    expect(Number(data!.stock_actual_control)).toBeCloseTo(20, 4);
    expect(Number(data!.costo_unitario_control)).toBeCloseTo(75, 4);
  });

  it('salida dentro del stock descuenta', async () => {
    await registrarMovimientoServicio(admin, {
      tipo: 'salida_produccion',
      materialId,
      cantidadControl: 5,
    });
    const { data } = await admin
      .from('materiales')
      .select('stock_actual_control')
      .eq('id', materialId)
      .single();
    expect(Number(data!.stock_actual_control)).toBeCloseTo(15, 4);
  });

  it('salida que excede el stock es rechazada por la función atómica', async () => {
    await expect(
      registrarMovimientoServicio(admin, {
        tipo: 'salida_produccion',
        materialId,
        cantidadControl: 100000,
      }),
    ).rejects.toBeInstanceOf(ErrorInventario);

    // El stock no cambió por el intento rechazado.
    const { data } = await admin
      .from('materiales')
      .select('stock_actual_control')
      .eq('id', materialId)
      .single();
    expect(Number(data!.stock_actual_control)).toBeCloseTo(15, 4);
  });
});
