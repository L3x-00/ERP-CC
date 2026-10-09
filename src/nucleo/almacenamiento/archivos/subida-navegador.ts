'use client';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';

import type { SubidaPreparada } from './subida-directa';

/** Server Actions de un flujo de carga: solo reciben metadatos, nunca el binario. */
export type PasosSubidaDirecta<T> = {
  preparar: () => Promise<RespuestaAccion<SubidaPreparada>>;
  confirmar: (ruta: string) => Promise<RespuestaAccion<T>>;
  descartar: (ruta: string) => Promise<RespuestaAccion<null>>;
};

/**
 * Sube el binario del navegador directo a Storage con la URL firmada que emite
 * el servidor (evita el límite de 1 MiB del cuerpo de las Server Actions) y
 * luego pide al servidor confirmar y vincular el archivo. Si la subida o la
 * confirmación fallan, descarta el objeto pendiente y propaga el error.
 */
export async function subirArchivoDirecto<T>(archivo: File, pasos: PasosSubidaDirecta<T>): Promise<T> {
  let rutaPendiente: string | null = null;
  try {
    const preparada = await pasos.preparar();
    if (!preparada.exito || !preparada.datos) {
      throw new Error(preparada.exito ? 'No se pudo preparar el archivo' : preparada.error);
    }
    const { bucket, ruta, token, mime } = preparada.datos;
    rutaPendiente = ruta;

    const { error } = await crearClienteSupabase()
      .storage.from(bucket)
      .uploadToSignedUrl(ruta, token, archivo, { contentType: mime });
    if (error) throw new Error('No se pudo subir el archivo');

    const confirmada = await pasos.confirmar(ruta);
    if (!confirmada.exito || confirmada.datos === undefined) {
      throw new Error(confirmada.exito ? 'No se pudo vincular el archivo' : confirmada.error);
    }
    rutaPendiente = null;
    return confirmada.datos;
  } catch (error) {
    if (rutaPendiente) await pasos.descartar(rutaPendiente).catch(() => undefined);
    throw error;
  }
}
