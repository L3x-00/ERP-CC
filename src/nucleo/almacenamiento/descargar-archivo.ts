import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Genera una URL firmada temporal para descargar un archivo de un bucket privado.
 * Es un helper de infraestructura, no una Server Action: lanza `Error` ante fallo.
 *
 * @param segundos Vigencia de la URL en segundos (por defecto 3600 = 1 hora).
 */
export async function crearUrlDescarga(
  cliente: SupabaseClient,
  bucket: string,
  ruta: string,
  segundos = 3600,
): Promise<string> {
  const { data, error } = await cliente.storage
    .from(bucket)
    .createSignedUrl(ruta, segundos);

  if (error || !data) {
    throw new Error(
      `No se pudo generar la URL de descarga: ${error?.message ?? 'error desconocido'}`,
    );
  }

  return data.signedUrl;
}
