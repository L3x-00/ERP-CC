import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import { archivosReferenciados, type SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';
import {
  derivarArchivosFicha,
  type FilaArchivoFicha,
  type VinculoItemFicha,
} from '@/modulos/ordenes/utilidades/derivar-archivos-ficha';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';

// Sin ruta de almacenamiento ni bucket: la ficha solo describe el archivo, no lo localiza.
const COLUMNAS_ARCHIVO_FICHA =
  'id, entidad, entidad_id, clase, nombre_original, nombre_erp, vigente, retirado_en';

/**
 * Archivos congelados en la orden, listos para la tabla de la ficha. Lee solo los ids del snapshot
 * (nunca la carpeta viva del RFQ) en lotes de 100 y resuelve el ITxx de los archivos de ítems del
 * RFQ contra la revisión aceptada. El mismo resultado decide qué archivo se puede abrir.
 */
export async function listarArchivosFichaOrden(
  cliente: SupabaseClient<Database>,
  entrada: { snapshot: SnapshotOrdenSii | null; propuestaRevisionId: string | null },
): Promise<ArchivoFicha[]> {
  if (!entrada.snapshot) return [];
  const ids = archivosReferenciados(entrada.snapshot);
  if (ids.length === 0) return [];

  const respuestas = await Promise.all(dividirEnLotes(ids).map((lote) => cliente
    .from('archivos')
    .select(COLUMNAS_ARCHIVO_FICHA)
    .in('id', lote)));
  const filas: FilaArchivoFicha[] = [];
  for (const respuesta of respuestas) {
    if (respuesta.error) throw respuesta.error;
    filas.push(...(respuesta.data ?? []));
  }

  const idsItemRfq = [...new Set(filas.filter((fila) => fila.entidad === 'rfq_item').map((fila) => fila.entidad_id))];
  const vinculos: VinculoItemFicha[] = [];
  if (idsItemRfq.length > 0 && entrada.propuestaRevisionId) {
    const revisionId = entrada.propuestaRevisionId;
    const respuestasItems = await Promise.all(dividirEnLotes(idsItemRfq).map((lote) => cliente
      .from('propuesta_items')
      .select('rfq_item_id, codigo')
      .eq('revision_id', revisionId)
      .in('rfq_item_id', lote)));
    for (const respuesta of respuestasItems) {
      if (respuesta.error) throw respuesta.error;
      vinculos.push(...(respuesta.data ?? []));
    }
  }

  return derivarArchivosFicha(entrada.snapshot, filas, vinculos);
}
