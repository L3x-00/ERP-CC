import type { SupabaseClient } from '@supabase/supabase-js';

import { PERMISOS } from '@/compartido/constantes/indice';
import type { Usuario } from '@/modulos/autenticacion/tipos/indice';

import { obtenerPermisosRol } from './obtener-permisos-rol';

/**
 * Resuelve los permisos efectivos de un usuario según su rol.
 * El rol 'admin' recibe los 10 permisos del sistema sin consultar la BD;
 * el resto de roles consulta la tabla permisos_rol.
 *
 * @param cliente - Cliente Supabase (navegador, servidor o admin según el contexto).
 * @param usuario - Usuario cuyos permisos se resuelven.
 * @returns Arreglo de permisos efectivos del usuario.
 */
export async function obtenerPermisosUsuario(
  cliente: SupabaseClient,
  usuario: Usuario,
): Promise<string[]> {
  if (usuario.rol === 'admin') {
    return [...PERMISOS];
  }

  return obtenerPermisosRol(cliente, usuario.rol);
}
