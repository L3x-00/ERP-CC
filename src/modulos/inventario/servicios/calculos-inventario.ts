/**
 * Cálculos puros de inventario (sin BD). La atomicidad real de un movimiento
 * vive en la función Postgres `registrar_movimiento_inventario` (lock del
 * material); aquí están las fórmulas deterministas que esa función refleja y
 * que se prueban unitariamente.
 */

/** Convierte una cantidad en unidad de compra a unidad de control. */
export function convertirCompraAControl(
  cantidadCompra: number,
  factorConversion: number,
): number {
  return cantidadCompra * factorConversion;
}

/**
 * Costo por unidad de CONTROL derivado del costo por unidad de COMPRA.
 * (p. ej. costo por m² = costo por hoja / (m² por hoja)).
 */
export function costoControlDesdeCompra(
  costoCompra: number,
  factorConversion: number,
): number {
  if (factorConversion <= 0) {
    return 0;
  }
  return costoCompra / factorConversion;
}

/** Parámetros del Costo Promedio Ponderado (todo en unidad de control). */
export type ParametrosCPP = {
  stockActual: number;
  costoActual: number;
  cantidadEntrante: number;
  costoEntrante: number;
};

/**
 * Costo Promedio Ponderado tras una entrada:
 *   ((stock * costoActual) + (entrante * costoEntrante)) / (stock + entrante).
 * Si el total resultante es 0 (sin stock previo ni entrada), devuelve el costo
 * entrante. Función pura.
 */
export function calcularCostoPromedioPonderado(p: ParametrosCPP): number {
  const total = p.stockActual + p.cantidadEntrante;
  if (total <= 0) {
    return p.costoEntrante;
  }
  return (p.stockActual * p.costoActual + p.cantidadEntrante * p.costoEntrante) / total;
}

/**
 * ¿Hay stock suficiente para una salida? Función pura (guardia rápida y
 * testeable; la garantía atómica real la impone la función Postgres bajo lock).
 */
export function stockSuficiente(stockActual: number, cantidadSalida: number): boolean {
  return cantidadSalida <= stockActual;
}
