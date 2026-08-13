/** Roles válidos del sistema. */
export type RolUsuario = 'admin' | 'vendedor' | 'gerente' | 'operador' | 'contador';

/** Permisos granulares del sistema (tabla permisos_rol). */
export type Permiso =
  | 'ver_clientes'
  | 'aprobar_ordenes'
  | 'registrar_pagos'
  | 'registrar_gastos'
  | 'aplicar_saldos'
  | 'eliminar'
  | 'ver_finanzas'
  | 'ver_pipeline_equipo'
  | 'configuracion'
  | 'cancelar_ordenes_en_proceso'
  | 'gestionar_inventario'
  | 'gestionar_produccion'
  | 'ver_planeacion'
  | 'gestionar_planeacion';

/** Usuario del sistema (tabla usuarios). */
export type Usuario = {
  id: string; // UUID
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  /** Hash bcrypt del PIN (solo si rol='operador'). Nunca se envía al cliente. */
  pinOperador?: string | null;
  activo: boolean;
  ultimoLoginEn?: string | null; // ISO 8601
  creadoEn: string; // ISO 8601
  actualizadoEn: string; // ISO 8601
};

/** Usuario autenticado con sus permisos resueltos. */
export type UsuarioAutenticado = Usuario & {
  permisos: string[];
};

/** Sesión corta de operador de piso (cookie httpOnly). */
export type SesionOperador = {
  usuarioId: string;
  nombreUsuario: string;
  iniciadaEn: string; // ISO 8601
  ultimaActividadEn: string; // ISO 8601
  timeoutMinutos: number; // 15, 30, etc.
};

/** Registro de auditoría (tabla logs). */
export type Log = {
  id: string;
  usuarioId: string;
  nombreUsuario: string;
  rol: RolUsuario;
  accion: string; // 'crear', 'actualizar', 'eliminar', 'aprobar', etc.
  modulo: string; // 'clientes', 'ordenes', etc.
  recursoId: string;
  detalles?: Record<string, unknown> | null;
  creadoEn: string; // ISO 8601
};

/** Fila de la tabla usuarios en Supabase (snake_case). */
export type FilaUsuario = {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  pin_operador: string | null;
  activo: boolean;
  ultimo_login_at: string | null;
  creado_en: string;
  actualizado_en: string;
};

/** Convierte fila snake_case de Supabase a tipo Usuario camelCase. */
export function filaAUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    email: fila.email,
    nombreCompleto: fila.nombre_completo,
    rol: fila.rol,
    pinOperador: fila.pin_operador,
    activo: fila.activo,
    ultimoLoginEn: fila.ultimo_login_at,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
