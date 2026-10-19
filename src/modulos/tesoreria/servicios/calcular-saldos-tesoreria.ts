import type {
  CuentaTesoreria,
  DatosTesoreria,
  MovimientoTesoreria,
} from '@/modulos/tesoreria/tipos/indice';

export type CuentaCalculo = {
  id: string;
  etiqueta: string;
  tipo: 'banco' | 'efectivo';
  moneda: string;
  activa: boolean;
  saldoInicial: number | null;
};

export type CobroCalculo = {
  id: string;
  cuentaId: string;
  folio: string;
  fecha: string;
  monto: number;
  moneda: string;
  reversado: boolean;
  reversoId: string | null;
  reversoFecha: string | null;
};

export type PagoCompraCalculo = {
  id: string;
  cuentaId: string;
  referencia: string;
  fecha: string;
  monto: number;
  moneda: string;
};

export type GastoCalculo = {
  id: string;
  cuentaId: string;
  referencia: string;
  fecha: string;
  monto: number;
  moneda: string;
  tipoCambio: number;
};

export type TransferenciaCalculo = {
  id: string;
  cuentaId: string;
  referencia: string;
  fecha: string;
  monto: number;
  moneda: string;
  signo: 1 | -1;
};

export type EntradaSaldosTesoreria = {
  cuentas: readonly CuentaCalculo[];
  cobros: readonly CobroCalculo[];
  pagosCompra: readonly PagoCompraCalculo[];
  gastos: readonly GastoCalculo[];
  transferencias: readonly TransferenciaCalculo[];
  conciliadoPorEntidad: ReadonlyMap<string, string>;
};

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * C10.3/F-16: acumula saldos y movimientos de Tesorería sin base de datos.
 * Un cobro reversado se muestra dos veces: el cobro original (marcado) y su
 * reverso con signo negativo; el neto es cero y nunca se borra el original.
 */
export function calcularSaldosTesoreria(entrada: EntradaSaldosTesoreria): DatosTesoreria {
  const cuentaPorId = new Map(entrada.cuentas.map((cuenta) => [cuenta.id, cuenta]));
  const movimientos: MovimientoTesoreria[] = [];
  const acumuladoPorCuenta = new Map<string, number>();
  for (const cuenta of entrada.cuentas) acumuladoPorCuenta.set(cuenta.id, 0);

  function registrar(
    entidad: MovimientoTesoreria['entidad'],
    entidadId: string,
    cuentaId: string,
    referencia: string,
    fecha: string,
    monto: number,
    moneda: string,
    signo: 1 | -1,
    reversado = false,
  ): void {
    const cuenta = cuentaPorId.get(cuentaId);
    if (!cuenta || moneda !== cuenta.moneda) return;
    movimientos.push({
      entidad,
      entidadId,
      cuentaId,
      cuentaEtiqueta: cuenta.etiqueta,
      referencia,
      fecha,
      monto: redondear(monto),
      moneda: cuenta.moneda,
      signo,
      conciliadoEn: conciliadoDe(entidad, entidadId),
      reversado,
    });
    acumuladoPorCuenta.set(
      cuentaId,
      (acumuladoPorCuenta.get(cuentaId) ?? 0) + signo * monto,
    );
  }

  function conciliadoDe(entidad: string, entidadId: string): string | null {
    return entrada.conciliadoPorEntidad.get(`${entidad}:${entidadId}`) ?? null;
  }

  for (const cobro of entrada.cobros) {
    registrar('cobro', cobro.id, cobro.cuentaId, cobro.folio, cobro.fecha,
      cobro.monto, cobro.moneda, 1, cobro.reversado);
    if (cobro.reversado && cobro.reversoId && cobro.reversoFecha) {
      registrar('reverso_cobro', cobro.reversoId, cobro.cuentaId,
        `Reverso de ${cobro.folio}`, cobro.reversoFecha, cobro.monto, cobro.moneda, -1);
    }
  }

  for (const pago of entrada.pagosCompra) {
    registrar('pago_compra', pago.id, pago.cuentaId, pago.referencia, pago.fecha,
      pago.monto, pago.moneda, -1);
  }

  for (const gasto of entrada.gastos) {
    const cuenta = cuentaPorId.get(gasto.cuentaId);
    if (!cuenta) continue;
    let monto = gasto.monto;
    if (gasto.moneda !== cuenta.moneda) {
      if (cuenta.moneda === 'MXN' && gasto.moneda === 'USD') {
        monto *= gasto.tipoCambio;
      } else {
        continue;
      }
    }
    registrar('gasto', gasto.id, cuenta.id, gasto.referencia, gasto.fecha,
      monto, cuenta.moneda, -1);
  }

  for (const transferencia of entrada.transferencias) {
    registrar('transferencia', transferencia.id, transferencia.cuentaId,
      transferencia.referencia, transferencia.fecha, transferencia.monto,
      transferencia.moneda, transferencia.signo);
  }

  const cuentas: CuentaTesoreria[] = entrada.cuentas.map((cuenta) => {
    const movimientosCuenta = movimientos.filter((movimiento) => movimiento.cuentaId === cuenta.id);
    return {
      id: cuenta.id,
      etiqueta: cuenta.etiqueta,
      tipo: cuenta.tipo,
      moneda: cuenta.moneda,
      activa: cuenta.activa,
      saldoInicial: cuenta.saldoInicial,
      saldoActual: redondear((cuenta.saldoInicial ?? 0) + (acumuladoPorCuenta.get(cuenta.id) ?? 0)),
      conciliados: movimientosCuenta.filter((movimiento) => movimiento.conciliadoEn !== null).length,
      movimientos: movimientosCuenta.length,
    };
  });

  movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return { cuentas, movimientos };
}
