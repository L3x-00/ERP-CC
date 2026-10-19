/** C10.2: conceptos que concilia una Orden. */
export const CONCEPTOS_CONCILIACION = [
  'material',
  'fabricacion',
  'subcontratacion',
  'gastos_directos',
] as const;

export type ConceptoConciliacion = (typeof CONCEPTOS_CONCILIACION)[number];

/** Fuentes que alimentan el comprometido o el real de una fila. */
export const FUENTES_CONCILIACION = ['compra', 'gasto', 'consumo', 'sesion'] as const;

export type FuenteConciliacion = (typeof FUENTES_CONCILIACION)[number];

export interface FilaConciliacionCostos {
  concepto: ConceptoConciliacion;
  /** null = la Orden no tiene Propuesta de origen; nunca se muestra como 0. */
  estimado: number | null;
  comprometido: number;
  real: number;
  /** null si no hay estimado; con estimado 0 el absoluto sí existe. */
  variacionAbs: number | null;
  /** null si no hay estimado o el estimado es 0. */
  variacionPct: number | null;
  fuentes: FuenteConciliacion[];
}

export interface AvisoConciliacion {
  n: number;
  importe: number;
}

export interface TotalesConciliacion {
  estimado: number | null;
  comprometido: number;
  real: number;
  variacionAbs: number | null;
  variacionPct: number | null;
}

/**
 * C10.2: conciliación Estimado / Comprometido / Real por Orden.
 * El margen estimado usa la venta de la Propuesta aceptada; el real, la venta
 * de la AR. Ambos sin IVA y con el TC histórico de su fuente.
 */
export interface ConciliacionCostosOrden {
  ordenId: string;
  esInterna: boolean;
  tieneEstimado: boolean;
  moneda: string | null;
  tipoCambio: number;
  ventaBaseEstimadoMxn: number | null;
  ventaBaseRealMxn: number | null;
  conceptos: FilaConciliacionCostos[];
  totales: TotalesConciliacion;
  margenEstimadoPct: number | null;
  margenRealPct: number | null;
  avisos: {
    comprasSinRubro: AvisoConciliacion;
    comprasPagadasSinRecepcion: AvisoConciliacion;
    gastosIncluidosEnRubros: AvisoConciliacion;
  };
}

export const ETIQUETA_CONCEPTO_CONCILIACION: Record<ConceptoConciliacion, string> = {
  material: 'Material',
  fabricacion: 'Fabricación',
  subcontratacion: 'Subcontratación',
  gastos_directos: 'Gastos directos',
};

export const ETIQUETA_FUENTE_CONCILIACION: Record<FuenteConciliacion, string> = {
  compra: 'Compra',
  gasto: 'Gasto',
  consumo: 'Consumo',
  sesion: 'Sesión',
};
