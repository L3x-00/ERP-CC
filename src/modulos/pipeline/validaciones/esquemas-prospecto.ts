import { z } from 'zod';

/**
 * Esquema para crear un prospecto (nueva oportunidad en etapa inicial).
 * El correo es opcional en la captura inicial, pero se exige más adelante como
 * gate para pasar a "cotizado" (ver acción de transición de etapa).
 */
export const esquemaCrearProspecto = z.object({
  nombreContacto: z.string().min(2, 'Nombre requerido'),
  empresa: z.string().min(2, 'Empresa requerida'),
  correo: z.email({ message: 'Correo inválido' }).optional().or(z.literal('')),
  telefono: z.string().optional(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  condicionesPago: z.enum(['contado', '15_dias', '30_dias', 'credito']).optional(),
  prioridad: z.enum(['baja', 'normal', 'alta', 'urgente']).default('normal'),
  ivaPorcentaje: z.number().positive().default(16),
  etiquetas: z.array(z.string()).default([]),
  // RFQ-09: trabajo interno (TI). Al aprobar no genera AR ni cuenta como venta.
  esOrdenInterna: z.boolean().default(false),
});

/** Datos validados para crear un prospecto. */
export type CrearProspectoInput = z.infer<typeof esquemaCrearProspecto>;

/** Esquema para marcar/desmarcar una oportunidad como trabajo interno (TI). */
export const esquemaOrdenInterna = z.object({
  id: z.uuid(),
  esOrdenInterna: z.boolean(),
});

/** Datos validados para cambiar la condición interna de una oportunidad. */
export type OrdenInternaInput = z.infer<typeof esquemaOrdenInterna>;

/**
 * Esquema para reemplazar el conjunto de etiquetas (clasificación) de una
 * oportunidad — RFQ-12. Cada etiqueta se recorta y se acota en longitud; la
 * deduplicación se hace en la acción (Zod no dedupe arreglos).
 */
export const esquemaEtiquetasOportunidad = z.object({
  id: z.uuid(),
  etiquetas: z
    .array(z.string().trim().min(1, 'Etiqueta vacía').max(40, 'Etiqueta demasiado larga'))
    .max(20, 'Máximo 20 etiquetas'),
});

/** Datos validados para actualizar las etiquetas de una oportunidad. */
export type EtiquetasOportunidadInput = z.infer<typeof esquemaEtiquetasOportunidad>;

/** Esquema para retirar (eliminar) una oportunidad sin orden asociada — RFQ-18. */
export const esquemaRetirarOportunidad = z.object({
  id: z.uuid(),
});

/** Datos validados para retirar una oportunidad. */
export type RetirarOportunidadInput = z.infer<typeof esquemaRetirarOportunidad>;
