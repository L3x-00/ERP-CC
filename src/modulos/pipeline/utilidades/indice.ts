import type { CondicionesPago, EtapaPipeline } from '@/modulos/pipeline/tipos/indice';

/** Etiqueta legible de las condiciones de pago de una oportunidad. */
export const ETIQUETA_CONDICIONES_PAGO: Record<CondicionesPago, string> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  credito: 'Crédito',
};

/** Etiqueta legible de cada etapa del pipeline (tablero, filtros y selectores). */
export const ETIQUETA_ETAPA: Record<EtapaPipeline, string> = {
  prospecto: 'Prospecto',
  contactado: 'Contactado',
  cotizado: 'Cotizado',
  negociacion: 'Negociación',
  ganada: 'Ganada',
  perdida: 'Perdida',
};

/**
 * Suma días hábiles (lunes a viernes) a una fecha ISO `YYYY-MM-DD` — RFQ-08.
 *
 * No descuenta feriados: el sistema no tiene catálogo de días festivos, así que
 * el resultado es una **propuesta editable** (+3 seguimiento, +10 vencimiento),
 * nunca una regla dura. Devuelve la fecha original si el texto es inválido.
 */
export function sumarDiasHabiles(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return fechaISO;
  let restantes = Math.trunc(dias);
  while (restantes > 0) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
    const dia = fecha.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes -= 1;
  }
  return fecha.toISOString().slice(0, 10);
}
