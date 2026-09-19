import { ETAPAS_PIPELINE } from '@/modulos/pipeline/tipos/indice';
import type { EtapaPipeline, MonedaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/**
 * Importe agregado separado por moneda. No se suman MXN y USD entre sí: cada
 * oportunidad aporta su subtotal a la moneda en que fue cotizada, para no
 * inventar una conversión con un tipo de cambio que puede cambiar.
 */
export type ImportePorMoneda = Record<MonedaPipeline, number>;

/**
 * Resumen del pipeline (RFQ-14): conteos e importes por estado. El importe de
 * cada oportunidad es el subtotal de sus líneas (`importeSubtotal`, embebido en
 * el listado); si no viene, cuenta como 0. "pendiente" y "enviado" solo aplican
 * a oportunidades abiertas (ni ganada ni perdida): enviado = ya se marcó
 * `fechaEnvioCotizacion`, pendiente = aún no.
 */
export type ResumenPipeline = {
  total: number;
  porEtapa: Record<EtapaPipeline, number>;
  ganadas: number;
  perdidas: number;
  /** Porcentaje aprobadas/total (0 si no hay oportunidades). */
  conversion: number;
  importePorEtapa: Record<EtapaPipeline, ImportePorMoneda>;
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
  const porEtapa = Object.fromEntries(
    ETAPAS_PIPELINE.map((etapa) => [etapa, 0]),
  ) as Record<EtapaPipeline, number>;
  const importePorEtapa = Object.fromEntries(
    ETAPAS_PIPELINE.map((etapa) => [etapa, importeCero()]),
  ) as Record<EtapaPipeline, ImportePorMoneda>;
  const importeTotal = importeCero();
  const importePendiente = importeCero();
  const importeEnviado = importeCero();

  for (const oportunidad of oportunidades) {
    porEtapa[oportunidad.etapa] += 1;

    const importe = oportunidad.importeSubtotal ?? 0;
    const moneda = oportunidad.moneda;
    importePorEtapa[oportunidad.etapa][moneda] += importe;
    importeTotal[moneda] += importe;

    const abierta = oportunidad.etapa !== 'ganada' && oportunidad.etapa !== 'perdida';
    if (abierta) {
      if (oportunidad.fechaEnvioCotizacion) importeEnviado[moneda] += importe;
      else importePendiente[moneda] += importe;
    }
  }

  const total = oportunidades.length;
  const ganadas = porEtapa.ganada;
  const conversion = total > 0 ? Math.round((ganadas / total) * 1000) / 10 : 0;

  return {
    total,
    porEtapa,
    ganadas,
    perdidas: porEtapa.perdida,
    conversion,
    importePorEtapa: Object.fromEntries(
      ETAPAS_PIPELINE.map((etapa) => [etapa, redondearImporte(importePorEtapa[etapa])]),
    ) as Record<EtapaPipeline, ImportePorMoneda>,
    importeTotal: redondearImporte(importeTotal),
    importePendiente: redondearImporte(importePendiente),
    importeEnviado: redondearImporte(importeEnviado),
  };
}
