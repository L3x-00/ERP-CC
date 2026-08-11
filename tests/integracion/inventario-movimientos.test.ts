import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorInventario,
  registrarMovimientoServicio,
} from '@/modulos/inventario/servicios/inventario-servicio';

/** Lee una variable de `.env.local` (Vitest node no la carga sola). */
function leerVariableEnv(nombre: string): string | undefined {
  try {
    const rutaEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
    const contenido = readFileSync(rutaEnv, 'utf8');
    const coincidencia = contenido.match(new RegExp(`^${nombre}=([^\\r\\n]+)`, 'm'));
    if (coincidencia?.[1]) return coincidencia[1].trim();
  } catch {
    // `.env.local` ausente; se intenta process.env abajo.
  }
  return process.env[nombre];
}

const URL_SUPABASE = leerVariableEnv('NEXT_PUBLIC_SUPABASE_URL');
const CLAVE_SERVICE_ROLE = leerVariableEnv('SUPABASE_SERVICE_ROLE_KEY');
const faltanCredenciales = !URL_SUPABASE || !CLAVE_SERVICE_ROLE;
const describir = faltanCredenciales ? describe.skip : describe;

const CODIGO_PRUEBA = 'PRUEBA-INV-F42';

describir('movimientos de inventario (integración Fase 4.2 — función atómica)', () => {
  let admin: SupabaseClient<Database>;
  let materialId: string;

  beforeAll(async () => {
    admin = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
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
