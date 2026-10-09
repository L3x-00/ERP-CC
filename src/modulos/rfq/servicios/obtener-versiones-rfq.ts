import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import { normalizarVersionRfq, type VersionRfq } from '../tipos/indice';

const COLUMNAS_VERSION =
  'id, numero, causa, snapshot_cabecera, snapshot_items, actor_id, creado_en';

/**
 * Lee las versiones registradas de un RFQ, de la más reciente a la más antigua,
 * y resuelve el nombre del actor sin filtrar por `activo`. Un fallo al resolver
 * actores deja `actorNombre` en null y nunca rompe el listado.
 */
export async function listarVersionesRfq(
  cliente: SupabaseClient<Database>,
  rfqId: string,
): Promise<VersionRfq[]> {
  const { data, error } = await cliente
    .from('rfq_versiones')
    .select(COLUMNAS_VERSION)
    .eq('rfq_id', rfqId)
    .order('numero', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[RFQ] Error al obtener las versiones:', error.message);
    return [];
  }

  const filas = data ?? [];
  const idsActores = Array.from(
    new Set(
      filas
        .map((fila) => fila.actor_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );

  const nombresPorActor = new Map<string, string>();
  if (idsActores.length > 0) {
    const { data: usuarios } = await cliente
      .from('usuarios')
      .select('id, nombre_completo')
      .in('id', idsActores);
    for (const usuario of usuarios ?? []) {
      nombresPorActor.set(usuario.id, usuario.nombre_completo);
    }
  }

  return filas
    .map((fila) =>
      normalizarVersionRfq(
        fila,
        fila.actor_id ? nombresPorActor.get(fila.actor_id) ?? null : null,
      ),
    )
    .filter((version): version is VersionRfq => version !== null);
}
