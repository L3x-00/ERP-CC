'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { esquemaPermisoRol } from '../validaciones/esquemas-permisos';

/**
 * Server Action: revoca un permiso de un rol (delete en permisos_rol).
 * Requiere rol 'admin' explícito — ver nota en `asignar-permiso.ts` sobre
 * por qué esto no se gatea con `can(usuario, 'configuracion')`.
 * Idempotente: revocar un permiso no asignado no falla.
 *
 * @param entrada - Datos sin validar con la forma `{ rol, permiso }`.
 * @returns Respuesta estándar de acción; nunca lanza para errores esperados.
 */
export async function revocarPermisoAccion(entrada: unknown): Promise<RespuestaAccion> {
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
    .delete()
    .eq('rol', rol)
    .eq('permiso', permiso);

  if (error) {
    console.error('[PERMISOS] Error al revocar permiso:', error.message);
    return { exito: false, error: 'No se pudo revocar el permiso' };
  }

  await registrarLog(usuario, 'revocar_permiso', 'permisos', `${rol}:${permiso}`, {
    rol,
    permiso,
  });

  return { exito: true };
}
