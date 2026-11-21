import { z } from 'zod';

/**
 * Esquema de validación para el PIN de operador de piso.
 * El PIN debe ser numérico y tener exactamente seis dígitos.
 */
export const esquemaValidarPin = z.object({
  pin: z.string().regex(/^[0-9]{6}$/, 'El PIN debe tener exactamente 6 dígitos'),
});

/** Datos validados del PIN de operador. */
export type ValidarPinInput = z.infer<typeof esquemaValidarPin>;
