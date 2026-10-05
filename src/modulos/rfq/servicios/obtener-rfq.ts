import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import {
  filaARfq,
  filaARfqItem,
  type FilaRfq,
  type FilaRfqItem,
  type FilaRfqItemOperacion,
  type Rfq,
  type RfqItemOperacion,
} from '../tipos/indice';

const COLUMNAS_RFQ =
  'id, folio_op, folio_cnc, folio_rfq, estado_rfq, etapa, cliente_id, contacto_id, vendedor_id, responsable_id, canal, fecha_solicitud, descripcion_general, proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion, responsable_proxima_accion_id, actualizado_en';

const COLUMNAS_ITEM =
  'id, rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id, acabado, notas, estado, creado_en, actualizado_en';

/**
 * Obtiene un RFQ con sus ítems y operaciones. Devuelve null si no existe o si
 * la consulta falla; la visibilidad final la decide el cliente recibido.
 *
 * @param cliente - Cliente Supabase (servidor, navegador o admin).
 * @param rfqId - UUID del RFQ (fila de `pipeline`).
 * @returns RFQ de dominio con ítems ordenados por número, o null.
 */
export async function obtenerRfqConItems(
  cliente: SupabaseClient<Database>,
  rfqId: string,
): Promise<Rfq | null> {
  const { data: fila, error } = await cliente
    .from('pipeline')
    .select(COLUMNAS_RFQ)
    .eq('id', rfqId)
    .maybeSingle();

  if (error) {
    console.error('[RFQ] Error al obtener el RFQ:', error.message);
    return null;
  }
  if (!fila) return null;

  const { data: filasItems, error: errorItems } = await cliente
    .from('rfq_items')
    .select(COLUMNAS_ITEM)
    .eq('rfq_id', rfqId)
    .order('numero');

  if (errorItems) {
    console.error('[RFQ] Error al obtener los ítems:', errorItems.message);
    return null;
  }

  const idsItems = (filasItems ?? []).map((item) => item.id);
  const operacionesPorItem = new Map<string, RfqItemOperacion[]>();

  if (idsItems.length > 0) {
    const { data: filasOperaciones, error: errorOperaciones } = await cliente
      .from('rfq_item_operaciones')
      .select('rfq_item_id, proceso_id, orden')
      .in('rfq_item_id', idsItems)
      .order('orden');

    if (errorOperaciones) {
      console.error('[RFQ] Error al obtener las operaciones:', errorOperaciones.message);
      return null;
    }

    for (const operacion of (filasOperaciones ?? []) as FilaRfqItemOperacion[]) {
      const lista = operacionesPorItem.get(operacion.rfq_item_id) ?? [];
      lista.push({ procesoId: operacion.proceso_id, orden: operacion.orden });
      operacionesPorItem.set(operacion.rfq_item_id, lista);
    }
  }

  const items = (filasItems ?? []).map((item) =>
    filaARfqItem(item as FilaRfqItem, operacionesPorItem.get(item.id) ?? []),
  );

  return filaARfq(fila as unknown as FilaRfq, items);
}
