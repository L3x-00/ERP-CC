import type { ResumenCredito } from '@/modulos/clientes/tipos/indice';

/** Parámetros para verificar el crédito de un cliente. */
export type ParametrosCredito = {
  /** Límite de crédito asignado (MXN, >= 0). */
  limite: number;
  /** Saldo a favor del cliente (anticipos/notas, MXN, >= 0). */
  saldoAFavor: number;
  /** Crédito ya usado = suma de AR pendientes. Origen real: Fase 8. */
  usado: number;
};

/**
 * Calcula el estado de crédito de un cliente. Función pura.
 *
 * Crédito disponible = límite + saldo a favor − usado. Se marca `excedido`
 * cuando el usado supera lo disponible (disponible < 0): en ese caso el sistema
 * bloquea nuevas órdenes hasta autorización de un admin (enforcement real en
 * Fase 5, al crear órdenes). Los negativos de entrada se sanean a 0.
 *
 * @param p Límite, saldo a favor y crédito usado.
 * @returns Resumen con disponible y bandera `excedido`.
 */
export function verificarCredito(p: ParametrosCredito): ResumenCredito {
  const limite = saneo(p.limite);
  const saldoAFavor = saneo(p.saldoAFavor);
  const usado = saneo(p.usado);

  const disponible = limite + saldoAFavor - usado;

  return {
    limite,
    saldoAFavor,
    usado,
    disponible,
    excedido: disponible < 0,
  };
}

/** Normaliza a número no negativo (NaN/negativos → 0). */
function saneo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}
