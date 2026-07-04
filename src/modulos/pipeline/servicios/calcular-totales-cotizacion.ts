import type {
  LineaCotizacionEntrada,
  MonedaPipeline,
  TotalesCotizacion,
} from '@/modulos/pipeline/tipos/indice';

/** Redondea a 2 decimales evitando el error de flotante (0.1 + 0.2). */
function redondear(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula subtotal, IVA y total de una cotización.
 *
 * Función pura (sin I/O): el importe de cada línea es `cantidad *
 * precioUnitario`; el subtotal es la suma; el IVA aplica `ivaPorcentaje`
 * (16 nacional, 8 frontera) sobre el subtotal; el total es subtotal + IVA.
 * Todos los montos se redondean a 2 decimales.
 *
 * @param lineas Líneas de la cotización.
 * @param ivaPorcentaje Porcentaje de IVA (ej. 16 u 8).
 * @param moneda Moneda de la cotización ('MXN' | 'USD').
 * @returns Totales redondeados a 2 decimales.
 */
export function calcularTotalesCotizacion(
  lineas: readonly LineaCotizacionEntrada[],
  ivaPorcentaje: number,
  moneda: MonedaPipeline,
): TotalesCotizacion {
  const subtotal = redondear(
    lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0),
  );
  const iva = redondear(subtotal * (ivaPorcentaje / 100));
  const total = redondear(subtotal + iva);

  return { subtotal, iva, ivaPorcentaje, total, moneda };
}
