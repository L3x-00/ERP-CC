import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACliente,
  filaADocumentoCliente,
  type Cliente,
  type DocumentoCliente,
} from '@/modulos/clientes/tipos/indice';

/** Cliente con sus documentos adjuntos (ficha 360°). */
export type ClienteConDocumentos = {
  cliente: Cliente;
  documentos: DocumentoCliente[];
};

/**
 * Carga un cliente por id junto con sus documentos. El alcance lo impone RLS.
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param id Identificador del cliente.
 * @returns El cliente con sus documentos, o `null` si no existe/no es visible.
 * @throws Error si la consulta del cliente falla por un motivo distinto a "no existe".
 */
export async function obtenerClientePorId(
  cliente: SupabaseClient<Database>,
  id: string,
): Promise<ClienteConDocumentos | null> {
  const { data: fila, error } = await cliente
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('No se pudo cargar el cliente');
  }
  if (!fila) {
    return null;
  }

  const { data: docs } = await cliente
    .from('documentos_cliente')
    .select('*')
    .eq('cliente_id', id)
    .order('creado_en', { ascending: false });

  return {
    cliente: filaACliente(fila),
    documentos: (docs ?? []).map(filaADocumentoCliente),
  };
}
