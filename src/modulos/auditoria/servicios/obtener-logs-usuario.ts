import type { SupabaseClient } from '@supabase/supabase-js';

import { REGISTROS_POR_PAGINA } from '@/compartido/constantes/indice';
import type { Paginacion } from '@/compartido/tipos/indice';

import { filaALog, type FilaLog, type Log } from '../tipos/indice';

/**
 * Obtiene los logs de auditoría de un usuario, del más reciente al más antiguo.
 * La visibilidad final la decide RLS según el cliente recibido.
 * Ante un error de consulta retorna arreglo vacío.
 *
 * @param cliente - Cliente Supabase (navegador, servidor o admin según el contexto).
 * @param usuarioId - UUID del usuario cuyas acciones se consultan.
 * @param paginacion - Página y tamaño de página (default: página 1, REGISTROS_POR_PAGINA).
 * @returns Arreglo de logs de la página solicitada.
 */
export async function obtenerLogsUsuario(
  cliente: SupabaseClient,
  usuarioId: string,
  paginacion?: Paginacion,
): Promise<Log[]> {
  const pagina = paginacion?.pagina ?? 1;
  const porPagina = paginacion?.porPagina ?? REGISTROS_POR_PAGINA;
  const indiceInicial = (pagina - 1) * porPagina;

  const { data, error } = await cliente
    .from('logs')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('creado_en', { ascending: false })
    .range(indiceInicial, indiceInicial + porPagina - 1);

  if (error) {
    console.error('[AUDITORIA] Error al obtener logs del usuario:', error.message);
    return [];
  }

  return ((data ?? []) as FilaLog[]).map(filaALog);
}
