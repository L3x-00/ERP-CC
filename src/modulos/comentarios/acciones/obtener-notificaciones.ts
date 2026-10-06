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

  const admin = crearClienteSupabaseAdmin();
  // SII-B8 F3: los recordatorios de promesas se materializan al abrir el centro
  // de notificaciones (idempotente; no bloquea si falla).
  try {
    await admin.rpc('procesar_recordatorios_promesas', { p_actor_id: null });
  } catch (error) {
    console.error('[COMENTARIOS] Recordatorios de promesas no procesados:', error);
  }

  try {
    const notificaciones = await obtenerNotificacionesUsuario(
      admin,
      usuario.id,
      analisis.data,
    );
    return { exito: true, datos: notificaciones };
  } catch (error) {
    console.error('[COMENTARIOS] Error al consultar notificaciones:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
