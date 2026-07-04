import type { ESTADOS_ORDEN, ESTADOS_RFQ, ROLES } from '@/compartido/constantes/indice';

/** Estado de orden de producción. */
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

/** Estado de cotización (RFQ). */
export type EstadoRFQ = (typeof ESTADOS_RFQ)[number];

/** Rol de usuario del sistema. */
export type Rol = (typeof ROLES)[number];

/**
 * Respuesta estándar de Server Actions.
 * Discriminada por `exito` para narrowing type-safe.
 */
export type RespuestaAccion<T = undefined> =
  | { exito: true; datos?: T }
  | { exito: false; error: string };

/** Parámetros de paginación. */
export type Paginacion = {
  pagina: number;
  porPagina: number;
};

/** Resultado paginado genérico. */
export type ResultadoPaginado<T> = {
  registros: T[];
  total: number;
  pagina: number;
  porPagina: number;
};
