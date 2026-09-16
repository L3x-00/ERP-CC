import { ETAPAS_PIPELINE } from '@/modulos/pipeline/tipos/indice';
import type { EtapaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/**
 * Resumen del pipeline por conteo (RFQ-14). Los importes por estado requieren
 * sumar las líneas de cotización (no cargadas en el listado), por lo que este
 * resumen cubre la parte de conteos: total, distribución por etapa, ganadas y
 * conversión. La conversión es aprobadas/total según el catálogo.
 */
export type ResumenPipeline = {
  total: number;
  porEtapa: Record<EtapaPipeline, number>;
  ganadas: number;
  perdidas: number;
  /** Porcentaje aprobadas/total (0 si no hay oportunidades). */
  conversion: number;
};

export function resumirPipeline(oportunidades: readonly Oportunidad[]): ResumenPipeline {
  const porEtapa = Object.fromEntries(
    ETAPAS_PIPELINE.map((etapa) => [etapa, 0]),
  ) as Record<EtapaPipeline, number>;

  for (const oportunidad of oportunidades) {
    porEtapa[oportunidad.etapa] += 1;
  }

  const total = oportunidades.length;
  const ganadas = porEtapa.ganada;
  const conversion = total > 0 ? Math.round((ganadas / total) * 1000) / 10 : 0;

  return { total, porEtapa, ganadas, perdidas: porEtapa.perdida, conversion };
}
