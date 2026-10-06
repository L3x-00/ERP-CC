/** Raíz de las consultas del módulo de propuestas. */
export const RAIZ_PROPUESTAS = 'propuestas';

/** Raíz del detalle de una propuesta: `['propuesta', <id>]`. */
export const RAIZ_PROPUESTA = 'propuesta';

export function claveListaPropuestas(filtros: unknown) {
  return [RAIZ_PROPUESTAS, 'lista', filtros ?? null] as const;
}

export function claveDetallePropuesta(id: string | null) {
  return [RAIZ_PROPUESTA, id] as const;
}

export function claveCatalogosPropuesta() {
  return [RAIZ_PROPUESTAS, 'catalogos'] as const;
}

export function claveRfqPropuestas(rfqId: string) {
  return [RAIZ_PROPUESTAS, 'rfq', rfqId] as const;
}
