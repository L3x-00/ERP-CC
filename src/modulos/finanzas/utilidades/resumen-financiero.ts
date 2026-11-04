import type { ColaCompras } from '@/modulos/compras/servicios/obtener-compras';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import type { ResumenCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Convierte a MXN con el tipo de cambio ya congelado en el registro. */
export function aMxn(monto: number, moneda: string, tipoCambio: number): number {
  if (!Number.isFinite(monto)) return 0;
  if (moneda !== 'USD') return redondear(monto);
  return redondear(monto * (Number.isFinite(tipoCambio) && tipoCambio > 0 ? tipoCambio : 1));
}

export interface ResumenEgresos {
  /** Compras con saldo + gastos pendientes, en MXN. */
  porPagarMxn: number;
  comprasTotalMxn: number;
  comprasPendientes: number;
  gastosTotalMxn: number;
  gastosPendientes: number;
}

/** Totales de la vista unificada de egresos. */
export function calcularResumenEgresos(
  gastos: readonly Gasto[],
  compras: ColaCompras,
): ResumenEgresos {
  const comprasVivas = compras.compras.filter((compra) => compra.estado !== 'CANCELADA');
  const gastosVivos = gastos.filter((gasto) => gasto.estadoPago !== 'cancelado');

  const comprasTotalMxn = comprasVivas.reduce(
    (total, compra) => total + aMxn(compra.montoTotal, compra.moneda, compra.tipoCambio),
    0,
  );
  const gastosTotalMxn = gastosVivos.reduce(
    (total, gasto) => total + aMxn(gasto.montoTotal, gasto.moneda, gasto.tipoCambio),
    0,
  );
  const porPagarCompras = comprasVivas.reduce(
    (total, compra) => total + aMxn(compra.saldoPendiente, compra.moneda, compra.tipoCambio),
    0,
  );
  const porPagarGastos = gastosVivos
    .filter((gasto) => gasto.estadoPago === 'pendiente')
    .reduce((total, gasto) => total + aMxn(gasto.montoTotal, gasto.moneda, gasto.tipoCambio), 0);

  return {
    porPagarMxn: redondear(porPagarCompras + porPagarGastos),
    comprasTotalMxn: redondear(comprasTotalMxn),
    comprasPendientes: comprasVivas.filter((compra) => compra.saldoPendiente > 0).length,
    gastosTotalMxn: redondear(gastosTotalMxn),
    gastosPendientes: gastosVivos.filter((gasto) => gasto.estadoPago === 'pendiente').length,
  };
}

export interface ResumenCobros {
  carteraMxn: number;
  cuentasAbiertas: number;
  saldoCuentasMxn: number;
  cuentasBancarias: number;
}

/** Totales de la vista unificada de cobros y tesorería. */
export function calcularResumenCobros(
  cartera: ResumenCartera,
  tesoreria: DatosTesoreria,
): ResumenCobros {
  const saldoCuentasMxn = tesoreria.cuentas
    .filter((cuenta) => cuenta.moneda !== 'USD')
    .reduce((total, cuenta) => total + cuenta.saldoActual, 0);
  return {
    carteraMxn: redondear(cartera.totalPendienteMxn),
    cuentasAbiertas: cartera.cuentas.filter(
      (cuenta) => cuenta.estado === 'pendiente' || cuenta.estado === 'parcial',
    ).length,
    saldoCuentasMxn: redondear(saldoCuentasMxn),
    cuentasBancarias: tesoreria.cuentas.length,
  };
}
