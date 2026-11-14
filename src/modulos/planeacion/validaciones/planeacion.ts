import { z } from 'zod';
import { ESTADOS_PLANEACION, TURNOS_PLANEACION } from '@/modulos/planeacion/tipos/planeacion';

/** Entradas externas de Planeación — Sub-fase 6.1. */

/**
 * Programa una partida en un recurso concreto. `horasEstimadas` se acota a 24 porque
 * una asignación no puede exceder la capacidad máxima teórica de un día de recurso.
 * C9.0/P-01 B: la operación (`metaProcesoId`) sustituye a la secuencia manual; con
 * operación la secuencia viaja nula y PostgreSQL la deriva de la meta del ruteo.
 */
export const esquemaProgramarOrden = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    partidaId: z.uuid('ID de partida inválido'),
    recursoId: z.uuid('ID de recurso inválido'),
    secuencia: z
      .number()
      .int('La secuencia debe ser un número entero')
      .positive('La secuencia debe ser mayor a 0')
      .nullish(),
    metaProcesoId: z.uuid('ID de operación inválido').nullish(),
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
  .strict()
  .superRefine((datos, contexto) => {
    const tieneOperacion = datos.metaProcesoId !== null && datos.metaProcesoId !== undefined;
    const tieneSecuencia = datos.secuencia !== null && datos.secuencia !== undefined;

    if (tieneOperacion && tieneSecuencia) {
      contexto.addIssue({
        code: 'custom',
        path: ['secuencia'],
        message: 'Con operación del ruteo la secuencia se deriva de la meta',
      });
      return;
    }
    if (!tieneOperacion && !tieneSecuencia) {
      contexto.addIssue({
        code: 'custom',
        path: ['secuencia'],
        message: 'Indica la secuencia o una operación del ruteo',
      });
    }
  });

/**
 * C16: una operación que no cabe en una jornada se reparte en días. Cada día
 * lleva su fecha y sus horas; la suma debe cuadrar con el total de la operación.
 */
export const esquemaProgramarMultidia = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    partidaId: z.uuid('ID de partida inválido'),
    recursoId: z.uuid('ID de recurso inválido'),
    metaProcesoId: z.uuid('ID de operación inválido'),
    turno: z.enum(TURNOS_PLANEACION),
    ordenPrioridad: z
      .number()
      .int('La prioridad debe ser un número entero')
      .positive('La prioridad debe ser mayor a 0')
      .max(9999, 'La prioridad no puede exceder 9999')
      .default(1),
    horasTotales: z
      .number()
      .positive('Las horas totales deben ser mayores a 0')
      .max(360, 'Las horas totales no pueden exceder 360'),
    dias: z
      .array(z.object({
        fecha: z.iso.date({ message: 'Fecha inválida' }),
        horas: z.number().positive('Cada día debe tener horas').max(24, 'Un día no puede exceder 24 h'),
      }).strict())
      .min(2, 'El plan necesita al menos dos días')
      .max(15, 'El plan no puede exceder 15 días'),
  })
  .strict()
  .superRefine((datos, contexto) => {
    const fechas = new Set<string>();
    for (const dia of datos.dias) {
      if (fechas.has(dia.fecha)) {
        contexto.addIssue({
          code: 'custom',
          path: ['dias'],
          message: 'No puedes repetir el mismo día en el plan',
        });
        return;
      }
      fechas.add(dia.fecha);
    }
    const suma = Math.round(datos.dias.reduce((total, dia) => total + dia.horas, 0) * 100) / 100;
    if (Math.abs(suma - datos.horasTotales) > 0.01) {
      contexto.addIssue({
        code: 'custom',
        path: ['dias'],
        message: `El plan suma ${suma} h y la operación requiere ${datos.horasTotales} h`,
      });
    }
  });

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
    motivo: z
      .string()
      .trim()
      .min(3, 'Indica el motivo de la reprogramación')
      .max(500, 'El motivo no puede exceder 500 caracteres'),
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

/** Búsqueda del primer día hábil con capacidad comprobada (OBS-19). */
export const esquemaProponerHuecoPlaneacion = z
  .object({
    recursoId: z.uuid('ID de recurso inválido'),
    turno: z.enum(TURNOS_PLANEACION),
    horasEstimadas: z
      .number()
      .positive('Las horas estimadas deben ser mayores a 0')
      .max(24, 'Las horas estimadas no pueden exceder 24'),
    desdeFecha: z.iso.date({ message: 'Fecha inicial de búsqueda inválida' }),
  })
  .strict();

/** C16: propuesta de reparto en días para una operación que no cabe en un turno. */
export const esquemaProponerPlanMultidia = z
  .object({
    recursoId: z.uuid('ID de recurso inválido'),
    turno: z.enum(TURNOS_PLANEACION),
    horasEstimadas: z
      .number()
      .positive('Las horas estimadas deben ser mayores a 0')
      .max(360, 'Las horas estimadas no pueden exceder 360'),
    desdeFecha: z.iso.date({ message: 'Fecha inicial inválida' }),
  })
  .strict();

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

/** Identificador mínimo para leer el detalle operativo de una programación. */
export const esquemaObtenerDetalleProgramacion = z
  .object({
    programacionId: z.uuid('ID de programación inválido'),
  })
  .strict();

export type ProgramarOrdenInput = z.infer<typeof esquemaProgramarOrden>;
export type ProgramarMultidiaInput = z.infer<typeof esquemaProgramarMultidia>;
export type CambiarModoPreparacionInput = z.infer<typeof esquemaCambiarModoPreparacion>;
export type ReprogramarPartidaRecursoInput = z.infer<typeof esquemaReprogramarPartidaRecurso>;
export type ActivarModoPreparacionInput = z.infer<typeof esquemaActivarModoPreparacion>;
export type ConsultarCalendarioPlaneacionInput = z.infer<typeof esquemaConsultarCalendarioPlaneacion>;
export type ProponerHuecoPlaneacionInput = z.infer<typeof esquemaProponerHuecoPlaneacion>;
export type ProponerPlanMultidiaInput = z.infer<typeof esquemaProponerPlanMultidia>;
export type ObtenerDetalleProgramacionInput = z.infer<typeof esquemaObtenerDetalleProgramacion>;
