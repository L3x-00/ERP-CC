import { z } from 'zod';
import { ROLES } from '@/compartido/constantes/indice';

/**
 * Esquema de validación para crear o actualizar un usuario del sistema.
 * El rol debe ser uno de los roles fijos definidos en `ROLES`.
 */
export const esquemaUsuario = z.object({
  email: z.email({ message: 'Email inválido' }).toLowerCase(),
  nombreCompleto: z.string().min(2, 'Nombre debe tener al menos 2 caracteres'),
  rol: z.enum(ROLES),
  activo: z.boolean(),
});

/** Datos validados de usuario. */
export type UsuarioInput = z.infer<typeof esquemaUsuario>;
