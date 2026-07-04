'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { esquemaPermisoRol } from '../validaciones/esquemas-permisos';

/**
 * Server Action: asigna un permiso a un rol (upsert en permisos_rol).
 * Requiere rol 'admin' explícito — NO se gatea con `can(usuario,
 * 'configuracion')` a propósito: esta acción puede otorgar CUALQUIER
 * permiso (incluido 'configuracion' a sí misma), así que la acción que
 * controla el RBAC no puede depender de un permiso otorgable dentro del
 * mismo RBAC (auto-escalación si algún día 'configuracion' se asigna a un
 * rol no-admin).
 * Idempotente: si el par (rol, permiso) ya existe no falla (onConflict).
 *
 * @param entrada - Datos sin validar con la forma `{ rol, permiso }`.
 * @returns Respuesta estándar de acción; nunca lanza para errores esperados.
 */
export async function asignarPermisoAccion(entrada: unknown): Promise<RespuestaAccion> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin') {
    return { exito: false, error: 'Sin permiso' };
  }

  const resultado = esquemaPermisoRol.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }

  const { rol, permiso } = resultado.data;
  const clienteAdmin = crearClienteSupabaseAdmin();
  const { error } = await clienteAdmin
    .from('permisos_rol')
    .upsert({ rol, permiso }, { onConflict: 'rol,permiso' });

  if (error) {
    console.error('[PERMISOS] Error al asignar permiso:', error.message);
    return { exito: false, error: 'No se pudo asignar el permiso' };
  }

  await registrarLog(usuario, 'asignar_permiso', 'permisos', `${rol}:${permiso}`, {
    rol,
    permiso,
  });

  return { exito: true };
}
