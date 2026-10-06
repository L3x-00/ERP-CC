import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  type CuentaTesoreria,
  type DatosTesoreria,
  type MovimientoTesoreria,
} from '@/modulos/tesoreria/tipos/indice';

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function etiquetaCuenta(cuenta: {
  banco: string;
  numero_cuenta: string;
  moneda: string;
  activa: boolean;
}): string {
  return `${cuenta.banco} · …${String(cuenta.numero_cuenta).slice(-4)} · ${cuenta.moneda}${
    cuenta.activa ? '' : ' (inactiva)'
  }`;
}

/**
 * SII-B8 F5: saldos por cuenta (inicial + movimientos vivos en la moneda de la
 * cuenta) y lista de movimientos (cobros, pagos a proveedor, gastos pagados y
 * transferencias) con su marca de conciliación.
 *
 * Las transferencias internas no son ingreso/gasto: solo mueven saldo entre
 * cuentas. Los gastos en moneda distinta a la cuenta solo se convierten cuando
 * la cuenta es MXN (con el TC del gasto); el caso inverso se omite y se refleja
 * en el flujo informativo existente.
 */
export async function obtenerTesoreria(
  cliente: SupabaseClient<Database>,
  limiteMovimientos = 300,
): Promise<DatosTesoreria> {
  const [cuentasResp, saldosResp, cobrosResp, pagosCompraResp, gastosResp, transferResp, conciliacionesResp] =
    await Promise.all([
      cliente
        .from('cuentas_bancarias')
        .select('id, banco, numero_cuenta, moneda, activa, tipo')
        .order('banco', { ascending: true }),
      cliente.from('saldos_iniciales_tesoreria').select('cuenta_id, monto, moneda, tipo_cambio'),
      cliente
        .from('pagos_ar')
        .select('id, cuenta_bancaria_id, folio_recibo, monto_pagado, moneda_pago, creado_en')
        .not('cuenta_bancaria_id', 'is', null),
      cliente
        .from('pagos_compra')
        .select('id, compra_id, monto, fecha_pago, referencia, cuenta_bancaria_id')
        .not('cuenta_bancaria_id', 'is', null),
      cliente
        .from('gastos')
        .select('id, folio, folio_sii, monto_total, moneda, tipo_cambio, fecha_gasto, cuenta_bancaria_id')
        .not('cuenta_bancaria_id', 'is', null)
        .eq('estado_pago', 'pagado'),
      cliente
        .from('movimientos_tesoreria')
        .select('id, cuenta_id, tipo, monto, moneda, referencia, par_movimiento_id, creado_en'),
      cliente.from('conciliaciones_tesoreria').select('entidad, entidad_id, conciliado_en'),
    ]);

  if (cuentasResp.error) throw new Error('No se pudieron cargar las cuentas de tesorería');

  const cuentasCatalogo = cuentasResp.data ?? [];
  const cuentaPorId = new Map(cuentasCatalogo.map((cuenta) => [cuenta.id, cuenta]));
  const saldoInicialPorCuenta = new Map(
    (saldosResp.data ?? []).map((saldo) => [saldo.cuenta_id, Number(saldo.monto)]),
  );

  const compraIds = [...new Set((pagosCompraResp.data ?? []).map((pago) => pago.compra_id))];
  const compraPorId = new Map<string, { folio: string; moneda: string }>();
  if (compraIds.length > 0) {
    const { data: compras } = await cliente
      .from('compras')
      .select('id, folio_sii, moneda')
      .in('id', compraIds);
    for (const compra of compras ?? []) {
      compraPorId.set(compra.id, { folio: compra.folio_sii, moneda: compra.moneda });
    }
  }

  const conciliadoPorEntidad = new Map(
    (conciliacionesResp.data ?? []).map((conciliacion) => [
      `${conciliacion.entidad}:${conciliacion.entidad_id}`,
      conciliacion.conciliado_en,
    ]),
  );

  const movimientos: MovimientoTesoreria[] = [];
  const acumuladoPorCuenta = new Map<string, number>();

  for (const cuenta of cuentasCatalogo) {
    acumuladoPorCuenta.set(cuenta.id, 0);
  }

  function registrar(
    entidad: MovimientoTesoreria['entidad'],
    entidadId: string,
    cuentaId: string,
    referencia: string,
    fecha: string,
    monto: number,
    moneda: string,
    signo: 1 | -1,
  ): void {
    const cuenta = cuentaPorId.get(cuentaId);
    if (!cuenta || moneda !== cuenta.moneda) return;
    movimientos.push({
      entidad,
      entidadId,
      cuentaId,
      cuentaEtiqueta: etiquetaCuenta(cuenta),
      referencia,
      fecha,
      monto: redondear(monto),
      moneda: cuenta.moneda,
      signo,
      conciliadoEn: conciliadoPorEntidad.get(`${entidad}:${entidadId}`) ?? null,
    });
    acumuladoPorCuenta.set(cuentaId, (acumuladoPorCuenta.get(cuentaId) ?? 0) + signo * monto);
  }

  for (const cobro of cobrosResp.data ?? []) {
    // El motor de pagos valida que la cuenta comparta la moneda de pago.
    registrar('cobro', cobro.id, cobro.cuenta_bancaria_id as string, cobro.folio_recibo,
      cobro.creado_en, Number(cobro.monto_pagado), cobro.moneda_pago, 1);
  }

  for (const pago of pagosCompraResp.data ?? []) {
    const compra = compraPorId.get(pago.compra_id);
    registrar('pago_compra', pago.id, pago.cuenta_bancaria_id as string,
      compra?.folio ?? 'Pago a proveedor', pago.fecha_pago, Number(pago.monto),
      compra?.moneda ?? 'MXN', -1);
  }

  for (const gasto of gastosResp.data ?? []) {
    const cuenta = cuentaPorId.get(gasto.cuenta_bancaria_id as string);
    if (!cuenta) continue;
    let monto = Number(gasto.monto_total);
    if (gasto.moneda !== cuenta.moneda) {
      if (cuenta.moneda === 'MXN' && gasto.moneda === 'USD') {
        monto = monto * Number(gasto.tipo_cambio);
      } else {
        continue;
      }
    }
    registrar('gasto', gasto.id, cuenta.id, gasto.folio_sii ?? gasto.folio,
      gasto.fecha_gasto, monto, cuenta.moneda, -1);
  }

  const transferencias = transferResp.data ?? [];
  const transferenciaPorId = new Map(transferencias.map((movimiento) => [movimiento.id, movimiento]));
  for (const movimiento of transferencias) {
    const contraparte = movimiento.par_movimiento_id
      ? transferenciaPorId.get(movimiento.par_movimiento_id)
      : undefined;
    const cuentaContraparte = contraparte ? cuentaPorId.get(contraparte.cuenta_id) : undefined;
    const referencia = movimiento.referencia
      ?? (cuentaContraparte
        ? `Transferencia ${movimiento.tipo === 'TRANSFERENCIA_SALIDA' ? 'a' : 'de'} ${etiquetaCuenta(cuentaContraparte)}`
        : 'Transferencia interna');
    registrar('transferencia', movimiento.id, movimiento.cuenta_id, referencia,
      movimiento.creado_en, Number(movimiento.monto), movimiento.moneda,
      movimiento.tipo === 'TRANSFERENCIA_ENTRADA' ? 1 : -1);
  }

  const cuentas: CuentaTesoreria[] = cuentasCatalogo.map((cuenta) => {
    const movimientosCuenta = movimientos.filter((movimiento) => movimiento.cuentaId === cuenta.id);
    return {
      id: cuenta.id,
      etiqueta: etiquetaCuenta(cuenta),
      tipo: (cuenta.tipo === 'efectivo' ? 'efectivo' : 'banco') as 'banco' | 'efectivo',
      moneda: cuenta.moneda,
      activa: cuenta.activa,
      saldoInicial: saldoInicialPorCuenta.get(cuenta.id) ?? null,
      saldoActual: redondear((saldoInicialPorCuenta.get(cuenta.id) ?? 0) + (acumuladoPorCuenta.get(cuenta.id) ?? 0)),
      conciliados: movimientosCuenta.filter((movimiento) => movimiento.conciliadoEn !== null).length,
      movimientos: movimientosCuenta.length,
    };
  });

  movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return { cuentas, movimientos: movimientos.slice(0, limiteMovimientos) };
}
