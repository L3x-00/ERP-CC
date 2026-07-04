import type { Log, RolUsuario } from '@/modulos/autenticacion/tipos/indice';

export type { Log };

/** Filtros de consulta para el listado de logs de auditoría. */
export type FiltrosLog = {
  usuarioId?: string;
  modulo?: string;
  accion?: string;
  /** Fecha ISO 8601 inclusive (creado_en >= desde). */
  desde?: string;
  /** Fecha ISO 8601 inclusive (creado_en <= hasta). */
  hasta?: string;
  pagina?: number;
  porPagina?: number;
};

/** Fila de la tabla logs en Supabase (snake_case). */
export type FilaLog = {
  id: string;
  /** Nullable: el log sobrevive al borrado del usuario (ON DELETE SET NULL). */
  usuario_id: string | null;
  nombre_usuario: string;
  rol: RolUsuario;
  accion: string;
  modulo: string;
  recurso_id: string;
  detalles: Record<string, unknown> | null;
  creado_en: string;
};

/**
 * Convierte una fila snake_case de la tabla logs al tipo Log camelCase.
 * Si el usuario fue borrado (usuario_id null) se mapea a cadena vacía;
 * nombre_usuario y rol quedan denormalizados para conservar el contexto.
 *
 * @param fila - Fila cruda de Supabase.
 * @returns Registro de auditoría en formato de dominio.
 */
export function filaALog(fila: FilaLog): Log {
  return {
    id: fila.id,
    usuarioId: fila.usuario_id ?? '',
    nombreUsuario: fila.nombre_usuario,
    rol: fila.rol,
    accion: fila.accion,
    modulo: fila.modulo,
    recursoId: fila.recurso_id,
    detalles: fila.detalles,
    creadoEn: fila.creado_en,
  };
}
