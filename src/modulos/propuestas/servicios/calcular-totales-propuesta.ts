import type { MonedaPropuesta, TotalesPropuesta } from '@/modulos/propuestas/tipos/indice';

/** Redondea a 2 decimales evitando el error de flotante (0.1 + 0.2). */
function redondear(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

/** Redondea el margen a 4 decimales (mismo criterio que el SQL espejo). */
function redondearMargen(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 10000) / 10000;
}

/** Ítem calculable: solo lo que afecta a los totales. */
export type ItemCalculablePropuesta = {
  cantidad: number;
  precioUnitario: number;
  esDescuento: boolean;
  activo: boolean;
};

/**
 * Totales de una revisión (SII-B4.5). Espejo exacto de
 * `public.calcular_totales_revision`:
 *
 * - `bruto` = Σ cantidad × precio de los ítems ACTIVOS que no son descuento;
 * - `descuento` = Σ cantidad × precio de los ítems ACTIVOS marcados descuento;
 * - `subtotal` = bruto − descuento (2 decimales);
 * - `iva` = subtotal × ivaPorcentaje / 100 (2 decimales); `total` = subtotal + IVA;
 * - costo = costo manual (`costoTotal` de entrada) − manual `maquina` si hay ruteo
 *   costeado + `costoRuteo` (C3.3: el ruteo costeado sustituye al manual de máquina);
 * - `margen` = (subtotal − costo) / subtotal (4 decimales); `null` si subtotal = 0.
 *
 * La misma tabla de casos se prueba en `tests/unitarias/propuestas-totales.test.ts`
 * y en `supabase/tests/sii_b4_propuestas.test.sql`.
 */
export function calcularTotalesPropuesta(entrada: {
  items: readonly ItemCalculablePropuesta[];
  /** Suma de todos los costos manuales de la revisión. */
  costoTotal: number;
  /** Parte manual de categoría `maquina` (se descuenta si hay ruteo costeado). */
  costoManualMaquina?: number;
  /** Costo del ruteo costeado; > 0 o renglones costeados activan la sustitución. */
  costoRuteo?: number;
  ruteoCosteado?: boolean;
  ivaPorcentaje: number;
  moneda: MonedaPropuesta;
}): TotalesPropuesta {
  const { items, costoTotal, ivaPorcentaje, moneda } = entrada;
  const costoRuteo = Number.isFinite(entrada.costoRuteo) ? (entrada.costoRuteo ?? 0) : 0;
  const maquinaExcluida = entrada.ruteoCosteado ? (entrada.costoManualMaquina ?? 0) : 0;
  const activos = items.filter((item) => item.activo);

  const bruto = activos.reduce(
    (suma, item) => suma + (item.esDescuento ? 0 : item.cantidad * item.precioUnitario),
    0,
  );
  const descuento = activos.reduce(
    (suma, item) => suma + (item.esDescuento ? item.cantidad * item.precioUnitario : 0),
    0,
  );

  const subtotal = redondear(bruto - descuento);
  const iva = redondear(subtotal * (ivaPorcentaje / 100));
  const total = redondear(subtotal + iva);
  const costoManual = (Number.isFinite(costoTotal) ? costoTotal : 0) - maquinaExcluida;
  const costo = costoManual + costoRuteo;
  const margen = subtotal === 0 ? null : redondearMargen((subtotal - costo) / subtotal);

  return {
    bruto: redondear(bruto),
    descuento: redondear(descuento),
    subtotal,
    ivaPorcentaje,
    iva,
    total,
    costoManual: redondearMargen(costoManual),
    costoRuteo: redondearMargen(costoRuteo),
    costoTotal: costo,
    margen,
    moneda,
  };
}
