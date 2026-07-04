import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Elimina un archivo de un bucket de Supabase Storage. Es un helper de
 * infraestructura, no una Server Action: lanza `Error` ante fallo.
 */
export async function eliminarArchivo(
  cliente: SupabaseClient,
  bucket: string,
  ruta: string,
): Promise<void> {
  const { error } = await cliente.storage.from(bucket).remove([ruta]);

  if (error) {
    throw new Error(`No se pudo eliminar el archivo: ${error.message}`);
  }
}
