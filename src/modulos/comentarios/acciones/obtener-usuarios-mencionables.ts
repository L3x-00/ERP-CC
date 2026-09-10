'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeErrorComentarios, obtenerUsuariosMencionables } from '@/modulos/comentarios/servicios/indice';
import type { MencionUsuario } from '@/modulos/comentarios/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Lista nombres activos para el autocompletado, sin devolver PIN ni correo. */
export async function obtenerUsuariosMencionablesAccion(): Promise<RespuestaAccion<MencionUsuario[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  try {
    return { exito: true, datos: await obtenerUsuariosMencionables(crearClienteSupabaseAdmin()) };
  } catch (error) {
    console.error('[COMENTARIOS] Error al consultar usuarios mencionables:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
