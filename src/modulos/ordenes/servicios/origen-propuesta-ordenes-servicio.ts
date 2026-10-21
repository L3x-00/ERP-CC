import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';

/**
 * Propuesta de origen de una orden de la cola, por lista blanca: folio humano, el id que
 * arma el enlace y la letra de la revisión aceptada. Nunca trae precios, costos ni snapshot.
 */
export interface OrigenPropuestaOrden {
  propuestaId: string;
  propuestaFolio: string;
  revisionLetra: string | null;
}

/**
 * Relación congelada de la orden: `propuesta_revision_id` (inmutable tras crearla) → su
 * revisión → la propuesta padre. No usa `cotizacion_id` (RFQ/cotización legacy) ni la
 * revisión vigente de la propuesta, que puede ser posterior a la aceptada.
 */
const SELECCION_ORIGEN_PROPUESTA =
  'id, propuesta_revisiones!ordenes_produccion_propuesta_revision_id_fkey('
  + 'letra, propuestas!propuesta_revisiones_propuesta_id_fkey(id, folio_cnc))';

/** Forma del embed (muchos-a-uno en ambos saltos); `null` si la orden no tiene revisión aceptada. */
type FilaOrigenCruda = {
  id: string;
  propuesta_revisiones: {
    letra: string;
    propuestas: { id: string; folio_cnc: string } | null;
  } | null;
};

/**
 * Resuelve la propuesta de origen de las órdenes recibidas (ids ya filtrados por la lectura
 * del usuario) con una consulta por lote de 100, sin N+1 ni URLs de miles de ids (414).
 *
 * Se lee con el cliente de servicio porque el folio es visible para todo rol con
 * `orden_vista` (igual que el origen de la ficha) aunque la RLS de `propuestas` lo oculte;
 * el permiso `propuesta_vista` solo decide si el folio se muestra como enlace. Una orden sin
 * revisión aceptada (interna manual, histórica) no aparece en el resultado: no se inventa origen.
 * Un error de lectura se propaga: no se confunde «sin origen» con «no se pudo leer».
 */
export async function obtenerOrigenPropuestaOrdenesServicio(
  admin: SupabaseClient<Database>,
  ordenIds: readonly string[],
): Promise<Record<string, OrigenPropuestaOrden>> {
  const origenes: Record<string, OrigenPropuestaOrden> = {};
  if (ordenIds.length === 0) return origenes;

  const filas = (
    await Promise.all(dividirEnLotes(ordenIds).map(async (lote) => {
      const { data, error } = await admin
        .from('ordenes_produccion')
        .select(SELECCION_ORIGEN_PROPUESTA)
        .in('id', lote);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as FilaOrigenCruda[];
    }))
  ).flat();

  for (const fila of filas) {
    const revision = fila.propuesta_revisiones;
    const propuesta = revision?.propuestas;
    const folio = propuesta?.folio_cnc.trim();
    if (!revision || !propuesta || !folio) continue;
    origenes[fila.id] = {
      propuestaId: propuesta.id,
      propuestaFolio: folio,
      revisionLetra: revision.letra.trim() === '' ? null : revision.letra,
    };
  }
  return origenes;
}
