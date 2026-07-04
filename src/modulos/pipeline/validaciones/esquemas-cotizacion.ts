import { z } from 'zod';

/** Esquema de una línea individual de cotización. */
export const esquemaLineaCotizacion = z.object({
  descripcion: z.string().min(1, 'Descripción requerida'),
  cantidad: z.number().positive('Cantidad debe ser mayor a 0'),
  precioUnitario: z.number().min(0, 'Precio no puede ser negativo'),
  material: z.string().optional(),
  espesor: z.string().optional(),
  area: z.number().min(0).optional(),
  procesos: z.array(z.string()).default([]),
});

/**
 * Esquema para guardar la cotización completa de una oportunidad.
 * La semántica de guardado es de reemplazo total de líneas, por eso se exige
 * al menos una línea (una cotización vacía no tiene sentido de negocio).
 */
export const esquemaGuardarCotizacion = z.object({
  pipelineId: z.uuid(),
  lineas: z.array(esquemaLineaCotizacion).min(1, 'Agrega al menos una línea'),
});

/** Datos validados de una línea de cotización. */
export type LineaCotizacionInput = z.infer<typeof esquemaLineaCotizacion>;

/** Datos validados para guardar una cotización completa. */
export type GuardarCotizacionInput = z.infer<typeof esquemaGuardarCotizacion>;
