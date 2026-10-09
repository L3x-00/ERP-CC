import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import {
  filaARfq,
  filaARfqItem,
  type FilaRfq,
  type FilaRfqItem,
  type FilaRfqItemOperacion,
  type NombresResueltosRfq,
  type Rfq,
  type RfqItemOperacion,
} from '../tipos/indice';

const COLUMNAS_RFQ =
  'id, folio_op, folio_cnc, folio_rfq, estado_rfq, etapa, cliente_id, condiciones_pago, empresa, contacto_id, nombre_contacto, vendedor_id, responsable_id, canal, canal_detalle, fecha_solicitud, fecha_requerida, descripcion_general, proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion, responsable_proxima_accion_id, actualizado_en';

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

  const filaTipada = fila as unknown as FilaRfq;
  const resueltos = await resolverNombresRfq(cliente, filaTipada);

  return filaARfq(filaTipada, items, resueltos);
}

/**
 * Resuelve cliente/contacto/responsables por id, sin filtrar por `activo`:
 * un responsable histórico desactivado debe seguir siendo legible en el
 * Resumen del RFQ. Un fallo de alguna consulta deja ese nombre en null (la
 * ficha cae al fallback legado de `pipeline`), nunca rompe la carga del RFQ.
 */
async function resolverNombresRfq(
  cliente: SupabaseClient<Database>,
  fila: FilaRfq,
): Promise<NombresResueltosRfq> {
  const idsResponsables = Array.from(
    new Set(
      [fila.responsable_id, fila.responsable_proxima_accion_id].filter(
        (valor): valor is string => Boolean(valor),
      ),
    ),
  );

  const [clienteResuelto, contactoResuelto, usuariosResueltos] = await Promise.all([
    fila.cliente_id
      ? cliente
          .from('clientes')
          .select('nombre_comercial, razon_social')
          .eq('id', fila.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fila.contacto_id
      ? cliente.from('contactos_cliente').select('nombre').eq('id', fila.contacto_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    idsResponsables.length > 0
      ? cliente.from('usuarios').select('id, nombre_completo').in('id', idsResponsables)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const nombresPorUsuario = new Map<string, string>();
  for (const usuario of usuariosResueltos.data ?? []) {
    nombresPorUsuario.set(usuario.id, usuario.nombre_completo);
  }

  return {
    clienteNombre:
      clienteResuelto.data?.nombre_comercial.trim() ||
      clienteResuelto.data?.razon_social.trim() ||
      null,
    contactoNombre: contactoResuelto.data?.nombre ?? null,
    responsableNombre: fila.responsable_id
      ? nombresPorUsuario.get(fila.responsable_id) ?? null
      : null,
    responsableProximaAccionNombre: fila.responsable_proxima_accion_id
      ? nombresPorUsuario.get(fila.responsable_proxima_accion_id) ?? null
      : null,
  };
}
