import { z } from 'zod';

import { REGISTROS_POR_PAGINA } from '@/compartido/constantes/indice';

/**
 * Esquema de filtros para consultar logs de auditoría.
 * Todos los filtros son opcionales; la paginación tiene defaults
 * (pagina 1, porPagina REGISTROS_POR_PAGINA).
 */
export const esquemaFiltrosLog = z.object({
  usuarioId: z.string().optional(),
  modulo: z.string().optional(),
  accion: z.string().optional(),
  desde: z.iso.datetime().optional(),
  hasta: z.iso.datetime().optional(),
  pagina: z.number().int().positive().default(1),
  porPagina: z.number().int().positive().default(REGISTROS_POR_PAGINA),
});

/** Filtros de logs validados (con paginación resuelta por defaults). */
export type FiltrosLogInput = z.infer<typeof esquemaFiltrosLog>;
