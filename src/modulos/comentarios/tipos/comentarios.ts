import type { Json, Tables } from '@/compartido/tipos/supabase';

/** Entidades del ERP que admiten un hilo de comentarios. */
export type TipoEntidadComentario = 'orden' | 'cotizacion' | 'cliente';

/** Usuario que puede resolverse desde una mención `@Nombre`. */
export interface MencionUsuario {
  id: string;
  nombre: string;
}

/** Archivo adjunto preparado para una futura fase de Storage. */
export interface ArchivoAdjuntoComentario {
  nombre: string;
  ruta: string;
}

/** Comentario público para el hilo; nunca contiene campos de autorización. */
export interface ComentarioRegistro {
  id: string;
  entidadTipo: TipoEntidadComentario;
  entidadId: string;
  autorId: string;
  autorNombre: string;
  autorAvatarUrl: string | null;
  contenido: string;
  menciones: string[];
  archivosAdjuntos: ArchivoAdjuntoComentario[];
  editado: boolean;
  eliminado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export type TipoNotificacion = 'mencion' | 'comentario_orden' | 'estado_orden' | 'alerta_sistema';

/** Notificación visible únicamente para su usuario destinatario. */
export interface NotificacionUsuario {
  id: string;
  usuarioId: string;
  emisorId: string | null;
  emisorNombre: string | null;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  creadoEn: string;
}

export type FilaComentarioRegistro = Tables<'comentarios_registro'>;
export type FilaNotificacionUsuario = Tables<'notificaciones_usuario'>;

type FilaUsuarioComentario = Pick<Tables<'usuarios'>, 'id' | 'nombre_completo'>;

const UUID_V4_O_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tipoEntidadSeguro(valor: string): TipoEntidadComentario {
  if (valor === 'orden' || valor === 'cotizacion' || valor === 'cliente') return valor;
  throw new Error('Tipo de entidad de comentario inválido');
}

function tipoNotificacionSeguro(valor: string): TipoNotificacion {
  if (valor === 'mencion' || valor === 'comentario_orden' || valor === 'estado_orden' || valor === 'alerta_sistema') {
    return valor;
  }
  throw new Error('Tipo de notificación inválido');
}

function listaMenciones(valor: Json): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((item): item is string => typeof item === 'string' && UUID_V4_O_UUID.test(item)))];
}

function listaAdjuntos(valor: Json): ArchivoAdjuntoComentario[] {
  if (!Array.isArray(valor)) return [];
  const adjuntos: ArchivoAdjuntoComentario[] = [];
  for (const item of valor) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const objeto = item as Record<string, Json | undefined>;
    if (typeof objeto.nombre === 'string' && typeof objeto.ruta === 'string') {
      adjuntos.push({ nombre: objeto.nombre, ruta: objeto.ruta });
    }
  }
  return adjuntos;
}

/** Convierte una fila de comentarios a un contrato camelCase seguro. */
export function filaAComentario(
  fila: FilaComentarioRegistro,
  autor?: FilaUsuarioComentario | null,
): ComentarioRegistro {
  return {
    id: fila.id,
    entidadTipo: tipoEntidadSeguro(fila.entidad_tipo),
    entidadId: fila.entidad_id,
    autorId: fila.autor_id,
    autorNombre: autor?.nombre_completo ?? 'Usuario',
    autorAvatarUrl: null,
    contenido: fila.contenido,
    menciones: listaMenciones(fila.menciones_json),
    archivosAdjuntos: listaAdjuntos(fila.archivos_adjuntos),
    editado: fila.editado,
    eliminado: fila.eliminado,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de notificaciones y el nombre opcional del emisor. */
export function filaANotificacion(
  fila: FilaNotificacionUsuario,
  emisor?: FilaUsuarioComentario | null,
): NotificacionUsuario {
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    emisorId: fila.emisor_id,
    emisorNombre: emisor?.nombre_completo ?? null,
    tipo: tipoNotificacionSeguro(fila.tipo),
    titulo: fila.titulo,
    mensaje: fila.mensaje,
    enlace: fila.enlace,
    leida: fila.leida,
    creadoEn: fila.creado_en,
  };
}
