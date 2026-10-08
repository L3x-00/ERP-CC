import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import { sanearNombreArchivo, type EntidadArchivo } from './validaciones';

type ClienteAdmin = SupabaseClient<Database>;

/** Datos de metadata que acompañan a un archivo ya subido al bucket. */
export type EntradaRegistroArchivo = {
  entidad: EntidadArchivo;
  entidadId: string;
  temaCodigo?: string | null;
  clase: string;
  nombreOriginal: string;
  /** Nombre ERP; repetirlo genera una versión nueva en vez de sobrescribir. */
  nombreErp: string;
  bucket: string;
  rutaStorage: string;
  mime: string;
  tamanoBytes: number;
  subidoPor?: string | null;
  hashSha256?: string | null;
};

/** Construye la ruta privada `<entidad>/<entidadId>/<uuid>-<nombre seguro>`. */
export function construirRutaArchivo(
  entidad: EntidadArchivo,
  entidadId: string,
  nombreOriginal: string,
): string {
  return `${entidad}/${entidadId}/${randomUUID()}-${sanearNombreArchivo(nombreOriginal)}`;
}

/**
 * Registra la metadata del archivo. El trigger de versionado se encarga de
 * desmarcar la versión vigente anterior cuando se repite (entidad, entidad_id,
 * tema, nombre_erp): reemplazar nunca sobrescribe ni borra.
 */
export async function registrarArchivo(
  admin: ClienteAdmin,
  entrada: EntradaRegistroArchivo,
): Promise<{ id: string; version: number }> {
  const { data, error } = await admin
    .from('archivos')
    .insert({
      entidad: entrada.entidad,
      entidad_id: entrada.entidadId,
      tema_codigo: entrada.temaCodigo ?? null,
      clase: entrada.clase,
      nombre_original: entrada.nombreOriginal,
      nombre_erp: entrada.nombreErp,
      bucket: entrada.bucket,
      ruta_storage: entrada.rutaStorage,
      mime: entrada.mime,
      tamano_bytes: entrada.tamanoBytes,
      subido_por: entrada.subidoPor ?? null,
      hash_sha256: entrada.hashSha256 ?? null,
    })
    .select('id, version')
    .single();

  if (error || !data) {
    throw new Error('no_se_pudo_registrar_archivo');
  }
  return { id: data.id, version: data.version };
}

/** Firma una URL corta para un archivo cuya pertenencia ya validó el llamador. */
export async function firmarLecturaArchivo(
  admin: ClienteAdmin,
  archivoId: string,
  segundos = 300,
): Promise<string> {
  const { data, error } = await admin
    .from('archivos')
    .select('bucket, ruta_storage')
    .eq('id', archivoId)
    .single();
  if (error || !data) {
    throw new Error('archivo_no_encontrado');
  }
  const { data: firma, error: errorFirma } = await admin.storage
    .from(data.bucket)
    .createSignedUrl(data.ruta_storage, segundos);
  if (errorFirma || !firma?.signedUrl) {
    throw new Error('no_se_pudo_firmar_archivo');
  }
  return firma.signedUrl;
}

/** Elimina un binario recién subido cuando la metadata no pudo registrarse. */
export async function descartarSubidaArchivo(
  admin: ClienteAdmin,
  bucket: string,
  rutaStorage: string,
): Promise<void> {
  await admin.storage.from(bucket).remove([rutaStorage]);
}
