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
});

/** Datos validados para crear un prospecto. */
export type CrearProspectoInput = z.infer<typeof esquemaCrearProspecto>;
