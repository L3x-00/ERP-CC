import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACliente,
  filaADocumentoCliente,
  type Cliente,
  type DocumentoCliente,
} from '@/modulos/clientes/tipos/indice';
import { calcularConsumoUltimos3Meses } from '@/modulos/clientes/servicios/calcular-consumo';
import { obtenerCreditoUsado } from '@/modulos/clientes/servicios/credito-usado';

/** Cliente con documentos y resumen financiero calculado (ficha 360°). */
export type ClienteConDocumentos = {
  cliente: Cliente;
  documentos: DocumentoCliente[];
  /** Consumo MXN de los últimos 3 meses (AR no cancelada); 0 si RLS lo oculta. */
  consumoUltimos3Meses: number;
  /** Suma de saldos AR pendientes/parciales en MXN; 0 si RLS lo oculta. */
  creditoUsado: number;
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

  const [consumoUltimos3Meses, creditoUsado] = await Promise.all([
    calcularConsumoUltimos3Meses(cliente, id),
    obtenerCreditoUsado(cliente, id),
  ]);

  return {
    cliente: filaACliente(fila),
    documentos: (docs ?? []).map(filaADocumentoCliente),
    consumoUltimos3Meses,
    creditoUsado,
  };
}
