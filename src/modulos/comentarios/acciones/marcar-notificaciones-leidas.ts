'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  marcarNotificacionComoLeida,
  marcarNotificacionesComoLeidas,
  mensajeErrorComentarios,
} from '@/modulos/comentarios/servicios/indice';
import { esquemaMarcarNotificacionLeida } from '@/modulos/comentarios/validaciones/indice';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Marca una notificación propia; el usuario nunca se recibe desde el cliente. */
export async function marcarNotificacionesLeidasAccion(
  entrada: unknown,
): Promise<RespuestaAccion<undefined>> {
  const correlationId = nuevoCorrelationId();
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
    await registrarLog(usuario, 'marcar_notificacion_leida', 'comentarios', analisis.data.notificacionId, undefined, correlationId);
    return { exito: true };
  } catch (error) {
    console.error('[COMENTARIOS] Error al marcar notificación:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}

/**
 * Limpia el centro de notificaciones: marca como leídas todas las pendientes
 * del usuario autenticado. Devuelve cuántas se actualizaron para que la UI
 * confirme el efecto sin inventar un contador optimista.
 */
export async function marcarTodasNotificacionesLeidasAccion(): Promise<RespuestaAccion<number>> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  try {
    const actualizadas = await marcarNotificacionesComoLeidas(
      crearClienteSupabaseAdmin(),
      usuario.id,
    );
    await registrarLog(
      usuario,
      'marcar_todas_notificaciones_leidas',
      'comentarios',
      usuario.id,
      { actualizadas },
      correlationId,
    );
    return { exito: true, datos: actualizadas };
  } catch (error) {
    console.error('[COMENTARIOS] Error al marcar todas las notificaciones:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
