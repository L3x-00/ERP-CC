import { z } from 'zod';

/**
 * Esquema de validación para el PIN de operador de piso.
 * El PIN debe ser numérico, de 4 a 6 dígitos.
 */
export const esquemaValidarPin = z.object({
  pin: z
    .string()
    .min(4, 'PIN debe tener entre 4 y 6 dígitos')
    .max(6, 'PIN debe tener entre 4 y 6 dígitos')
    .regex(/^\d+$/, 'PIN solo números'),
});

/** Datos validados del PIN de operador. */
export type ValidarPinInput = z.infer<typeof esquemaValidarPin>;
