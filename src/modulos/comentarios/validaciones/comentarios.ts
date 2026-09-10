import { z } from 'zod';

const UUID = z.uuid('El identificador debe ser un UUID válido');

/** Entrada estricta para crear un comentario contextual. */
export const esquemaCrearComentario = z
  .object({
    entidadTipo: z.enum(['orden', 'cotizacion', 'cliente']),
    entidadId: UUID,
    contenido: z.string().trim().min(1, 'El comentario no puede estar vacío').max(2000, 'El comentario no puede superar 2000 caracteres'),
    menciones: z.array(UUID).max(30, 'No se permiten más de 30 menciones').default([]),
  })
  .strict();

/** Entrada para el borrado lógico del comentario. */
export const esquemaEliminarComentario = z
  .object({ comentarioId: UUID })
  .strict();

/** Entrada para marcar una notificación propia como leída. */
export const esquemaMarcarNotificacionLeida = z
  .object({ notificacionId: UUID })
  .strict();

/** Filtro de hilos y límite defensivo de lectura. */
export const esquemaConsultaComentarios = z
  .object({
    entidadTipo: z.enum(['orden', 'cotizacion', 'cliente']),
    entidadId: UUID,
  })
  .strict();

/** Filtro del centro de notificaciones. */
export const esquemaConsultaNotificaciones = z
  .object({
    soloNoLeidas: z.boolean().default(false),
    limite: z.number().int().min(1).max(100).default(30),
  })
  .strict();

export type CrearComentarioInput = z.infer<typeof esquemaCrearComentario>;
export type EliminarComentarioInput = z.infer<typeof esquemaEliminarComentario>;
export type MarcarNotificacionLeidaInput = z.infer<typeof esquemaMarcarNotificacionLeida>;
export type ConsultaComentariosInput = z.infer<typeof esquemaConsultaComentarios>;
export type ConsultaNotificacionesInput = z.infer<typeof esquemaConsultaNotificaciones>;
