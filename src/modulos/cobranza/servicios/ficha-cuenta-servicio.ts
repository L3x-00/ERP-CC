import type { CuentaHistorial } from '@/modulos/cobranza/tipos/historial';

/**
 * AR-01: reconciliación de la ficha integral de una cuenta. Es un cálculo puro
 * sobre la lectura de la cuenta; la autoridad del saldo sigue siendo PostgreSQL.
 */

export const ETIQUETA_CONDICION_CUENTA: Readonly<Record<string, string>> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  credito: 'Crédito',
};

export interface ReconciliacionCuenta {
  base: number | null;
  iva: number | null;
  total: number;
  abonado: number;
  saldo: number;
  /** El desglose base+IVA coincide con el total (o no fue capturado). */
  desgloseCuadra: boolean;
  saldoCuadra: boolean;
  cobrable: boolean;
}

export function reconciliarCuenta(cuenta: CuentaHistorial): ReconciliacionCuenta {
  const total = cuenta.montoTotal;
  const abonado = Math.max(0, total - cuenta.saldoPendiente);
  const desgloseCuadra = cuenta.montoSubtotal === null || cuenta.montoIva === null
    ? true
    : Math.abs(cuenta.montoSubtotal + cuenta.montoIva - total) <= 0.01;
  return {
    base: cuenta.montoSubtotal,
    iva: cuenta.montoIva,
    total,
    abonado,
    saldo: cuenta.saldoPendiente,
    desgloseCuadra,
    saldoCuadra: cuenta.saldoPendiente >= 0 && cuenta.saldoPendiente <= total,
    cobrable: cuenta.cobrableDesde !== null,
  };
}

/** Condición legible para la ficha; `null` se declara "Por definir". */
export function etiquetaCondicionCuenta(condicion: string | null): string {
  if (!condicion) return 'Por definir';
  return ETIQUETA_CONDICION_CUENTA[condicion] ?? condicion.replaceAll('_', ' ');
}
