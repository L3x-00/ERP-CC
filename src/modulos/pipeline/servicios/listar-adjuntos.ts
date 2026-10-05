import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

/** Adjunto de una oportunidad tal como se presenta al usuario (DOC-04). */
export interface ArchivoAdjunto {
  /** Id de metadata en `archivos` (SII-B1.9). */
  id: string;
  /** Ruta exacta en el bucket. */
  ruta: string;
  /** Nombre original del archivo. */
  nombre: string;
  /** Tamaño en bytes. */
  tamano: number | null;
  /** Tipo MIME. */
  tipo: string | null;
  /** Fecha de subida (ISO). */
  creadoEn: string | null;
}

/**
 * Lista los adjuntos vigentes de una oportunidad desde el modelo único
 * `archivos` (entidad `rfq`). La RLS del usuario decide las filas visibles
 * (dueño del RFQ, `ver_pipeline_equipo` o admin), por lo que este servicio debe
 * recibir el cliente RLS del usuario, no el admin.
 */
export async function listarAdjuntosOportunidad(
  cliente: SupabaseClient<Database>,
  pipelineId: string,
): Promise<ArchivoAdjunto[]> {
  const { data, error } = await cliente
    .from('archivos')
    .select('id, ruta_storage, nombre_original, tamano_bytes, mime, creado_en')
    .eq('entidad', 'rfq')
    .eq('entidad_id', pipelineId)
    .eq('vigente', true)
    .order('creado_en', { ascending: false })
    .limit(200);
  if (error) throw error;

  return (data ?? []).map((fila) => ({
    id: fila.id,
    ruta: fila.ruta_storage,
    nombre: fila.nombre_original,
    tamano: fila.tamano_bytes,
    tipo: fila.mime,
    creadoEn: fila.creado_en,
  }));
}
