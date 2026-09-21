import type {
  CalculoRentabilidadOrden,
  ComponenteRentabilidad,
  Gasto,
  MonedaGasto,
  MonedaRentabilidad,
} from '@/modulos/gastos/tipos/gastos';

const DECIMALES_MONTO = 4;
const DECIMALES_PORCENTAJE = 2;

export const MONEDA_RENTABILIDAD: MonedaRentabilidad = 'MXN';

export interface EntradaIngresoOrden {
  montoTotal: number;
  moneda: MonedaGasto;
  /** MXN por unidad de la moneda del ingreso. */
  tipoCambio: number;
  cancelada?: boolean;
}

export interface EntradaMaterialConsumido {
  cantidadUsada: number;
  cantidadScrap: number;
  costoUnitarioMomento: number;
}

export interface EntradaSesionRentabilidad {
  horasNetas: number;
  costoHoraInterno: number | null;
}

export interface EntradaRentabilidadOrden {
  ordenId: string;
  /** Folio para el encabezado; opcional en cálculos aislados. */
  folio?: string;
  /** Trabajo interno (TI): no exige venta; se informa su costo de producción. */
  esInterna?: boolean;
  ingreso: EntradaIngresoOrden | null;
  materiales: readonly EntradaMaterialConsumido[];
  sesiones: readonly EntradaSesionRentabilidad[];
  gastos: readonly Gasto[];
}

function esFinito(valor: number): boolean {
  return Number.isFinite(valor);
}

function esNoNegativoFinito(valor: number): boolean {
  return esFinito(valor) && valor >= 0;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  const escalado = valor * factor;
  return esFinito(escalado) ? Math.round(escalado) / factor : 0;
}

export function convertirAMxn(monto: number, tipoCambio: number): number | null {
  if (!esNoNegativoFinito(monto) || !esFinito(tipoCambio) || tipoCambio <= 0) return null;
  const convertido = monto * tipoCambio;
  return esFinito(convertido) ? redondear(convertido, DECIMALES_MONTO) : null;
}

export function calcularIngresoMxn(ingreso: EntradaIngresoOrden | null): number | null {
  if (!ingreso || ingreso.cancelada === true) return null;
  if (ingreso.moneda === 'MXN' && ingreso.tipoCambio !== 1) return null;
  return convertirAMxn(ingreso.montoTotal, ingreso.tipoCambio);
}

/** La merma es costo real: se valúan usadas y scrap al CPP histórico. */
export function calcularCostoMaterialesMxn(
  materiales: readonly EntradaMaterialConsumido[],
): { costo: number; considerados: number } {
  let costo = 0;
  let considerados = 0;
  for (const material of materiales) {
    if (
      !esNoNegativoFinito(material.cantidadUsada)
      || !esNoNegativoFinito(material.cantidadScrap)
      || !esNoNegativoFinito(material.costoUnitarioMomento)
    ) continue;
    const importe = (material.cantidadUsada + material.cantidadScrap)
      * material.costoUnitarioMomento;
    if (!esFinito(importe)) continue;
    costo += importe;
    considerados += 1;
  }
  return { costo: redondear(costo, DECIMALES_MONTO), considerados };
}

/** Horas netas por la tarifa que quedó congelada en cada sesión. */
export function calcularCostoManoObraMxn(
  sesiones: readonly EntradaSesionRentabilidad[],
): { costo: number; considerados: number; sinTarifa: number } {
  let costo = 0;
  let considerados = 0;
  let sinTarifa = 0;
  for (const sesion of sesiones) {
    if (!esNoNegativoFinito(sesion.horasNetas)) continue;
    if (sesion.costoHoraInterno === null) {
      sinTarifa += 1;
      continue;
    }
    if (!esNoNegativoFinito(sesion.costoHoraInterno)) {
      sinTarifa += 1;
      continue;
    }
    const importe = sesion.horasNetas * sesion.costoHoraInterno;
    if (!esFinito(importe)) continue;
    costo += importe;
    considerados += 1;
  }
  return { costo: redondear(costo, DECIMALES_MONTO), considerados, sinTarifa };
}

/** Suma únicamente gastos de la orden y estados distintos de cancelado. */
export function calcularCostoGastosDirectosMxn(
  gastos: readonly Gasto[],
  ordenId: string,
): { costo: number; considerados: number; excluidos: number } {
  let costo = 0;
  let considerados = 0;
  let excluidos = 0;
  for (const gasto of gastos) {
    if (gasto.ordenId !== ordenId || gasto.estadoPago === 'cancelado') {
      excluidos += 1;
      continue;
    }
    if (gasto.moneda === 'MXN' && gasto.tipoCambio !== 1) {
      excluidos += 1;
      continue;
    }
    const importe = convertirAMxn(gasto.montoTotal, gasto.tipoCambio);
    if (importe === null) {
      excluidos += 1;
      continue;
    }
    costo += importe;
    considerados += 1;
  }
  return { costo: redondear(costo, DECIMALES_MONTO), considerados, excluidos };
}

export function calcularMargenPorcentaje(utilidad: number, ingreso: number): number | null {
  if (!esFinito(utilidad) || !esFinito(ingreso) || ingreso <= 0) return null;
  const margen = utilidad / ingreso * 100;
  return esFinito(margen) ? redondear(margen, DECIMALES_PORCENTAJE) : null;
}

export function calcularRentabilidadOrden(
  entrada: EntradaRentabilidadOrden,
): CalculoRentabilidadOrden {
  const ingresoCalculado = calcularIngresoMxn(entrada.ingreso);
  const ingresoMxn = ingresoCalculado ?? 0;
  const materiales = calcularCostoMaterialesMxn(entrada.materiales);
  const manoObra = calcularCostoManoObraMxn(entrada.sesiones);
  const gastos = calcularCostoGastosDirectosMxn(entrada.gastos, entrada.ordenId);
  const costoTotalMxn = redondear(
    materiales.costo + manoObra.costo + gastos.costo,
    DECIMALES_MONTO,
  );
  const utilidadBrutaMxn = redondear(ingresoMxn - costoTotalMxn, DECIMALES_MONTO);
  const margenPorcentaje = calcularMargenPorcentaje(utilidadBrutaMxn, ingresoMxn);
  const componentesFaltantes: ComponenteRentabilidad[] = [];
  // Un TI no genera venta por diseño: no se reporta como dato faltante.
  if (!entrada.esInterna && ingresoCalculado === null) componentesFaltantes.push('ingreso');
  if (materiales.considerados === 0) componentesFaltantes.push('materiales');
  if (manoObra.considerados === 0) componentesFaltantes.push('mano_obra');
  if (gastos.considerados === 0) componentesFaltantes.push('gastos');
  return {
    ordenId: entrada.ordenId,
    folio: entrada.folio ?? 'Orden no disponible',
    esInterna: entrada.esInterna ?? false,
    moneda: MONEDA_RENTABILIDAD,
    ingresoMxn,
    costoMaterialesMxn: materiales.costo,
    costoManoObraMxn: manoObra.costo,
    costoGastosDirectosMxn: gastos.costo,
    costoTotalMxn,
    utilidadBrutaMxn,
    margenPorcentaje,
    margenCalculable: margenPorcentaje !== null,
    materialesConsiderados: materiales.considerados,
    sesionesConsideradas: manoObra.considerados,
    sesionesSinTarifa: manoObra.sinTarifa,
    gastosConsiderados: gastos.considerados,
    gastosExcluidos: gastos.excluidos,
    componentesFaltantes,
  };
}
