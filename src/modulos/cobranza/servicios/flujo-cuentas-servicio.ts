import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/** Movimiento normalizado para el flujo por cuenta (OBS-24). */
export type MovimientoCuenta = {
  cuentaId: string | null;
  moneda: string;
  monto: number;
  tipoCambio: number;
  tipo: 'ingreso' | 'egreso';
};

/** Fila del flujo neto por cuenta, consolidada en MXN. */
export type FlujoCuenta = {
  cuentaId: string | null;
  etiqueta: string;
  ingresoMxn: number;
  egresoMxn: number;
  netoMxn: number;
};

/** Redondea a 2 decimales evitando el error de flotante. */
function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Convierte un movimiento a MXN usando su TC cuando la moneda es USD. */
function aMxn(movimiento: MovimientoCuenta): number {
  const monto = Number.isFinite(movimiento.monto) ? movimiento.monto : 0;
  const tipoCambio =
    movimiento.moneda === 'USD' && Number.isFinite(movimiento.tipoCambio) && movimiento.tipoCambio > 0
      ? movimiento.tipoCambio
      : 1;
  return redondear(monto * tipoCambio);
}

/**
 * Consolida movimientos por cuenta (OBS-24): cobros de `pagos_ar` como ingreso y
 * gastos no cancelados como egreso, ambos convertidos a MXN con el TC aplicado
 * al momento del registro. Función pura para poder probarla sin base de datos.
 *
 * No es un saldo bancario: no hay saldo inicial y el sistema no concilia
 * extractos; solo responde "cuánto entró y salió por esta cuenta".
 */
export function calcularFlujoPorCuenta(
  movimientos: readonly MovimientoCuenta[],
  cuentas: readonly { id: string; etiqueta: string }[],
): FlujoCuenta[] {
  const porCuenta = new Map<string | null, { ingreso: number; egreso: number }>();
  for (const cuenta of cuentas) {
    porCuenta.set(cuenta.id, { ingreso: 0, egreso: 0 });
  }

  for (const movimiento of movimientos) {
    const acumulado = porCuenta.get(movimiento.cuentaId) ?? { ingreso: 0, egreso: 0 };
    if (movimiento.tipo === 'ingreso') acumulado.ingreso += aMxn(movimiento);
    else acumulado.egreso += aMxn(movimiento);
    porCuenta.set(movimiento.cuentaId, acumulado);
  }

  const etiquetas = new Map<string | null, string>([
    ...cuentas.map((cuenta) => [cuenta.id, cuenta.etiqueta] as [string | null, string]),
    [null, 'Sin cuenta asignada'],
  ]);

  const filas: FlujoCuenta[] = [];
  for (const [cuentaId, acumulado] of porCuenta) {
    const ingresoMxn = redondear(acumulado.ingreso);
    const egresoMxn = redondear(acumulado.egreso);
    filas.push({
      cuentaId,
      etiqueta: etiquetas.get(cuentaId) ?? 'Cuenta desconocida',
      ingresoMxn,
      egresoMxn,
      netoMxn: redondear(ingresoMxn - egresoMxn),
    });
  }

  return filas.sort((a, b) => {
    if (a.cuentaId === null) return 1;
    if (b.cuentaId === null) return -1;
    return a.etiqueta.localeCompare(b.etiqueta, 'es');
  });
}

/**
 * Lee cobros y gastos (bajo el alcance del cliente recibido, nunca service role
 * en rutas de usuario) y devuelve el flujo neto por cuenta. Los gastos
 * cancelados no cuentan; los movimientos sin cuenta se agrupan aparte.
 */
export async function obtenerFlujoCuentasServicio(
  cliente: SupabaseClient<Database>,
): Promise<FlujoCuenta[]> {
  const [cuentas, pagos, gastos] = await Promise.all([
    cliente
      .from('cuentas_bancarias')
      .select('id, banco, numero_cuenta, moneda, activa')
      .order('banco', { ascending: true }),
    cliente
      .from('pagos_ar')
      .select('cuenta_bancaria_id, monto_pagado, moneda_pago, tipo_cambio_pago'),
    cliente
      .from('gastos')
      .select('cuenta_bancaria_id, monto_total, moneda, tipo_cambio, estado_pago')
      .neq('estado_pago', 'cancelado'),
  ]);

  if (cuentas.error) throw new Error(`No se pudieron leer las cuentas: ${cuentas.error.message}`);
  if (pagos.error) throw new Error(`No se pudieron leer los pagos: ${pagos.error.message}`);
  if (gastos.error) throw new Error(`No se pudieron leer los gastos: ${gastos.error.message}`);

  const catalogo = (cuentas.data ?? []).map((cuenta) => ({
    id: cuenta.id,
    etiqueta: `${cuenta.banco} · …${String(cuenta.numero_cuenta).slice(-4)} · ${cuenta.moneda}${
      cuenta.activa ? '' : ' (inactiva)'
    }`,
  }));

  const movimientos: MovimientoCuenta[] = [
    ...(pagos.data ?? []).map((pago) => ({
      cuentaId: pago.cuenta_bancaria_id,
      moneda: pago.moneda_pago,
      monto: Number(pago.monto_pagado),
      tipoCambio: Number(pago.tipo_cambio_pago),
      tipo: 'ingreso' as const,
    })),
    ...(gastos.data ?? []).map((gasto) => ({
      cuentaId: gasto.cuenta_bancaria_id,
      moneda: gasto.moneda,
      monto: Number(gasto.monto_total),
      tipoCambio: Number(gasto.tipo_cambio),
      tipo: 'egreso' as const,
    })),
  ];

  return calcularFlujoPorCuenta(movimientos, catalogo);
}
