import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  calcularSaldosTesoreria,
  type CobroCalculo,
  type CuentaCalculo,
  type GastoCalculo,
  type PagoCompraCalculo,
  type TransferenciaCalculo,
} from '@/modulos/tesoreria/servicios/calcular-saldos-tesoreria';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

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
 * SII-B8 F5 + C10.3: lee las fuentes y delega el acumulado en una función pura.
 * Los cobros reversados se conservan como movimiento original marcado y su
 * reverso negativo; el neto es cero. Los gastos en moneda distinta a la cuenta
 * solo se convierten cuando la cuenta es MXN (con el TC del gasto).
 */
export async function obtenerTesoreria(
  cliente: SupabaseClient<Database>,
  limiteMovimientos = 300,
): Promise<DatosTesoreria> {
  const [
    cuentasResp,
    saldosResp,
    cobrosResp,
    reversosResp,
    pagosCompraResp,
    gastosResp,
    transferResp,
    conciliacionesResp,
  ] = await Promise.all([
    cliente
      .from('cuentas_bancarias')
      .select('id, banco, numero_cuenta, moneda, activa, tipo')
      .order('banco', { ascending: true }),
    cliente.from('saldos_iniciales_tesoreria').select('cuenta_id, monto, moneda, tipo_cambio'),
    cliente
      .from('pagos_ar')
      .select('id, cuenta_bancaria_id, folio_recibo, monto_pagado, moneda_pago, creado_en')
      .not('cuenta_bancaria_id', 'is', null),
    cliente.from('reversos_pago_ar').select('id, pago_id, creado_en'),
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
  if (cobrosResp.error) throw new Error('No se pudieron cargar los cobros de tesorería');
  if (reversosResp.error) throw new Error('No se pudieron cargar los reversos de cobros');
  if (pagosCompraResp.error) throw new Error('No se pudieron cargar los pagos a proveedores');
  if (gastosResp.error) throw new Error('No se pudieron cargar los gastos pagados');
  if (transferResp.error) throw new Error('No se pudieron cargar las transferencias');

  const cuentasCatalogo = cuentasResp.data ?? [];
  const saldoInicialPorCuenta = new Map(
    (saldosResp.data ?? []).map((saldo) => [saldo.cuenta_id, Number(saldo.monto)]),
  );
  const cuentaPorId = new Map(cuentasCatalogo.map((cuenta) => [cuenta.id, cuenta]));
  const reversoPorPago = new Map(
    (reversosResp.data ?? []).map((reverso) => [reverso.pago_id, reverso]),
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

  const cuentas: CuentaCalculo[] = cuentasCatalogo.map((cuenta) => ({
    id: cuenta.id,
    etiqueta: etiquetaCuenta(cuenta),
    tipo: cuenta.tipo === 'efectivo' ? 'efectivo' : 'banco',
    moneda: cuenta.moneda,
    activa: cuenta.activa,
    saldoInicial: saldoInicialPorCuenta.get(cuenta.id) ?? null,
  }));

  const cobros: CobroCalculo[] = (cobrosResp.data ?? []).map((cobro) => {
    const reverso = reversoPorPago.get(cobro.id);
    return {
      id: cobro.id,
      cuentaId: cobro.cuenta_bancaria_id as string,
      folio: cobro.folio_recibo,
      fecha: cobro.creado_en,
      monto: Number(cobro.monto_pagado),
      moneda: cobro.moneda_pago,
      reversado: Boolean(reverso),
      reversoId: reverso?.id ?? null,
      reversoFecha: reverso?.creado_en ?? null,
    };
  });

  const pagosCompra: PagoCompraCalculo[] = (pagosCompraResp.data ?? []).map((pago) => {
    const compra = compraPorId.get(pago.compra_id);
    return {
      id: pago.id,
      cuentaId: pago.cuenta_bancaria_id as string,
      referencia: compra?.folio ?? 'Pago a proveedor',
      fecha: pago.fecha_pago,
      monto: Number(pago.monto),
      moneda: compra?.moneda ?? 'MXN',
    };
  });

  const gastos: GastoCalculo[] = (gastosResp.data ?? []).map((gasto) => ({
    id: gasto.id,
    cuentaId: gasto.cuenta_bancaria_id as string,
    referencia: gasto.folio_sii ?? gasto.folio,
    fecha: gasto.fecha_gasto,
    monto: Number(gasto.monto_total),
    moneda: gasto.moneda,
    tipoCambio: Number(gasto.tipo_cambio),
  }));

  const transferencias = transferResp.data ?? [];
  const transferenciaPorId = new Map(transferencias.map((movimiento) => [movimiento.id, movimiento]));
  const transferenciasCalculo: TransferenciaCalculo[] = transferencias.map((movimiento) => {
    const contraparte = movimiento.par_movimiento_id
      ? transferenciaPorId.get(movimiento.par_movimiento_id)
      : undefined;
    const cuentaContraparte = contraparte ? cuentaPorId.get(contraparte.cuenta_id) : undefined;
    const referencia = movimiento.referencia
      ?? (cuentaContraparte
        ? `Transferencia ${movimiento.tipo === 'TRANSFERENCIA_SALIDA' ? 'a' : 'de'} ${etiquetaCuenta(cuentaContraparte)}`
        : 'Transferencia interna');
    return {
      id: movimiento.id,
      cuentaId: movimiento.cuenta_id,
      referencia,
      fecha: movimiento.creado_en,
      monto: Number(movimiento.monto),
      moneda: movimiento.moneda,
      signo: movimiento.tipo === 'TRANSFERENCIA_ENTRADA' ? 1 : -1,
    };
  });

  const conciliadoPorEntidad = new Map(
    (conciliacionesResp.data ?? []).map((conciliacion) => [
      `${conciliacion.entidad}:${conciliacion.entidad_id}`,
      conciliacion.conciliado_en,
    ]),
  );

  const datos = calcularSaldosTesoreria({
    cuentas,
    cobros,
    pagosCompra,
    gastos,
    transferencias: transferenciasCalculo,
    conciliadoPorEntidad,
  });

  return {
    cuentas: datos.cuentas,
    movimientos: datos.movimientos.slice(0, limiteMovimientos),
  };
}
