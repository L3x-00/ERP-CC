import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import {
  ENTIDADES_ARCHIVO,
  extensionDe,
  validarSubidaArchivo,
  type EntidadArchivo,
} from './validaciones';

type ClienteAdmin = SupabaseClient<Database>;

/** Resultado de los pasos de servidor de una carga directa. */
export type ResultadoSubida<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Metadatos que declara el navegador antes de subir; el binario nunca pasa por la Server Action. */
export type SolicitudSubidaDirecta = { nombre: string; tamano: number; mime: string };

/** Token de subida para una ruta aleatoria concreta del bucket privado. */
export type SubidaPreparada = { bucket: string; ruta: string; token: string; mime: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ARCHIVO_PENDIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

function prefijoRuta(entidad: EntidadArchivo, entidadId: string, usuarioId: string): string {
  return `${entidad}/${entidadId}/${usuarioId}/`;
}

/**
 * Emite una URL firmada de subida para `<entidad>/<entidadId>/<usuarioId>/<uuid>.<ext>`.
 * La ruta la decide el servidor y queda ligada a la entidad, al registro y al
 * usuario autorizado; el token no habilita escritura genérica en el bucket.
 * Quien llama ya validó sesión, permiso y estado de la entidad.
 */
export async function prepararSubidaDirecta(
  admin: ClienteAdmin,
  entrada: {
    bucket: string;
    entidad: EntidadArchivo;
    entidadId: string;
    usuarioId: string;
    solicitud: SolicitudSubidaDirecta;
  },
): Promise<ResultadoSubida<SubidaPreparada>> {
  const { bucket, entidad, entidadId, usuarioId, solicitud } = entrada;
  if (!UUID.test(entidadId) || !UUID.test(usuarioId)) {
    return { ok: false, error: 'Destino de archivo inválido' };
  }
  const validacion = validarSubidaArchivo(entidad, { nombre: solicitud.nombre, tamano: solicitud.tamano });
  if (!validacion.ok) return validacion;

  const ruta = `${prefijoRuta(entidad, entidadId, usuarioId)}${randomUUID()}.${extensionDe(solicitud.nombre)}`;
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(ruta);
  if (error || !data?.token) return { ok: false, error: 'No se pudo preparar la subida' };

  const mime = solicitud.mime.trim() || 'application/octet-stream';
  return { ok: true, datos: { bucket, ruta, token: data.token, mime } };
}

/** Carga directa por confirmar: destino autorizado más la ruta y el nombre declarados. */
export type CargaPorConfirmar = {
  bucket: string;
  entidad: EntidadArchivo;
  entidadId: string;
  usuarioId: string;
  ruta: string;
  nombre: string;
};

/** Metadatos reales del objeto en Storage (no los que declaró el navegador). */
export type ObjetoSubido = { tamano: number; mime: string };

/**
 * Revalida en servidor la carga ya subida: la ruta debe pertenecer a la
 * entidad, al registro y al usuario, y no estar vinculada todavía; la extensión
 * debe coincidir con el nombre declarado y estar permitida, y el objeto real
 * debe existir con un tamaño dentro del perfil. Falla cerrado ante cualquier
 * inconsistencia.
 */
export async function verificarSubidaDirecta(
  admin: ClienteAdmin,
  entrada: CargaPorConfirmar,
): Promise<ResultadoSubida<ObjetoSubido>> {
  const { bucket, entidad, entidadId, usuarioId, ruta, nombre } = entrada;
  const prefijo = prefijoRuta(entidad, entidadId, usuarioId);
  const archivo = ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : '';
  const extension = extensionDe(nombre);
  if (!ARCHIVO_PENDIENTE.test(archivo) || extensionDe(archivo) !== extension) {
    return { ok: false, error: 'El archivo no corresponde a este registro' };
  }

  const { data: vinculado, error: errorVinculo } = await admin
    .from('archivos')
    .select('id')
    .eq('ruta_storage', ruta)
    .maybeSingle();
  if (errorVinculo) return { ok: false, error: 'No se pudo verificar el archivo' };
  if (vinculado) return { ok: false, error: 'El archivo ya está vinculado' };

  const { data: objetos, error } = await admin.storage
    .from(bucket)
    .list(prefijo.slice(0, -1), { search: archivo, limit: 2 });
  const objeto = objetos?.find((item) => item.name === archivo);
  const tamano = Number(objeto?.metadata?.size ?? 0);
  if (error || !objeto) return { ok: false, error: 'El archivo no se subió completo' };

  const validacion = validarSubidaArchivo(entidad, { nombre, tamano });
  if (!validacion.ok) return validacion;

  const mime = String(objeto.metadata?.mimetype ?? '') || 'application/octet-stream';
  return { ok: true, datos: { tamano, mime } };
}

/**
 * Confirma una carga directa: revalida el objeto real y solo entonces lo
 * vincula con `vincular` (registro en `archivos`). Si la verificación o la
 * vinculación fallan, descarta la carga cuando la ruta es del propio usuario
 * para este registro; nunca toca una ruta ajena ni un archivo ya vinculado
 * (confirmación repetida o concurrente choca con `archivos.ruta_storage` único).
 */
export async function confirmarSubidaDirecta<T>(
  admin: ClienteAdmin,
  carga: CargaPorConfirmar,
  vincular: (objeto: ObjetoSubido) => Promise<T>,
): Promise<ResultadoSubida<T>> {
  const { bucket, entidad, entidadId, usuarioId, ruta } = carga;
  const descartarPropia = async (): Promise<void> => {
    if (ruta.startsWith(prefijoRuta(entidad, entidadId, usuarioId))) {
      await descartarSubidaDirecta(admin, { bucket, ruta, usuarioId });
    }
  };

  const verificada = await verificarSubidaDirecta(admin, carga);
  if (!verificada.ok) {
    await descartarPropia();
    return verificada;
  }
  try {
    return { ok: true, datos: await vincular(verificada.datos) };
  } catch {
    await descartarPropia();
    return { ok: false, error: 'No se pudo registrar el archivo' };
  }
}

/**
 * Borra una carga inconclusa del propio usuario. Nunca borra un archivo que ya
 * esté vinculado al modelo único (`archivos.ruta_storage`) ni una ruta ajena.
 */
export async function descartarSubidaDirecta(
  admin: ClienteAdmin,
  entrada: { bucket: string; ruta: string; usuarioId: string },
): Promise<ResultadoSubida<null>> {
  const { bucket, ruta, usuarioId } = entrada;
  const [entidad, entidadId, propietario, archivo, ...resto] = ruta.split('/');
  const rutaValida = resto.length === 0
    && (ENTIDADES_ARCHIVO as readonly string[]).includes(entidad ?? '')
    && UUID.test(entidadId ?? '')
    && propietario === usuarioId
    && ARCHIVO_PENDIENTE.test(archivo ?? '');
  if (!rutaValida) return { ok: false, error: 'Ruta ajena o inválida' };

  const { data: vinculado, error: errorConsulta } = await admin
    .from('archivos')
    .select('id')
    .eq('ruta_storage', ruta)
    .maybeSingle();
  if (errorConsulta) return { ok: false, error: 'No se pudo descartar la carga' };
  if (vinculado) return { ok: false, error: 'El archivo ya está vinculado' };

  const { error } = await admin.storage.from(bucket).remove([ruta]);
  return error ? { ok: false, error: 'No se pudo descartar la carga' } : { ok: true, datos: null };
}
