'use client';

import {
  BUCKET_ARCHIVOS_ORDEN,
  LIMITE_ARCHIVO_ORDEN,
  type ArchivoOrdenResumen,
} from '@/modulos/ordenes/archivos-orden-config';
import {
  confirmarArchivoOrdenAccion,
  descartarSubidaArchivoOrdenAccion,
  prepararSubidaArchivoOrdenAccion,
} from '@/modulos/ordenes/acciones/archivos-orden';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';

/** El navegador envía el binario a Storage; la acción solo recibe metadatos. */
export async function subirArchivoOrdenDesdeNavegador(
  ordenId: string,
  archivo: File,
): Promise<ArchivoOrdenResumen> {
  if (archivo.size < 1 || archivo.size > LIMITE_ARCHIVO_ORDEN) {
    throw new Error('Selecciona un archivo de hasta 20 MiB');
  }
  let rutaPendiente: string | null = null;
  try {
    const preparada = await prepararSubidaArchivoOrdenAccion({
      ordenId,
      nombre: archivo.name,
      mime: archivo.type,
      tamano: archivo.size,
    });
    if (!preparada.exito || !preparada.datos) {
      throw new Error(preparada.exito ? 'No se pudo preparar el archivo' : preparada.error);
    }
    rutaPendiente = preparada.datos.ruta;
    const { error } = await crearClienteSupabase().storage.from(BUCKET_ARCHIVOS_ORDEN)
      .uploadToSignedUrl(rutaPendiente, preparada.datos.token, archivo, {
        contentType: preparada.datos.mime,
      });
    if (error) throw new Error('No se pudo subir el archivo');
    const confirmada = await confirmarArchivoOrdenAccion({
      ordenId,
      ruta: rutaPendiente,
      nombre: archivo.name,
    });
    if (!confirmada.exito || !confirmada.datos) {
      throw new Error(confirmada.exito ? 'No se pudo vincular el archivo' : confirmada.error);
    }
    rutaPendiente = null;
    return confirmada.datos;
  } catch (error) {
    if (rutaPendiente) await descartarSubidaArchivoOrdenAccion({ ruta: rutaPendiente });
    throw error;
  }
}
