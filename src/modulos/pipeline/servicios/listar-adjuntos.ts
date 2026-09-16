import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';

/** Adjunto de una oportunidad tal como se presenta al usuario (DOC-04). */
export interface ArchivoAdjunto {
  /** Ruta completa en el bucket: `<pipelineId>/<archivo>`. */
  ruta: string;
  /** Nombre original, sin el prefijo de marca de tiempo con que se almacena. */
  nombre: string;
  /** Tamaño en bytes; `null` si el almacenamiento no lo reporta. */
  tamano: number | null;
  /** Tipo MIME; `null` si no está disponible. */
  tipo: string | null;
  /** Fecha de subida (ISO); `null` si no está disponible. */
  creadoEn: string | null;
}

/**
 * Lista los adjuntos de una oportunidad. Los archivos viven bajo el prefijo
 * `<pipelineId>/`, así que listar el prefijo equivale a listar los adjuntos, sin
 * tabla de metadatos aparte. La RLS de `storage.objects` (migración
 * 20260706000006) restringe la lectura al dueño de la oportunidad, admin o
 * `ver_pipeline_equipo`, de modo que este servicio debe recibir el cliente RLS
 * del usuario (no el admin).
 */
export async function listarAdjuntosOportunidad(
  cliente: SupabaseClient,
  pipelineId: string,
): Promise<ArchivoAdjunto[]> {
  const { data, error } = await cliente.storage
    .from(BUCKET_ADJUNTOS)
    .list(pipelineId, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;

  return (data ?? [])
    // `.list()` puede incluir un marcador de carpeta vacía (id null) que no es un archivo real.
    .filter((objeto) => objeto.id !== null && objeto.name !== '.emptyFolderPlaceholder')
    .map((objeto) => {
      const metadatos = (objeto.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
      return {
        ruta: `${pipelineId}/${objeto.name}`,
        nombre: objeto.name.replace(/^\d+-/, ''),
        tamano: typeof metadatos.size === 'number' ? metadatos.size : null,
        tipo: typeof metadatos.mimetype === 'string' ? metadatos.mimetype : null,
        creadoEn: objeto.created_at ?? null,
      };
    });
}
