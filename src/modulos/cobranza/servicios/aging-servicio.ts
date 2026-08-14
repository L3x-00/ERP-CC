import type {
  CuentaPorCobrar,
  MonedaSaldoFavor,
  ResumenAgingCliente,
} from '@/modulos/cobranza/tipos/cobranza';

/**
 * Cálculos puros de Cobranza (Fase 8): conversión de importes entre monedas y
 * antigüedad de saldos (aging). No consultan la BD ni deciden concurrencia —
 * PostgreSQL es la única fuente de verdad para aplicar un pago o mover el
 * monedero. Estas funciones interpretan lo que la BD ya persistió para
 * presentarlo; son deterministas y nunca producen `NaN`/`Infinity`.
 *
 * Convención de moneda: los tipos de cambio son MXN por UNA unidad de la moneda
 * de origen. El aging se expresa siempre en MXN para poder sumar cuentas de
 * distintas monedas en un mismo cliente.
 */

const DECIMALES_MONTO = 4;
const MS_POR_DIA = 86_400_000;

/** El aging se agrega en MXN (denominador común del monedero del cliente). */
export const MONEDA_AGING: MonedaSaldoFavor = 'MXN';

export const BUCKETS_AGING = [
  'alCorriente',
  'de1A30Dias',
  'de31A60Dias',
  'de61A90Dias',
  'masDe90Dias',
] as const;

export type BucketAging = (typeof BUCKETS_AGING)[number];

/** Antigüedad de saldos de un cliente, expresada en MXN. */
export type { ResumenAgingCliente } from '@/modulos/cobranza/tipos/cobranza';

/** Entradas de una conversión de pago a la moneda de la cuenta AR. */
export interface EntradaConversionPago {
  montoPago: number;
  tipoCambioPago: number;
  tipoCambioOrigen: number;
}

function esPositivoFinito(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  const redondeado = Math.round(valor * factor) / factor;

  // `-0` rompe igualdad estructural en pruebas y en la UI.
  return redondeado === 0 ? 0 : redondeado;
}

/**
 * Convierte un pago a la moneda de la cuenta AR: `montoPago * tipoCambioPago /
 * tipoCambioOrigen`. Devuelve `null` si alguna entrada no es finita o positiva, o
 * si el resultado no es finito — nunca propaga `NaN`/`Infinity`. Es una
 * previsualización: el importe realmente aplicado lo recalcula PostgreSQL bajo
 * lock dentro de `registrar_pago_ar_atomico`.
 */
export function convertirPagoAMonedaCuenta(
  entrada: EntradaConversionPago,
): number | null {
  const { montoPago, tipoCambioPago, tipoCambioOrigen } = entrada;

  if (
    !esPositivoFinito(montoPago) ||
    !esPositivoFinito(tipoCambioPago) ||
    !esPositivoFinito(tipoCambioOrigen)
  ) {
    return null;
  }

  const equivalente = (montoPago * tipoCambioPago) / tipoCambioOrigen;

  if (!Number.isFinite(equivalente) || equivalente <= 0) {
    return null;
  }

  return redondear(equivalente, DECIMALES_MONTO);
}

/**
 * Convierte un importe a MXN usando `tipoCambio` (MXN por unidad de la moneda de
 * origen). Devuelve `null` ante entradas no finitas/no positivas para no falsear
 * los buckets con importes basura.
 */
export function convertirAMxn(monto: number, tipoCambio: number): number | null {
  if (!Number.isFinite(monto) || monto < 0 || !esPositivoFinito(tipoCambio)) {
    return null;
  }

  const mxn = monto * tipoCambio;

  if (!Number.isFinite(mxn) || mxn < 0) {
    return null;
  }

  return redondear(mxn, DECIMALES_MONTO);
}

/**
 * Días vencidos entre la fecha de vencimiento y la de referencia. Devuelve `null`
 * si cualquiera de las dos fechas no es válida — una fecha inválida no puede caer
 * en ningún bucket. Un valor <= 0 significa que la cuenta aún no vence.
 */
export function calcularDiasVencidos(
  fechaVencimiento: string,
  fechaReferencia: string,
): number | null {
  const vencimiento = Date.parse(fechaVencimiento);
  const referencia = Date.parse(fechaReferencia);

  if (!Number.isFinite(vencimiento) || !Number.isFinite(referencia)) {
    return null;
  }

  return Math.floor((referencia - vencimiento) / MS_POR_DIA);
}

/** Ubica los días vencidos en su bucket de antigüedad. */
export function clasificarBucketAging(diasVencidos: number): BucketAging {
  if (diasVencidos <= 0) {
    return 'alCorriente';
  }

  if (diasVencidos <= 30) {
    return 'de1A30Dias';
  }

  if (diasVencidos <= 60) {
    return 'de31A60Dias';
  }

  if (diasVencidos <= 90) {
    return 'de61A90Dias';
  }

  return 'masDe90Dias';
}

function resumenVacio(clienteId: string): ResumenAgingCliente {
  return {
    clienteId,
    moneda: MONEDA_AGING,
    alCorriente: 0,
    de1A30Dias: 0,
    de31A60Dias: 0,
    de61A90Dias: 0,
    masDe90Dias: 0,
    totalPendiente: 0,
    cuentasConsideradas: 0,
  };
}

/** Solo las cuentas con saldo vivo entran al aging; pagadas/canceladas no suman. */
function contribuyeAlAging(cuenta: CuentaPorCobrar): boolean {
  return cuenta.estado === 'pendiente' || cuenta.estado === 'parcial';
}

/**
 * Resume la antigüedad de saldos de un cliente en MXN. Solo considera las cuentas
 * cuyo `clienteId` coincide; ignora pagadas/canceladas, cuentas con importe o
 * tipo de cambio no convertibles y fechas de vencimiento inválidas. El resultado
 * es determinista y libre de `NaN`/`Infinity`.
 */
export function calcularAgingCliente(
  clienteId: string,
  cuentas: readonly CuentaPorCobrar[],
  fechaReferencia: string,
): ResumenAgingCliente {
  const resumen = cuentas.reduce<ResumenAgingCliente>((acumulado, cuenta) => {
    if (cuenta.clienteId !== clienteId || !contribuyeAlAging(cuenta)) {
      return acumulado;
    }

    const dias = calcularDiasVencidos(cuenta.fechaVencimiento, fechaReferencia);
    if (dias === null) {
      return acumulado;
    }

    const saldoMxn = convertirAMxn(cuenta.saldoPendiente, cuenta.tipoCambioOrigen);
    if (saldoMxn === null || saldoMxn === 0) {
      return acumulado;
    }

    const bucket = clasificarBucketAging(dias);

    return {
      ...acumulado,
      [bucket]: redondear(acumulado[bucket] + saldoMxn, DECIMALES_MONTO),
      totalPendiente: redondear(acumulado.totalPendiente + saldoMxn, DECIMALES_MONTO),
      cuentasConsideradas: acumulado.cuentasConsideradas + 1,
    };
  }, resumenVacio(clienteId));

  return resumen;
}

/**
 * Aging de una cartera completa, un resumen por cliente. El orden de salida es
 * estable (primera aparición de cada cliente) para que dos llamadas con los
 * mismos datos devuelvan siempre la misma lista.
 */
export function calcularAgingPorCliente(
  cuentas: readonly CuentaPorCobrar[],
  fechaReferencia: string,
): ResumenAgingCliente[] {
  const clientes: string[] = [];
  for (const cuenta of cuentas) {
    if (!clientes.includes(cuenta.clienteId)) {
      clientes.push(cuenta.clienteId);
    }
  }

  return clientes.map((clienteId) =>
    calcularAgingCliente(clienteId, cuentas, fechaReferencia),
  );
}
