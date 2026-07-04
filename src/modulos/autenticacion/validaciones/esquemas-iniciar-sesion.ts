import { z } from 'zod';

/**
 * Esquema de validación para el inicio de sesión con email y contraseña
 * (admin, ventas, gerentes, contadores).
 */
export const esquemaIniciarSesion = z.object({
  email: z.email({ message: 'Email inválido' }).toLowerCase(),
  contrasena: z.string().min(8, 'Mínimo 8 caracteres'),
});

/** Datos validados de inicio de sesión. */
export type IniciarSesionInput = z.infer<typeof esquemaIniciarSesion>;
