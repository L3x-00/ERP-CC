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
  // RFQ-02: cliente existente (o recién dado de alta) al que se liga la RFQ.
  // Opcional: una RFQ puede nacer sin cliente en el catálogo y ligarse después.
  clienteId: z.uuid('Cliente inválido').optional(),
  // RFQ-01: datos de captura de la solicitud (opcionales en el alta).
  poCliente: z.string().max(60).optional(),
  fechaRequerida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().or(z.literal('')),
  horasEstimadas: z.number().min(0).max(100000).optional(),
  notas: z.string().max(2000).optional(),
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

/**
 * Esquema para actualizar los datos de captura de la solicitud comercial de una
 * oportunidad abierta — RFQ-01. Las cadenas vacías se normalizan a null en la
 * acción; `horasEstimadas` es número o null.
 */
export const esquemaDatosOportunidad = z.object({
  id: z.uuid(),
  poCliente: z.string().max(60),
  fechaRequerida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').or(z.literal('')),
  horasEstimadas: z.number().min(0).max(100000).nullable(),
  notas: z.string().max(2000),
});

/** Datos validados para actualizar los datos de la solicitud (RFQ-01). */
export type DatosOportunidadInput = z.infer<typeof esquemaDatosOportunidad>;

/**
 * Esquema para ligar (o desligar) una oportunidad abierta con un cliente del
 * catálogo — RFQ-02. `clienteId: null` desliga. `heredarCondiciones` copia las
 * condiciones de pago del cliente a la oportunidad; se pide de forma explícita
 * para no pisar en silencio unas condiciones negociadas a mano (RFQ-03).
 */
export const esquemaAsignarClienteOportunidad = z.object({
  id: z.uuid(),
  clienteId: z.uuid('Cliente inválido').nullable(),
  heredarCondiciones: z.boolean().default(false),
});

/** Datos validados para asignar el cliente de una oportunidad (RFQ-02). */
export type AsignarClienteOportunidadInput = z.infer<
  typeof esquemaAsignarClienteOportunidad
>;
