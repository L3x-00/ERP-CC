import { UTILIDAD_OBJETIVO_PROPUESTA_DEFECTO } from '@/modulos/configuracion/tipos/indice';
import type {
  CategoriaCosto,
  MonedaPropuesta,
  TotalesPropuesta,
} from '@/modulos/propuestas/tipos/indice';

/** Redondea a 2 decimales evitando el error de flotante (0.1 + 0.2). */
function redondear(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

/** Redondea a 4 decimales (costos y fracciones de utilidad; mismo criterio que el SQL espejo). */
function redondearFraccion(cantidad: number): number {
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
 * Costos de una revisión en la forma que consume `calcularTotalesPropuesta`.
 * Una sola fuente para Ítems, Ruteo/Costeo y Resumen: si cada pestaña armara su
 * costo por su cuenta, la utilidad diferiría entre ellas.
 *
 * @param idsItemsActivos Ítems activos de la revisión (solo su ruteo cuenta).
 * @param costos Costos manuales de ESTA revisión.
 * @param ruteo Filas de ruteo (se filtran por `idsItemsActivos` y por estar costeadas).
 */
export function resumirCostosRevision(entrada: {
  idsItemsActivos: ReadonlySet<string>;
  costos: readonly { categoria: CategoriaCosto; monto: number }[];
  ruteo: readonly { itemId: string; costeadoEn: string | null; costoTotal: number | null }[];
}): {
  costoTotal: number;
  costoManualMaquina: number;
  costoRuteo: number;
  ruteoCosteado: boolean;
} {
  const costeado = entrada.ruteo.filter(
    (fila) => entrada.idsItemsActivos.has(fila.itemId) && fila.costeadoEn !== null,
  );
  return {
    costoTotal: entrada.costos.reduce((suma, costo) => suma + costo.monto, 0),
    costoManualMaquina: entrada.costos
      .filter((costo) => costo.categoria === 'maquina')
      .reduce((suma, costo) => suma + costo.monto, 0),
    costoRuteo: costeado.reduce((suma, fila) => suma + (fila.costoTotal ?? 0), 0),
    ruteoCosteado: costeado.length > 0,
  };
}

type UtilidadSobreCosto = Pick<
  TotalesPropuesta,
  | 'utilidadImporte'
  | 'utilidadPorcentaje'
  | 'utilidadObjetivoPorcentaje'
  | 'precioMinimoRecomendado'
  | 'bajoObjetivo'
>;

/**
 * Utilidad estimada sobre costo de una venta sin IVA. Un objetivo inválido
 * (NaN, negativo) cae al de configuración por defecto.
 */
export function calcularUtilidadSobreCosto(entrada: {
  subtotal: number;
  costo: number;
  utilidadObjetivoPorcentaje?: number;
}): UtilidadSobreCosto {
  const { subtotal, costo } = entrada;
  const objetivo =
    entrada.utilidadObjetivoPorcentaje !== undefined
    && Number.isFinite(entrada.utilidadObjetivoPorcentaje)
    && entrada.utilidadObjetivoPorcentaje >= 0
      ? entrada.utilidadObjetivoPorcentaje
      : UTILIDAD_OBJETIVO_PROPUESTA_DEFECTO;
  const hayCosto = costo > 0;
  const precioMinimoRecomendado = hayCosto ? redondear(costo * (1 + objetivo / 100)) : null;
  return {
    utilidadImporte: redondear(subtotal - costo),
    utilidadPorcentaje: hayCosto ? redondearFraccion((subtotal - costo) / costo) : null,
    utilidadObjetivoPorcentaje: objetivo,
    precioMinimoRecomendado,
    bajoObjetivo: precioMinimoRecomendado !== null && subtotal < precioMinimoRecomendado,
  };
}

/**
 * Totales de una revisión (SII-B4.5). Subtotal, IVA, total y costo son espejo de
 * `public.calcular_totales_revision`:
 *
 * - `bruto` = Σ cantidad × precio de los ítems ACTIVOS que no son descuento;
 * - `descuento` = Σ cantidad × precio de los ítems ACTIVOS marcados descuento;
 * - `subtotal` = bruto − descuento (2 decimales);
 * - `iva` = subtotal × ivaPorcentaje / 100 (2 decimales); `total` = subtotal + IVA;
 * - costo = costo manual (`costoTotal` de entrada) − manual `maquina` si hay ruteo
 *   costeado + `costoRuteo` (C3.3: el ruteo costeado sustituye al manual de máquina).
 *
 * Utilidad estimada sobre costo (solo TS; el IVA no interviene):
 *
 * - `utilidadImporte` = subtotal − costo (2 decimales);
 * - `utilidadPorcentaje` = utilidadImporte / costo (4 decimales); `null` sin costo;
 * - `precioMinimoRecomendado` = costo × (1 + objetivo / 100); `null` sin costo;
 * - `bajoObjetivo` = el subtotal queda debajo del precio mínimo (alerta, no bloqueo).
 *
 * El objetivo (% sobre costo) es configurable: llega por `utilidadObjetivoPorcentaje`.
 * Subtotal/IVA/total se prueban en `tests/unitarias/propuestas-totales.test.ts` y en
 * `supabase/tests/sii_b4_propuestas.test.sql`.
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
  /** Objetivo de utilidad en % sobre costo; por defecto el de configuración (30). */
  utilidadObjetivoPorcentaje?: number;
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

  return {
    bruto: redondear(bruto),
    descuento: redondear(descuento),
    subtotal,
    ivaPorcentaje,
    iva,
    total,
    costoManual: redondearFraccion(costoManual),
    costoRuteo: redondearFraccion(costoRuteo),
    costoTotal: costo,
    ...calcularUtilidadSobreCosto({
      subtotal,
      costo,
      ...(entrada.utilidadObjetivoPorcentaje !== undefined
        ? { utilidadObjetivoPorcentaje: entrada.utilidadObjetivoPorcentaje }
        : {}),
    }),
    moneda,
  };
}
