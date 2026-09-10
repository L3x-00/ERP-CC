import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import {
  filaAComentario,
  filaANotificacion,
  type ComentarioRegistro,
  type FilaComentarioRegistro,
  type FilaNotificacionUsuario,
  type MencionUsuario,
  type NotificacionUsuario,
  type TipoEntidadComentario,
} from '@/modulos/comentarios/tipos/indice';
import type {
  ConsultaNotificacionesInput,
  CrearComentarioInput,
} from '@/modulos/comentarios/validaciones/indice';

export type ClienteComentarios = SupabaseClient<Database>;

export type CodigoErrorComentarios =
  | 'entidad_no_disponible'
  | 'comentario_no_disponible'
  | 'notificacion_no_disponible'
  | 'desconocido';

export class ErrorComentarios extends Error {
  constructor(
    public readonly codigo: CodigoErrorComentarios,
    mensaje?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorComentarios';
  }
}

type FilaUsuarioComentario = Pick<Tables<'usuarios'>, 'id' | 'nombre_completo'>;

const PERMISOS_ORDEN = [
  'ver_clientes',
  'aprobar_ordenes',
  'ver_planeacion',
  'gestionar_produccion',
  'ver_finanzas',
] as const;

function tienePermiso(usuario: UsuarioAutenticado, permiso: string): boolean {
  return usuario.rol === 'admin' || usuario.permisos.includes(permiso);
}

function nombresPorId(filas: FilaUsuarioComentario[] | null | undefined): Map<string, FilaUsuarioComentario> {
  return new Map((filas ?? []).map((fila) => [fila.id, fila]));
}

function codigoDesdeMensaje(mensaje: string | undefined): CodigoErrorComentarios {
  if (mensaje?.includes('entidad_no_disponible')) return 'entidad_no_disponible';
  if (mensaje?.includes('comentario_')) return 'comentario_no_disponible';
  if (mensaje?.includes('notificacion_')) return 'notificacion_no_disponible';
  return 'desconocido';
}

function lanzarErrorComentarios(mensaje?: string): never {
  throw new ErrorComentarios(codigoDesdeMensaje(mensaje), mensaje);
}

/**
 * Repite la frontera de acceso de la política RLS antes de usar `service_role`.
 * Las acciones necesitan el cliente privilegiado para enriquecer autores, pero
 * nunca deben convertirlo en un bypass de autorización de la entidad.
 */
export async function usuarioPuedeVerEntidadComentario(
  cliente: ClienteComentarios,
  usuario: UsuarioAutenticado,
  entidadTipo: TipoEntidadComentario,
  entidadId: string,
): Promise<boolean> {
  if (!usuario.activo) return false;

  if (entidadTipo === 'cliente') {
    if (!tienePermiso(usuario, 'ver_clientes')) return false;
    const { data, error } = await cliente
      .from('clientes')
      .select('id')
      .eq('id', entidadId)
      .maybeSingle();
    return !error && data !== null;
  }

  if (entidadTipo === 'cotizacion') {
    const { data, error } = await cliente
      .from('pipeline')
      .select('id, vendedor_id')
      .eq('id', entidadId)
      .maybeSingle();
    if (error || !data) return false;
    return (
      usuario.rol === 'admin'
      || data.vendedor_id === usuario.id
      || tienePermiso(usuario, 'ver_pipeline_equipo')
    );
  }

  if (!PERMISOS_ORDEN.some((permiso) => tienePermiso(usuario, permiso))) return false;
  const { data, error } = await cliente
    .from('ordenes_produccion')
    .select('id')
    .eq('id', entidadId)
    .maybeSingle();
  return !error && data !== null;
}

/** Carga el hilo activo de una entidad y enriquece los nombres de autor. */
export async function obtenerComentariosPorEntidad(
  cliente: ClienteComentarios,
  entidadTipo: TipoEntidadComentario,
  entidadId: string,
): Promise<ComentarioRegistro[]> {
  const { data, error } = await cliente
    .from('comentarios_registro')
    .select('*')
    .eq('entidad_tipo', entidadTipo)
    .eq('entidad_id', entidadId)
    .eq('eliminado', false)
    .order('creado_en', { ascending: true })
    .limit(200);
  if (error) lanzarErrorComentarios(error.message);

  const filas = (data ?? []) as FilaComentarioRegistro[];
  const idsAutores = [...new Set(filas.map((fila) => fila.autor_id))];
  const autores = idsAutores.length === 0
    ? { data: [] as FilaUsuarioComentario[], error: null }
    : await cliente.from('usuarios').select('id, nombre_completo').in('id', idsAutores);
  if (autores.error) lanzarErrorComentarios(autores.error.message);
  const porId = nombresPorId(autores.data);
  return filas.map((fila) => filaAComentario(fila, porId.get(fila.autor_id) ?? null));
}

/** Inserta un comentario; el trigger de Postgres crea sus notificaciones. */
export async function insertarComentario(
  admin: ClienteComentarios,
  entrada: CrearComentarioInput,
  contenidoSanitizado: string,
  mencionesJson: string[],
  autorId: string,
): Promise<ComentarioRegistro> {
  const payload: Database['public']['Tables']['comentarios_registro']['Insert'] = {
    entidad_tipo: entrada.entidadTipo,
    entidad_id: entrada.entidadId,
    autor_id: autorId,
    contenido: contenidoSanitizado,
    menciones_json: mencionesJson,
    archivos_adjuntos: [],
  };
  const { data, error } = await admin
    .from('comentarios_registro')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) lanzarErrorComentarios(error?.message);

  const { data: autor, error: errorAutor } = await admin
    .from('usuarios')
    .select('id, nombre_completo')
    .eq('id', autorId)
    .maybeSingle();
  if (errorAutor) lanzarErrorComentarios(errorAutor.message);
  return filaAComentario(data as FilaComentarioRegistro, autor);
}

/** Obtiene un comentario para comprobar autoría antes del borrado lógico. */
export async function obtenerComentarioPorId(
  admin: ClienteComentarios,
  comentarioId: string,
): Promise<FilaComentarioRegistro | null> {
  const { data, error } = await admin
    .from('comentarios_registro')
    .select('*')
    .eq('id', comentarioId)
    .maybeSingle();
  if (error) lanzarErrorComentarios(error.message);
  return data as FilaComentarioRegistro | null;
}

/** Marca un comentario como eliminado sin borrar su traza histórica. */
export async function eliminarComentario(
  admin: ClienteComentarios,
  comentarioId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('comentarios_registro')
    .update({ eliminado: true, editado: true })
    .eq('id', comentarioId)
    .select('id')
    .maybeSingle();
  if (error || !data) lanzarErrorComentarios(error?.message ?? 'comentario_no_disponible');
}

/** Lista notificaciones propias, con límite y filtro de no leídas opcional. */
export async function obtenerNotificacionesUsuario(
  cliente: ClienteComentarios,
  usuarioId: string,
  filtro: ConsultaNotificacionesInput = { soloNoLeidas: false, limite: 30 },
): Promise<NotificacionUsuario[]> {
  let consulta = cliente
    .from('notificaciones_usuario')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('creado_en', { ascending: false })
    .limit(filtro.limite);
  if (filtro.soloNoLeidas) consulta = consulta.eq('leida', false);

  const { data, error } = await consulta;
  if (error) lanzarErrorComentarios(error.message);
  const filas = (data ?? []) as FilaNotificacionUsuario[];
  const idsEmisores = [...new Set(filas.flatMap((fila) => fila.emisor_id ? [fila.emisor_id] : []))];
  const emisores = idsEmisores.length === 0
    ? { data: [] as FilaUsuarioComentario[], error: null }
    : await cliente.from('usuarios').select('id, nombre_completo').in('id', idsEmisores);
  if (emisores.error) lanzarErrorComentarios(emisores.error.message);
  const porId = nombresPorId(emisores.data);
  return filas.map((fila) => filaANotificacion(fila, fila.emisor_id ? porId.get(fila.emisor_id) : null));
}

/** Marca una notificación sólo si pertenece al usuario de la sesión. */
export async function marcarNotificacionComoLeida(
  admin: ClienteComentarios,
  notificacionId: string,
  usuarioId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('notificaciones_usuario')
    .update({ leida: true })
    .eq('id', notificacionId)
    .eq('usuario_id', usuarioId)
    .select('id')
    .maybeSingle();
  if (error || !data) lanzarErrorComentarios(error?.message ?? 'notificacion_no_disponible');
}

/** Lista nombres activos para el autocompletado de menciones. */
export async function obtenerUsuariosMencionables(
  admin: ClienteComentarios,
): Promise<MencionUsuario[]> {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, nombre_completo')
    .eq('activo', true)
    .order('nombre_completo', { ascending: true })
    .limit(200);
  if (error) lanzarErrorComentarios(error.message);
  return (data ?? []).map((usuario) => ({ id: usuario.id, nombre: usuario.nombre_completo }));
}

/** Mensaje seguro para el usuario; el detalle queda en logs del servidor. */
export function mensajeErrorComentarios(error: unknown): string {
  if (error instanceof ErrorComentarios) {
    if (error.codigo === 'entidad_no_disponible') return 'No tienes acceso a este registro';
    if (error.codigo === 'comentario_no_disponible') return 'El comentario ya no está disponible';
    if (error.codigo === 'notificacion_no_disponible') return 'La notificación ya no está disponible';
  }
  return 'No se pudo completar la operación de comentarios';
}
