import type { CondicionesPago } from '@/modulos/pipeline/tipos/indice';

/** Etiqueta legible de las condiciones de pago de una oportunidad. */
export const ETIQUETA_CONDICIONES_PAGO: Record<CondicionesPago, string> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  credito: 'Crédito',
};
