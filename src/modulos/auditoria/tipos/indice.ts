import type { Json } from '@/compartido/tipos/supabase';
import type { Log, RolUsuario } from '@/modulos/autenticacion/tipos/indice';

export type { Log };

/** Filtros de consulta para el listado de logs de auditoría. */
export type FiltrosLog = {
  usuarioId?: string;
  actor?: string;
  recursoId?: string;
  modulo?: string;
  accion?: string;
  /** Fecha ISO 8601 inclusive (creado_en >= desde). */
  desde?: string;
  /** Fecha ISO 8601 inclusive (creado_en <= hasta). */
  hasta?: string;
  /** Límite estable de la primera página al navegar por el historial. */
  corte?: string;
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

/** Entidad de negocio resuelta por la RPC para construir el enlace del registro. */
export type EntidadActividad =
  | 'pipeline'
  | 'cliente'
  | 'orden'
  | 'propuesta'
  | 'produccion'
  | 'tesoreria'
  | 'otro';

/** Filtros validados de la vista Actividad (cursor opcional para paginar). */
export type FiltrosActividad = {
  usuarioId?: string;
  modulo?: string;
  accion?: string;
  actorTexto?: string;
  recursoId?: string;
  /** Fecha ISO 8601 inclusive (creado_en >= desde). */
  desde?: string;
  /** Fecha ISO 8601 inclusive (creado_en <= hasta). */
  hasta?: string;
  limite: number;
  /** Cursor de paginación estable: último (creadoEn, id) de la página previa. */
  cursor?: { creadoEn: string; id: string };
};

/** Evento de Actividad ya resuelto en SQL (etiquetas legibles, contexto gated). */
export type RegistroActividad = {
  id: string;
  creadoEn: string;
  correlationId: string | null;
  nombreUsuario: string;
  rol: RolUsuario;
  accion: string;
  modulo: string;
  recursoId: string;
  contexto: Record<string, unknown> | null;
  /** Folio o nombre resuelto en SQL; null si no fue posible. */
  recursoEtiqueta: string | null;
  entidad: EntidadActividad;
};

/** Grupo visual: los eventos con el mismo correlationId forman una acción. */
export type GrupoActividad = {
  /** null para eventos sueltos sin correlación. */
  correlationId: string | null;
  registros: RegistroActividad[];
};

/** Fila de la RPC `obtener_actividad` (snake_case). */
export type FilaActividad = {
  id: string;
  creado_en: string;
  correlation_id: string | null;
  nombre_usuario: string;
  rol: RolUsuario;
  accion: string;
  modulo: string;
  recurso_id: string;
  contexto: Json | null;
  recurso_etiqueta: string | null;
  entidad: string;
  hay_mas: boolean;
};

/** Datos de una página de Actividad. */
export type DatosActividad = {
  registros: RegistroActividad[];
  hayMas: boolean;
};

const ENTIDADES_ACTIVIDAD: readonly EntidadActividad[] = [
  'pipeline',
  'cliente',
  'orden',
  'propuesta',
  'produccion',
  'tesoreria',
];

/**
 * Convierte una fila de la RPC de Actividad al tipo de dominio. `contexto`
 * solo llega con contenido para admin (la RPC lo nulifica para el resto) y se
 * normaliza a objeto plano para no filtrar arreglos o primitivos.
 *
 * @param fila - Fila cruda devuelta por `obtener_actividad`.
 * @returns Evento de actividad en formato de dominio.
 */
export function filaARegistroActividad(fila: FilaActividad): RegistroActividad {
  const contexto =
    fila.contexto !== null && typeof fila.contexto === 'object' && !Array.isArray(fila.contexto)
      ? (fila.contexto as Record<string, unknown>)
      : null;

  const entidad = ENTIDADES_ACTIVIDAD.includes(fila.entidad as EntidadActividad)
    ? (fila.entidad as EntidadActividad)
    : 'otro';

  return {
    id: fila.id,
    creadoEn: fila.creado_en,
    correlationId: fila.correlation_id,
    nombreUsuario: fila.nombre_usuario,
    rol: fila.rol,
    accion: fila.accion,
    modulo: fila.modulo,
    recursoId: fila.recurso_id,
    contexto,
    recursoEtiqueta: fila.recurso_etiqueta,
    entidad,
  };
}
