import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sube un archivo a un bucket de Supabase Storage con `upsert:false` (no sobrescribe
 * una ruta existente). Es un helper de infraestructura, no una Server Action: lanza
 * `Error` ante fallo en vez de retornar `RespuestaAccion`, para que el llamador decida
 * cómo traducir el error al usuario.
 *
 * @returns La ruta bajo la que quedó almacenado el archivo.
 */
export async function subirArchivo(
  cliente: SupabaseClient,
  bucket: string,
  ruta: string,
  archivo: File | ArrayBuffer,
  contentType?: string,
): Promise<string> {
  const { error } = await cliente.storage.from(bucket).upload(ruta, archivo, {
    upsert: false,
    contentType,
  });

  if (error) {
    throw new Error(`No se pudo subir el archivo: ${error.message}`);
  }

  return ruta;
}
