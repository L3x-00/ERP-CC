import { z } from 'zod';

import { REGISTROS_POR_PAGINA } from '@/compartido/constantes/indice';

/**
 * Esquema de filtros para consultar logs de auditoría.
 * Todos los filtros son opcionales; la paginación tiene defaults
 * (pagina 1, porPagina REGISTROS_POR_PAGINA).
 */
export const esquemaFiltrosLog = z.object({
  usuarioId: z.uuid().optional(),
  actor: z.string().trim().min(1).max(120).optional(),
  recursoId: z.string().trim().min(1).max(120).optional(),
  modulo: z.string().trim().min(1).max(80).optional(),
  accion: z.string().trim().min(1).max(80).optional(),
  desde: z.iso.datetime({ offset: true }).optional(),
  hasta: z.iso.datetime({ offset: true }).optional(),
  pagina: z.number().int().min(1).max(100_000).default(1),
  porPagina: z.number().int().min(1).max(60).default(REGISTROS_POR_PAGINA),
  corte: z.iso.datetime({ offset: true }).optional(),
}).strict().refine((filtros) => !filtros.desde || !filtros.hasta || Date.parse(filtros.desde) <= Date.parse(filtros.hasta), {
  message: 'El inicio debe ser anterior al fin',
});

/** Filtros de logs validados (con paginación resuelta por defaults). */
export type FiltrosLogInput = z.infer<typeof esquemaFiltrosLog>;
