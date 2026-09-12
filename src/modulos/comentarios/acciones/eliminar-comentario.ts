'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  eliminarComentario,
  mensajeErrorComentarios,
  obtenerComentarioPorId,
  usuarioPuedeVerEntidadComentario,
} from '@/modulos/comentarios/servicios/indice';
import { esquemaEliminarComentario } from '@/modulos/comentarios/validaciones/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Marca un comentario como eliminado si el autor o un administrador lo solicita. */
export async function eliminarComentarioAccion(entrada: unknown): Promise<RespuestaAccion<undefined>> {
  const analisis = esquemaEliminarComentario.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const admin = crearClienteSupabaseAdmin();
    const comentario = await obtenerComentarioPorId(admin, analisis.data.comentarioId);
    if (!comentario) return { exito: false, error: 'El comentario ya no está disponible' };
    // La eliminación de comentarios ajenos es una excepción de administrador,
    // no un permiso CRUD genérico que otro rol pudiera recibir por catálogo.
    const esAdmin = usuario.rol === 'admin';
    if (comentario.autor_id !== usuario.id && !esAdmin) {
      await registrarLog(usuario, 'eliminar_comentario_rechazado', 'comentarios', comentario.id, {
        motivo: 'autoría',
      });
      return { exito: false, error: 'No puedes eliminar este comentario' };
    }
    if (comentario.autor_id === usuario.id && !esAdmin) {
      const acceso = await usuarioPuedeVerEntidadComentario(
        await crearClienteSupabaseServidor(),
        usuario,
        comentario.entidad_tipo as 'orden' | 'cotizacion' | 'cliente',
        comentario.entidad_id,
      );
      if (!acceso) return { exito: false, error: 'No tienes acceso a este registro' };
    }
    await eliminarComentario(admin, comentario.id);
    await registrarLog(usuario, 'eliminar_comentario', 'comentarios', comentario.id, {
      entidadTipo: comentario.entidad_tipo,
      entidadId: comentario.entidad_id,
    });
    return { exito: true };
  } catch (error) {
    console.error('[COMENTARIOS] Error al eliminar comentario:', error);
    await registrarLog(usuario, 'eliminar_comentario_rechazado', 'comentarios', analisis.data.comentarioId, {
      codigo: 'error_servicio_comentarios',
    });
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
