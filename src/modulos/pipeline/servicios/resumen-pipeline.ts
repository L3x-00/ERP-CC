import { ESTADOS_RFQ } from '@/modulos/pipeline/tipos/indice';
import type { EstadoRfq, MonedaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/**
 * Importe agregado separado por moneda. No se suman MXN y USD entre sí: cada
 * oportunidad aporta su subtotal a la moneda en que fue cotizada, para no
 * inventar una conversión con un tipo de cambio que puede cambiar.
 */
export type ImportePorMoneda = Record<MonedaPipeline, number>;

/**
 * Resumen del pipeline (RFQ-14) por estado del RFQ (ola 2). El importe de cada
 * oportunidad es el subtotal de sus líneas (`importeSubtotal`, embebido en el
 * listado); si no viene, cuenta como 0. "ganada" se deriva de la orden
 * vinculada (`ordenVinculada`), no de la columna histórica `etapa`.
 */
export type ResumenPipeline = {
  total: number;
  porEstado: Record<EstadoRfq, number>;
  ganadas: number;
  perdidas: number;
  /** Porcentaje ganadas/total (0 si no hay oportunidades). */
  conversion: number;
  importePorEstado: Record<EstadoRfq, ImportePorMoneda>;
  importeTotal: ImportePorMoneda;
  importePendiente: ImportePorMoneda;
  importeEnviado: ImportePorMoneda;
};

function importeCero(): ImportePorMoneda {
  return { MXN: 0, USD: 0 };
}

function redondear2(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

function redondearImporte(importe: ImportePorMoneda): ImportePorMoneda {
  return { MXN: redondear2(importe.MXN), USD: redondear2(importe.USD) };
}

export function resumirPipeline(oportunidades: readonly Oportunidad[]): ResumenPipeline {
  const porEstado = Object.fromEntries(
    ESTADOS_RFQ.map((estado) => [estado, 0]),
  ) as Record<EstadoRfq, number>;
  const importePorEstado = Object.fromEntries(
    ESTADOS_RFQ.map((estado) => [estado, importeCero()]),
  ) as Record<EstadoRfq, ImportePorMoneda>;
  const importeTotal = importeCero();
  const importePendiente = importeCero();
  const importeEnviado = importeCero();

  for (const oportunidad of oportunidades) {
    porEstado[oportunidad.estadoRfq] += 1;

    const importe = oportunidad.importeSubtotal ?? 0;
    const moneda = oportunidad.moneda;
    importePorEstado[oportunidad.estadoRfq][moneda] += importe;
    importeTotal[moneda] += importe;

    const cerrada =
      oportunidad.estadoRfq === 'CLOSED' ||
      oportunidad.estadoRfq === 'CANCELLED' ||
      Boolean(oportunidad.ordenVinculada);
    if (!cerrada) {
      if (oportunidad.fechaEnvioCotizacion) importeEnviado[moneda] += importe;
      else importePendiente[moneda] += importe;
    }
  }

  const total = oportunidades.length;
  const ganadas = oportunidades.filter((oportunidad) => oportunidad.ordenVinculada).length;
  const conversion = total > 0 ? Math.round((ganadas / total) * 1000) / 10 : 0;

  return {
    total,
    porEstado,
    ganadas,
    perdidas: porEstado.CLOSED + porEstado.CANCELLED,
    conversion,
    importePorEstado: Object.fromEntries(
      ESTADOS_RFQ.map((estado) => [estado, redondearImporte(importePorEstado[estado])]),
    ) as Record<EstadoRfq, ImportePorMoneda>,
    importeTotal: redondearImporte(importeTotal),
    importePendiente: redondearImporte(importePendiente),
    importeEnviado: redondearImporte(importeEnviado),
  };
}
