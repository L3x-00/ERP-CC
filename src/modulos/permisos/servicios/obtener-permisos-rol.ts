import type { SupabaseClient } from '@supabase/supabase-js';

import type { FilaPermisoRol } from '../tipos/indice';

/**
 * Obtiene la lista de permisos asignados a un rol desde la tabla permisos_rol.
 * Ante un error de consulta retorna arreglo vacío (fail-closed: sin permisos).
 *
 * @param cliente - Cliente Supabase (navegador, servidor o admin según el contexto).
 * @param rol - Rol a consultar (ej. 'vendedor').
 * @returns Arreglo de permisos del rol (vacío si no tiene o hubo error).
 */
export async function obtenerPermisosRol(cliente: SupabaseClient, rol: string): Promise<string[]> {
  const { data, error } = await cliente.from('permisos_rol').select('permiso').eq('rol', rol);

  if (error) {
    console.error('[PERMISOS] Error al obtener permisos del rol:', error.message);
    return [];
  }

  const filas = (data ?? []) as Array<Pick<FilaPermisoRol, 'permiso'>>;
  return filas.map((fila) => fila.permiso);
}
