import { z } from 'zod';

import { PERMISOS, ROLES } from '@/compartido/constantes/indice';

/**
 * Esquema para asignar o revocar un permiso a un rol.
 * Los roles y permisos provienen del catálogo (`permisos`) y `ROLES`.
 */
export const esquemaPermisoRol = z.object({
  rol: z.enum(ROLES),
  permiso: z.enum(PERMISOS),
});

/** Entrada validada para asignar/revocar un permiso a un rol. */
export type PermisoRolInput = z.infer<typeof esquemaPermisoRol>;

/**
 * Reemplazo completo de la matriz de un rol editable.
 * `admin` queda excluido: siempre tiene todos los permisos por diseño de `can()`.
 * `permisosEsperados` es el conjunto que la pantalla cargó: la RPC rechaza el
 * guardado si otro administrador cambió el rol entretanto (control optimista).
 */
export const esquemaActualizarPermisosRol = z.object({
  rol: z.enum(ROLES).refine((rol) => rol !== 'admin', {
    message: 'El rol admin no se administra desde la matriz',
  }),
  permisos: z.array(z.enum(PERMISOS)).max(PERMISOS.length),
  permisosEsperados: z.array(z.enum(PERMISOS)).max(PERMISOS.length),
});

/**
 * Alta de un usuario desde Configuración → Personas y accesos → Usuarios.
 * El rol se elige al crear y sus permisos son los de la matriz de ese rol.
 */
export const esquemaCrearUsuario = z.object({
  nombreCompleto: z
    .string()
    .trim()
    .min(3, 'El nombre es obligatorio (mínimo 3 caracteres)')
    .max(120, 'El nombre no puede exceder 120 caracteres'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('El correo no es válido')
    .max(200),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede exceder 72 caracteres'),
  rol: z.enum(ROLES),
});

/** Cambio de rol de un usuario, con motivo obligatorio. */
export const esquemaCambiarRolUsuario = z.object({
  usuarioId: z.string().uuid(),
  rol: z.enum(ROLES),
  motivo: z.string().trim().min(3, 'Indica un motivo (mínimo 3 caracteres)').max(200),
});

/** Activación/desactivación de un usuario, con motivo obligatorio. */
export const esquemaCambiarEstadoUsuario = z.object({
  usuarioId: z.string().uuid(),
  activo: z.boolean(),
  motivo: z.string().trim().min(3, 'Indica un motivo (mínimo 3 caracteres)').max(200),
});
