'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorComentarios,
  obtenerComentariosPorEntidad,
  usuarioPuedeVerEntidadComentario,
} from '@/modulos/comentarios/servicios/indice';
import type { ComentarioRegistro } from '@/modulos/comentarios/tipos/indice';
import { esquemaConsultaComentarios } from '@/modulos/comentarios/validaciones/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Consulta un hilo autorizado y devuelve sólo comentarios no eliminados. */
export async function obtenerComentariosAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ComentarioRegistro[]>> {
  const analisis = esquemaConsultaComentarios.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const tieneAcceso = await usuarioPuedeVerEntidadComentario(
      await crearClienteSupabaseServidor(),
      usuario,
      analisis.data.entidadTipo,
      analisis.data.entidadId,
    );
    if (!tieneAcceso) return { exito: false, error: 'No tienes acceso a este registro' };
    const comentarios = await obtenerComentariosPorEntidad(
      crearClienteSupabaseAdmin(),
      analisis.data.entidadTipo,
      analisis.data.entidadId,
    );
    await registrarLog(usuario, 'consultar_comentarios', 'comentarios', analisis.data.entidadId, {
      entidadTipo: analisis.data.entidadTipo,
      cantidad: comentarios.length,
    });
    return { exito: true, datos: comentarios };
  } catch (error) {
    console.error('[COMENTARIOS] Error al consultar hilo:', error);
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
