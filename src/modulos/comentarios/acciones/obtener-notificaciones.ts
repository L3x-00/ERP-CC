'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeErrorComentarios, obtenerNotificacionesUsuario } from '@/modulos/comentarios/servicios/indice';
import type { NotificacionUsuario } from '@/modulos/comentarios/tipos/indice';
import { esquemaConsultaNotificaciones } from '@/modulos/comentarios/validaciones/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Consulta el centro de notificaciones del usuario autenticado. */
export async function obtenerNotificacionesAccion(
  entrada: unknown = {},
): Promise<RespuestaAccion<NotificacionUsuario[]>> {
  const analisis = esquemaConsultaNotificaciones.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const notificaciones = await obtenerNotificacionesUsuario(
      crearClienteSupabaseAdmin(),
      usuario.id,
      analisis.data,
    );
    return { exito: true, datos: notificaciones };
  } catch (error) {
    console.error('[COMENTARIOS] Error al consultar notificaciones:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
