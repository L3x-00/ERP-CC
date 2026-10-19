/** Entidades de movimiento en tesorería (F5 + C10.3). */
export const ENTIDADES_TESORERIA = ['cobro', 'reverso_cobro', 'pago_compra', 'gasto', 'transferencia'] as const;

/** C10.3: un reverso es un contra-registro, no se concilia contra el banco. */
export const ENTIDADES_CONCILIABLES_TESORERIA = ['cobro', 'pago_compra', 'gasto', 'transferencia'] as const;

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
  /** C10.3/F-14: el cobro original se conserva y se marca; su reverso va aparte. */
  reversado?: boolean;
};

export type DatosTesoreria = {
  cuentas: CuentaTesoreria[];
  movimientos: MovimientoTesoreria[];
};

export const ETIQUETA_ENTIDAD_TESORERIA: Record<EntidadTesoreria, string> = {
  cobro: 'Cobro',
  reverso_cobro: 'Reverso de cobro',
  pago_compra: 'Pago a proveedor',
  gasto: 'Gasto pagado',
  transferencia: 'Transferencia',
};
