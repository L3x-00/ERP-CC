/** Resultado de evaluar la exposición de crédito de un cliente (RFQ-16). */
export type EvaluacionCredito = {
  excedeLimite: boolean;
  limiteMxn: number;
  utilizadoMxn: number;
  montoCotizadoMxn: number;
  excedenteMxn: number;
};

/**
 * Evalúa si aprobar una cotización excede el límite de crédito del cliente.
 *
 * Función pura (sin I/O): el crédito usado de la cartera (AR pendiente/parcial)
 * más el importe neto de la cotización (descuentos restados, en MXN) se compara
 * contra `limite_credito`. `limite <= 0` significa "sin límite definido" (así lo
 * trata la ficha del cliente) y no bloquea. El excedente es 0 cuando cabe.
 *
 * @param parametros Límite, crédito utilizado y monto cotizado, en MXN.
 */
export function evaluarCreditoCliente(parametros: {
  limiteCredito: number;
  creditoUtilizadoMxn: number;
  montoCotizadoMxn: number;
}): EvaluacionCredito {
  const limite = Number.isFinite(parametros.limiteCredito) ? parametros.limiteCredito : 0;
  const utilizado = Number.isFinite(parametros.creditoUtilizadoMxn)
    ? parametros.creditoUtilizadoMxn
    : 0;
  const monto = Number.isFinite(parametros.montoCotizadoMxn) ? parametros.montoCotizadoMxn : 0;

  if (limite <= 0) {
    return {
      excedeLimite: false,
      limiteMxn: limite,
      utilizadoMxn: utilizado,
      montoCotizadoMxn: monto,
      excedenteMxn: 0,
    };
  }

  const excedente = Math.round((utilizado + monto - limite) * 100) / 100;
  return {
    excedeLimite: excedente > 0,
    limiteMxn: limite,
    utilizadoMxn: utilizado,
    montoCotizadoMxn: monto,
    excedenteMxn: Math.max(0, excedente),
  };
}
