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

/** Fila del catálogo de permisos (tabla `permisos`). */
export type PermisoCatalogo = {
  codigo: string;
  modulo: string;
  descripcion: string;
  activo: boolean;
};

/** Matriz completa rol → permisos asignados (excluye la columna admin editable). */
export type MatrizPermisos = {
  permisos: PermisoCatalogo[];
  asignaciones: Record<RolUsuario, string[]>;
};

/** Usuario para la pestaña administrativa de usuarios. */
export type UsuarioAdmin = {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  activo: boolean;
  ultimoLoginEn: string | null;
};

/** Respuesta de la consulta administrativa de usuarios. */
export type DatosUsuariosAdmin = {
  usuarios: UsuarioAdmin[];
  usuarioActualId: string;
};

/** Roles editables desde la matriz (admin siempre tiene todo por diseño). */
export type RolEditable = Exclude<RolUsuario, 'admin'>;

/** Entrada validada para reemplazar la matriz de un rol. */
export type EntradaActualizarPermisosRol = {
  rol: RolEditable;
  permisos: Permiso[];
};

/** Entrada validada para cambiar el rol de un usuario. */
export type EntradaCambiarRolUsuario = {
  usuarioId: string;
  rol: RolUsuario;
  motivo: string;
};

/** Entrada validada para activar/desactivar un usuario. */
export type EntradaCambiarEstadoUsuario = {
  usuarioId: string;
  activo: boolean;
  motivo: string;
};
