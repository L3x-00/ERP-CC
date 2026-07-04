import type { Permiso, RolUsuario } from '@/modulos/autenticacion/tipos/indice';

export type { Permiso, RolUsuario };

/** Asignación de un permiso a un rol (tabla permisos_rol, camelCase). */
export type PermisoRol = {
  id: string; // UUID
  rol: RolUsuario;
  permiso: Permiso;
  creadoEn: string; // ISO 8601
};

/** Fila de la tabla permisos_rol en Supabase (snake_case). */
export type FilaPermisoRol = {
  id: string;
  rol: RolUsuario;
  permiso: Permiso;
  creado_en: string;
};
