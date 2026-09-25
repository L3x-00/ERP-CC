'use client';

import {
  BUCKET_ARCHIVOS_SESION, LIMITE_ARCHIVO_SESION,
  type ArchivoSesionResumen, type ClaseArchivoProduccion,
} from '@/modulos/produccion/archivos-sesion-config';
import {
  confirmarArchivoSesionAccion,
  descartarSubidaArchivoSesionAccion,
  prepararSubidaArchivoSesionAccion,
} from '@/modulos/produccion/acciones/archivos-sesion';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';

/** El navegador envía el binario a Storage; la acción solo recibe metadatos. */
export async function subirArchivoSesionDesdeNavegador(
  sesionId: string, clase: ClaseArchivoProduccion, archivo: File,
): Promise<ArchivoSesionResumen> {
  if (archivo.size < 1 || archivo.size > LIMITE_ARCHIVO_SESION) {
    throw new Error('Selecciona un archivo de hasta 20 MiB');
  }
  let rutaPendiente: string | null = null;
  try {
    const preparada = await prepararSubidaArchivoSesionAccion({
      sesionId, clase, nombre: archivo.name, mime: archivo.type, tamano: archivo.size,
    });
    if (!preparada.exito || !preparada.datos) {
      throw new Error(preparada.exito ? 'No se pudo preparar el archivo' : preparada.error);
    }
    rutaPendiente = preparada.datos.ruta;
    const { error } = await crearClienteSupabase().storage.from(BUCKET_ARCHIVOS_SESION)
      .uploadToSignedUrl(rutaPendiente, preparada.datos.token, archivo, { contentType: preparada.datos.mime });
    if (error) throw new Error('No se pudo subir el archivo');
    const confirmada = await confirmarArchivoSesionAccion({
      sesionId, clase, ruta: rutaPendiente, nombre: archivo.name,
    });
    if (!confirmada.exito || !confirmada.datos) {
      throw new Error(confirmada.exito ? 'No se pudo vincular el archivo' : confirmada.error);
    }
    rutaPendiente = null;
    return confirmada.datos;
  } catch (error) {
    if (rutaPendiente) await descartarSubidaArchivoSesionAccion({ ruta: rutaPendiente });
    throw error;
  }
}
