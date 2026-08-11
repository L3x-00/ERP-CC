/**
 * Cálculos puros de costo y merma para órdenes de producción (sin BD).
 * El CPP no se reimplementa aquí: se delega en la fórmula única de Inventario
 * para que una entrada de material consumida por una orden valúe igual que
 * cualquier otra entrada del almacén.
 */

import {
  calcularCostoPromedioPonderado,
  type ParametrosCPP,
} from '@/modulos/inventario/servicios/calculos-inventario';

/** Entrada de material asociada a una orden, en unidad de control. */
export type EntradaMaterialOrden = {
  stockActual: number;
  costoActual: number;
  cantidadEntrante: number;
  costoEntrante: number;
};

/**
 * CPP resultante tras registrar una entrada de material vinculada a una orden.
 * Punto de reuso explícito de la fórmula de Inventario.
 */
export function calcularCppEntradaMaterialOrden(entrada: EntradaMaterialOrden): number {
  const parametros: ParametrosCPP = {
    stockActual: entrada.stockActual,
    costoActual: entrada.costoActual,
    cantidadEntrante: entrada.cantidadEntrante,
    costoEntrante: entrada.costoEntrante,
  };
  return calcularCostoPromedioPonderado(parametros);
}

/** Consumo puntual de material en una orden. */
export type RegistroConsumoMaterial = {
  cantidadUsada: number;
  scrap: number;
};

/** Merma agregada de una orden. */
export type MermaAcumulada = {
  cantidadUsada: number;
  scrap: number;
  total: number;
  porcentaje: number;
};

/**
 * Suma los consumos de una orden. `porcentaje` es la proporción de scrap sobre
 * el total consumido; sin total (lista vacía o todo en cero) es 0, no NaN.
 */
export function calcularMermaAcumulada(
  registros: readonly RegistroConsumoMaterial[],
): MermaAcumulada {
  let cantidadUsada = 0;
  let scrap = 0;

  for (const registro of registros) {
    cantidadUsada += registro.cantidadUsada;
    scrap += registro.scrap;
  }

  const total = cantidadUsada + scrap;
  const porcentaje = total === 0 ? 0 : (scrap / total) * 100;

  return { cantidadUsada, scrap, total, porcentaje };
}

/**
 * Costo real de material: todo lo que salió del almacén (usado + scrap) al
 * costo unitario vigente. El scrap se cobra a la orden, no se descuenta.
 */
export function calcularCostoRealMaterial(
  cantidadUsada: number,
  scrap: number,
  costoUnitario: number,
): number {
  return (cantidadUsada + scrap) * costoUnitario;
}

/** Desviación de costo de una orden frente a su estimado. */
export type DesviacionCosto = {
  monto: number;
  porcentaje: number | null;
};

/**
 * Desviación real vs estimado. `monto` positivo = sobrecosto.
 * `porcentaje` es null si el estimado es 0 (no hay base contra la cual comparar).
 */
export function calcularDesviacionCosto(
  costoEstimado: number,
  costoReal: number,
): DesviacionCosto {
  const monto = costoReal - costoEstimado;
  const porcentaje = costoEstimado === 0 ? null : (monto / costoEstimado) * 100;
  return { monto, porcentaje };
}
