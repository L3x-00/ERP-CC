import type { Tables } from '@/compartido/tipos/supabase';

/**
 * Contratos de dominio de Cobranza — Fase 8.1/8.2.
 *
 * Reglas de moneda (contrato de las migraciones 20260814143339/…143341):
 * - Los importes de una cuenta AR viven en la moneda de la cuenta (`moneda`).
 * - `tipoCambioOrigen`/`tipoCambioPago` son MXN por UNA unidad de esa moneda
 *   (USD=18.50 significa 1 USD = 18.50 MXN).
 * - El monedero `saldo_a_favor` del cliente y todos sus movimientos se expresan
 *   exclusivamente en MXN.
 */

export const MONEDAS_COBRANZA = ['USD', 'MXN'] as const;

export const ESTADOS_CUENTA_POR_COBRAR = [
  'pendiente',
  'parcial',
  'pagado',
  'cancelado',
] as const;

export const METODOS_PAGO_AR = [
  'transferencia',
  'efectivo',
  'cheque',
  'tarjeta',
  'saldo_a_favor',
] as const;

export const TIPOS_MOVIMIENTO_SALDO_FAVOR = [
  'credito_sobrepago',
  'aplicacion_pago',
  'ajuste_manual',
] as const;

export type MonedaCobranza = (typeof MONEDAS_COBRANZA)[number];
export type EstadoCuentaPorCobrar = (typeof ESTADOS_CUENTA_POR_COBRAR)[number];
export type MetodoPagoAR = (typeof METODOS_PAGO_AR)[number];
export type TipoMovimientoSaldoFavor = (typeof TIPOS_MOVIMIENTO_SALDO_FAVOR)[number];

/** El monedero solo admite MXN; se declara como unión para reforzar el contrato. */
export type MonedaSaldoFavor = 'MXN';

/**
 * Cuenta por cobrar. `montoTotal`, `saldoPendiente` y sus derivados están en
 * `moneda`; `tipoCambioOrigen` es MXN por unidad de esa moneda.
 */
export interface CuentaPorCobrar {
  id: string;
  ordenId: string;
  clienteId: string;
  folioFacturaRemision: string | null;
  montoTotal: number;
  saldoPendiente: number;
  moneda: MonedaCobranza;
  tipoCambioOrigen: number;
  estado: EstadoCuentaPorCobrar;
  fechaEmision: string;
  fechaVencimiento: string;
  creadoEn: string;
  actualizadoEn: string;
}

/**
 * Recibo del libro mayor de pagos. Los importes de entrada (`montoPagado`,
 * `tipoCambioPago`) están en `monedaPago`; los aplicados (`montoAplicadoAr`,
 * `montoSobrepagoAr`) los recalcula PostgreSQL en la moneda de la cuenta.
 */
export interface PagoAR {
  id: string;
  arId: string;
  folioRecibo: string;
  solicitudId: string;
  montoPagado: number;
  monedaPago: MonedaCobranza;
  tipoCambioPago: number;
  montoAplicadoAr: number;
  montoSobrepagoAr: number;
  metodoPago: MetodoPagoAR;
  referenciaBancaria: string | null;
  cuentaBancariaId: string | null;
  notas: string | null;
  creadoPor: string;
  creadoEn: string;
}

/** Movimiento del monedero MXN: positivo acredita, negativo aplica. */
export interface MovimientoSaldoFavor {
  id: string;
  clienteId: string;
  arIdOrigen: string | null;
  pagoArId: string | null;
  monto: number;
  moneda: MonedaSaldoFavor;
  tipo: TipoMovimientoSaldoFavor;
  descripcion: string;
  creadoPor: string;
  creadoEn: string;
}

/** Antigüedad de saldos de un cliente, expresada siempre en MXN. */
export interface ResumenAgingCliente {
  clienteId: string;
  moneda: MonedaSaldoFavor;
  alCorriente: number;
  de1A30Dias: number;
  de31A60Dias: number;
  de61A90Dias: number;
  masDe90Dias: number;
  totalPendiente: number;
  cuentasConsideradas: number;
}

/** Filas crudas snake_case derivadas de los tipos generados de Supabase. */
export type FilaCuentaPorCobrar = Tables<'cuentas_por_cobrar'>;
export type FilaPagoAR = Tables<'pagos_ar'>;
export type FilaMovimientoSaldoFavor = Tables<'movimientos_saldo_favor'>;

/**
 * Las columnas de enumeración viajan como `text`: un valor fuera del contrato debe
 * romper el mapeo en vez de propagarse como estado inválido hacia el dominio.
 */
function validarValorEnumerado<T extends string>(
  valor: string,
  valores: readonly T[],
  campo: string,
): T {
  if (!valores.includes(valor as T)) {
    throw new Error(`Valor inválido en ${campo}: ${valor}`);
  }

  return valor as T;
}

export function filaACuentaPorCobrar(fila: FilaCuentaPorCobrar): CuentaPorCobrar {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    clienteId: fila.cliente_id,
    folioFacturaRemision: fila.folio_factura_remision,
    montoTotal: Number(fila.monto_total),
    saldoPendiente: Number(fila.saldo_pendiente),
    moneda: validarValorEnumerado(fila.moneda, MONEDAS_COBRANZA, 'moneda'),
    tipoCambioOrigen: Number(fila.tipo_cambio_origen),
    estado: validarValorEnumerado(fila.estado, ESTADOS_CUENTA_POR_COBRAR, 'estado'),
    fechaEmision: fila.fecha_emision,
    fechaVencimiento: fila.fecha_vencimiento,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaAPagoAR(fila: FilaPagoAR): PagoAR {
  return {
    id: fila.id,
    arId: fila.ar_id,
    folioRecibo: fila.folio_recibo,
    solicitudId: fila.solicitud_id,
    montoPagado: Number(fila.monto_pagado),
    monedaPago: validarValorEnumerado(fila.moneda_pago, MONEDAS_COBRANZA, 'moneda de pago'),
    tipoCambioPago: Number(fila.tipo_cambio_pago),
    montoAplicadoAr: Number(fila.monto_aplicado_ar),
    montoSobrepagoAr: Number(fila.monto_sobrepago_ar),
    metodoPago: validarValorEnumerado(fila.metodo_pago, METODOS_PAGO_AR, 'método de pago'),
    referenciaBancaria: fila.referencia_bancaria,
    cuentaBancariaId: fila.cuenta_bancaria_id,
    notas: fila.notas,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}

export function filaAMovimientoSaldoFavor(
  fila: FilaMovimientoSaldoFavor,
): MovimientoSaldoFavor {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    arIdOrigen: fila.ar_id_origen,
    pagoArId: fila.pago_ar_id,
    monto: Number(fila.monto),
    moneda: validarValorEnumerado(fila.moneda, ['MXN'] as const, 'moneda de movimiento'),
    tipo: validarValorEnumerado(fila.tipo, TIPOS_MOVIMIENTO_SALDO_FAVOR, 'tipo de movimiento'),
    descripcion: fila.descripcion,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}
