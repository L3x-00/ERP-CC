import { z } from 'zod';

/**
 * Esquema de filtros de la vista Actividad. Todos los filtros son opcionales;
 * el cursor viaja completo (creadoEn + id) o no viaja, y el límite se acota a
 * 1..100 para respetar el tope duro de la RPC.
 */
export const esquemaFiltrosActividad = z
  .object({
    usuarioId: z.uuid().optional(),
    modulo: z.string().trim().min(1).max(80).optional(),
    accion: z.string().trim().min(1).max(80).optional(),
    actorTexto: z.string().trim().min(1).max(120).optional(),
    recursoId: z.string().trim().min(1).max(120).optional(),
    desde: z.iso.datetime({ offset: true }).optional(),
    hasta: z.iso.datetime({ offset: true }).optional(),
    limite: z.number().int().min(1).max(100).default(30),
    cursorCreado: z.iso.datetime({ offset: true }).optional(),
    cursorId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (filtros) =>
      !filtros.desde || !filtros.hasta || Date.parse(filtros.desde) <= Date.parse(filtros.hasta),
    { message: 'El inicio debe ser anterior al fin' },
  )
  .refine(
    (filtros) => (filtros.cursorCreado === undefined) === (filtros.cursorId === undefined),
    { message: 'El cursor requiere fecha e id' },
  );

/** Filtros validados (forma plana del formulario/Server Action). */
export type FiltrosActividadInput = z.infer<typeof esquemaFiltrosActividad>;
