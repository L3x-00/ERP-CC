'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { marcarNotificacionComoLeida, mensajeErrorComentarios } from '@/modulos/comentarios/servicios/indice';
import { esquemaMarcarNotificacionLeida } from '@/modulos/comentarios/validaciones/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Marca una notificación propia; el usuario nunca se recibe desde el cliente. */
export async function marcarNotificacionesLeidasAccion(
  entrada: unknown,
): Promise<RespuestaAccion<undefined>> {
  const analisis = esquemaMarcarNotificacionLeida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  try {
    await marcarNotificacionComoLeida(
      crearClienteSupabaseAdmin(),
      analisis.data.notificacionId,
      usuario.id,
    );
    await registrarLog(usuario, 'marcar_notificacion_leida', 'comentarios', analisis.data.notificacionId);
    return { exito: true };
  } catch (error) {
    console.error('[COMENTARIOS] Error al marcar notificación:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
