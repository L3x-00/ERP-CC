/** Entidades de movimiento en tesorería (F5). */
export const ENTIDADES_TESORERIA = ['cobro', 'pago_compra', 'gasto', 'transferencia'] as const;

export type EntidadTesoreria = (typeof ENTIDADES_TESORERIA)[number];

export type CuentaTesoreria = {
  id: string;
  etiqueta: string;
  tipo: 'banco' | 'efectivo';
  moneda: string;
  activa: boolean;
  saldoInicial: number | null;
  /** Saldo calculado en la moneda de la cuenta. */
  saldoActual: number;
  conciliados: number;
  movimientos: number;
};

export type MovimientoTesoreria = {
  entidad: EntidadTesoreria;
  entidadId: string;
  cuentaId: string;
  cuentaEtiqueta: string;
  referencia: string;
  fecha: string;
  monto: number;
  moneda: string;
  signo: 1 | -1;
  conciliadoEn: string | null;
};

export type DatosTesoreria = {
  cuentas: CuentaTesoreria[];
  movimientos: MovimientoTesoreria[];
};

export const ETIQUETA_ENTIDAD_TESORERIA: Record<EntidadTesoreria, string> = {
  cobro: 'Cobro',
  pago_compra: 'Pago a proveedor',
  gasto: 'Gasto pagado',
  transferencia: 'Transferencia',
};
