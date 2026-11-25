/** Raíz de las consultas del módulo de propuestas. */
export const RAIZ_PROPUESTAS = 'propuestas';

/** Raíz del detalle de una propuesta: `['propuesta', <id>]`. */
export const RAIZ_PROPUESTA = 'propuesta';

/** Segmento de listados, para no invalidar catálogos con un evento cualquiera. */
export const RAIZ_LISTA_PROPUESTAS = 'lista';

export function claveListaPropuestas(filtros: unknown) {
  return [RAIZ_PROPUESTAS, RAIZ_LISTA_PROPUESTAS, filtros ?? null] as const;
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
