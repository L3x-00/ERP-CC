import { z } from 'zod';
import { TURNOS_PLANEACION } from '@/modulos/planeacion/tipos/planeacion';

/** Entradas externas de Planeación — Sub-fase 6.1. */

/**
 * Programa una partida en un recurso concreto. `horasEstimadas` se acota a 24 porque
 * una asignación no puede exceder la capacidad máxima teórica de un día de recurso.
 */
export const esquemaProgramarOrden = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    partidaId: z.uuid('ID de partida inválido'),
    recursoId: z.uuid('ID de recurso inválido'),
    secuencia: z
      .number()
      .int('La secuencia debe ser un número entero')
      .positive('La secuencia debe ser mayor a 0'),
    fechaProgramada: z.iso.date({ message: 'Fecha programada inválida' }),
    turno: z.enum(TURNOS_PLANEACION),
    horasEstimadas: z
      .number()
      .positive('Las horas estimadas deben ser mayores a 0')
      .max(24, 'Las horas estimadas no pueden exceder 24'),
    ordenPrioridad: z
      .number()
      .int('La prioridad debe ser un número entero')
      .positive('La prioridad debe ser mayor a 0')
      .default(1),
  })
  .strict();

/**
 * Alterna el modo preparación de una programación. `actualizadoEnEsperado` es el
 * compare-and-set: sin él, dos planeadores podrían pisarse la misma programación.
 */
export const esquemaCambiarModoPreparacion = z
  .object({
    programacionId: z.uuid('ID de programación inválido'),
    activar: z.boolean(),
    actualizadoEnEsperado: z.iso.datetime({ message: 'Marca de actualización inválida' }),
  })
  .strict();

export type ProgramarOrdenInput = z.infer<typeof esquemaProgramarOrden>;
export type CambiarModoPreparacionInput = z.infer<typeof esquemaCambiarModoPreparacion>;
