'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { esquemaCambiarEstadoUsuario } from '../validaciones/esquemas-permisos';

/** Mensajes públicos por código de error de la RPC. */
function mensajeError(codigo: string): string {
  if (codigo.includes('no_puede_autodesactivarse')) return 'No puedes desactivar tu propio acceso';
  if (codigo.includes('ultimo_admin')) return 'Debe quedar al menos un administrador activo';
  if (codigo.includes('usuario_no_encontrado')) return 'El usuario no existe';
  if (codigo.includes('motivo_requerido')) return 'Indica un motivo';
  return 'No se pudo cambiar el estado del usuario';
}

/** Activa o desactiva un usuario (solo admin activo, con motivo). */
export async function cambiarEstadoUsuarioAccion(entrada: unknown): Promise<RespuestaAccion> {
  const resultado = esquemaCambiarEstadoUsuario.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede cambiar el estado de un usuario' };
  }

  const { usuarioId, activo, motivo } = resultado.data;
  const clienteAdmin = crearClienteSupabaseAdmin();
  const { error } = await clienteAdmin.rpc('cambiar_estado_usuario', {
    p_usuario_id: usuarioId,
    p_activo: activo,
    p_actor_id: usuario.id,
    p_motivo: motivo,
  });

  if (error) {
    console.error('[USUARIOS] Error al cambiar estado:', error.message);
    await registrarLog(usuario, 'cambiar_estado_usuario_rechazado', 'usuarios', usuarioId, {
      codigo: error.message.slice(0, 120),
    });
    return { exito: false, error: mensajeError(error.message) };
  }

  await registrarLog(usuario, 'cambiar_estado_usuario', 'usuarios', usuarioId, { activo, motivo });
  return { exito: true };
}
