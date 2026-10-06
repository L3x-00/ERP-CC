/** Tipos de folio periódico con continuidad administrativa (RFQ, orden, entregas…). */
export const TIPOS_FOLIO_PERIODICO = ['RFQ', 'O', 'OI', 'NE', 'RP', 'CG'] as const;
export type TipoFolioPeriodico = (typeof TIPOS_FOLIO_PERIODICO)[number];

export const ETIQUETA_TIPO_FOLIO: Record<TipoFolioPeriodico, string> = {
  RFQ: 'RFQ · solicitud de cotización',
  O: 'O · orden de trabajo',
  OI: 'OI · orden interna',
  NE: 'NE · nota de entrega',
  RP: 'RP · recibo de pago',
  CG: 'CG · compra / gasto',
};

export interface ContinuidadFolioPeriodico {
  tipo: TipoFolioPeriodico;
  periodo: string;
  ultimoContador: number | null;
  ultimoEmitido: number | null;
  siguiente: number | null;
}

/**
 * `TIPO-MMYY_XX`. Hoy solo RFQ tiene emisor real; el resto se amplía en su
 * bloque, pero el formato de dos dígitos ya está reservado.
 */
export function formatearFolioPeriodico(
  tipo: TipoFolioPeriodico,
  periodo: string,
  numero: number,
): string {
  return `${tipo}-${periodo}_${String(numero).padStart(2, '0')}`;
}
