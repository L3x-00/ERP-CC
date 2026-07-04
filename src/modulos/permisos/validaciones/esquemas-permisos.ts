import { z } from 'zod';

import { PERMISOS, ROLES } from '@/compartido/constantes/indice';

/**
 * Esquema para asignar o revocar un permiso a un rol.
 * Los roles y permisos son valores fijos del sistema (CHECK constraint en BD).
 */
export const esquemaPermisoRol = z.object({
  rol: z.enum(ROLES),
  permiso: z.enum(PERMISOS),
});

/** Entrada validada para asignar/revocar un permiso a un rol. */
export type PermisoRolInput = z.infer<typeof esquemaPermisoRol>;
