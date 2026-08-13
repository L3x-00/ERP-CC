import { z } from 'zod';
import { ESTADOS_PLANEACION, TURNOS_PLANEACION } from '@/modulos/planeacion/tipos/planeacion';

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
    actualizadoEnEsperado: z.iso.datetime({
      offset: true,
      message: 'Marca de actualización inválida',
    }),
  })
  .strict();

/** Reprograma una fila existente conservando la protección compare-and-set. */
export const esquemaReprogramarPartidaRecurso = z
  .object({
    programacionId: z.uuid('ID de programación inválido'),
    recursoId: z.uuid('ID de recurso inválido'),
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
      .max(9999, 'La prioridad no puede exceder 9999'),
    actualizadoEnEsperado: z.iso.datetime({
      offset: true,
      message: 'Marca de actualización inválida',
    }),
  })
  .strict();

/** La acción de 6.3 solo habilita preparación; deshabilitarla requiere flujo futuro explícito. */
export const esquemaActivarModoPreparacion = z
  .object({
    programacionId: z.uuid('ID de programación inválido'),
    actualizadoEnEsperado: z.iso.datetime({
      offset: true,
      message: 'Marca de actualización inválida',
    }),
  })
  .strict();

const MAXIMO_DIAS_CALENDARIO = 31;

/** Filtros de lectura acotados para no permitir consultas de calendario sin límite. */
export const esquemaConsultarCalendarioPlaneacion = z
  .object({
    fechaInicio: z.iso.date({ message: 'Fecha inicial inválida' }),
    fechaFin: z.iso.date({ message: 'Fecha final inválida' }),
    recursoId: z.uuid('ID de recurso inválido').optional(),
    estados: z.array(z.enum(ESTADOS_PLANEACION)).max(6, 'Estados inválidos').optional(),
  })
  .strict()
  .superRefine((datos, contexto) => {
    const inicio = Date.parse(`${datos.fechaInicio}T00:00:00.000Z`);
    const fin = Date.parse(`${datos.fechaFin}T00:00:00.000Z`);
    const dias = (fin - inicio) / 86_400_000;

    if (dias < 0) {
      contexto.addIssue({ code: 'custom', path: ['fechaFin'], message: 'El rango de fechas es inválido' });
      return;
    }
    if (dias > MAXIMO_DIAS_CALENDARIO) {
      contexto.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: `El calendario no puede exceder ${MAXIMO_DIAS_CALENDARIO + 1} días`,
      });
    }
  });

export type ProgramarOrdenInput = z.infer<typeof esquemaProgramarOrden>;
export type CambiarModoPreparacionInput = z.infer<typeof esquemaCambiarModoPreparacion>;
export type ReprogramarPartidaRecursoInput = z.infer<typeof esquemaReprogramarPartidaRecurso>;
export type ActivarModoPreparacionInput = z.infer<typeof esquemaActivarModoPreparacion>;
export type ConsultarCalendarioPlaneacionInput = z.infer<typeof esquemaConsultarCalendarioPlaneacion>;
