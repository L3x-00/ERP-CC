'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { esquemaActualizarPermisosRol } from '../validaciones/esquemas-permisos';

/** Mensajes públicos por código de error de la RPC. */
function mensajeError(codigo: string): string {
  if (codigo.includes('admin_permisos_inmutables')) {
    return 'El rol admin siempre tiene todos los permisos';
  }
  if (codigo.includes('permiso_desconocido')) {
    return 'Hay un permiso desconocido o inactivo en la selección';
  }
  if (codigo.includes('rol_invalido')) {
    return 'Rol inválido';
  }
  return 'No se pudieron guardar los permisos';
}

/**
 * Reemplaza la matriz de permisos de un rol editable.
 * La validación de actor se repite en la RPC (defensa en profundidad).
 */
export async function actualizarPermisosRolAccion(entrada: unknown): Promise<RespuestaAccion<number>> {
  const resultado = esquemaActualizarPermisosRol.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede administrar permisos' };
  }

  const { rol, permisos } = resultado.data;
  const clienteAdmin = crearClienteSupabaseAdmin();
  const { data, error } = await clienteAdmin.rpc('actualizar_permisos_rol', {
    p_rol: rol,
    p_permisos: permisos,
    p_actor_id: usuario.id,
  });

  if (error) {
    console.error('[PERMISOS] Error al actualizar matriz:', error.message);
    await registrarLog(usuario, 'actualizar_permisos_rol_rechazado', 'permisos', rol, {
      codigo: error.message.slice(0, 120),
    });
    return { exito: false, error: mensajeError(error.message) };
  }

  await registrarLog(usuario, 'actualizar_permisos_rol', 'permisos', rol, {
    rol,
    total: permisos.length,
  });
  return { exito: true, datos: data ?? undefined };
}
