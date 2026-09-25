'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  BUCKET_ARCHIVOS_ORDEN,
  LIMITE_ARCHIVO_ORDEN,
  MIME_POR_EXTENSION_ORDEN,
  type ArchivoOrdenResumen,
} from '@/modulos/ordenes/archivos-orden-config';
import { nombreDocumentoSeguro } from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

const nombreArchivo = z.string().trim().min(1).max(250);
const ordenId = z.uuid();
const esquemaPreparar = z.object({
  ordenId,
  nombre: nombreArchivo,
  tamano: z.number().int().min(1).max(LIMITE_ARCHIVO_ORDEN),
  mime: z.string().max(100),
}).strict();
const esquemaConfirmar = z.object({ ordenId, ruta: z.string().min(1).max(250), nombre: nombreArchivo }).strict();
const esquemaListar = z.object({ ordenId }).strict();
const esquemaAbrir = z.object({ ordenId, archivoId: z.uuid() }).strict();
const esquemaDescartar = z.object({ ruta: z.string().min(1).max(250) }).strict();

function extension(nombre: string): string {
  return nombre.split('.').pop()?.toLowerCase() ?? '';
}

/** ORD-06: los adjuntos del trabajo heredado son una tarea administrativa. */
async function usuarioAutorizado() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'aprobar_ordenes'))) return null;
  return usuario;
}

async function ordenHistoricaAdmiteArchivos(
  admin: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data, error } = await admin.from('ordenes_produccion')
    .select('id, id_historico').eq('id', id).maybeSingle();
  return !error && Boolean(data?.id_historico);
}

/** Emite token para una ruta aleatoria; el binario no viaja por Server Action. */
export async function prepararSubidaArchivoOrdenAccion(entrada: unknown): Promise<
  RespuestaAccion<{ ruta: string; token: string; mime: string }>
> {
  const validado = esquemaPreparar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido o mayor a 20 MiB' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso para adjuntar al trabajo heredado' };
  const ext = extension(validado.data.nombre);
  const mimeEsperado = MIME_POR_EXTENSION_ORDEN[ext];
  if (!mimeEsperado || (validado.data.mime && validado.data.mime !== mimeEsperado
    && mimeEsperado !== 'application/octet-stream')) {
    return { exito: false, error: 'Tipo de archivo no permitido' };
  }
  const admin = crearClienteSupabaseAdmin();
  if (!(await ordenHistoricaAdmiteArchivos(admin, validado.data.ordenId))) {
    return { exito: false, error: 'La orden no admite archivos heredados' };
  }
  const ruta = `${validado.data.ordenId}/${usuario.id}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET_ARCHIVOS_ORDEN).createSignedUploadUrl(ruta);
  if (error || !data?.token) return { exito: false, error: 'No se pudo preparar la subida' };
  return { exito: true, datos: { ruta, token: data.token, mime: mimeEsperado } };
}

/** Recomprueba el objeto privado antes de asociarlo a la orden. */
export async function confirmarArchivoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ArchivoOrdenResumen>> {
  const validado = esquemaConfirmar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso para adjuntar al trabajo heredado' };
  const prefijo = `${validado.data.ordenId}/${usuario.id}/`;
  const archivo = validado.data.ruta.startsWith(prefijo)
    ? validado.data.ruta.slice(prefijo.length)
    : '';
  const ext = extension(archivo);
  const mime = MIME_POR_EXTENSION_ORDEN[ext];
  if (!mime || !new RegExp(`^[0-9a-f-]{36}\\.${ext}$`).test(archivo)
    || extension(validado.data.nombre) !== ext) {
    return { exito: false, error: 'La ruta no pertenece a esta orden y usuario' };
  }
  const admin = crearClienteSupabaseAdmin();
  if (!(await ordenHistoricaAdmiteArchivos(admin, validado.data.ordenId))) {
    return { exito: false, error: 'La orden no admite archivos heredados' };
  }
  const { data: existentes, error: errorListado } = await admin.storage.from(BUCKET_ARCHIVOS_ORDEN)
    .list(`${validado.data.ordenId}/${usuario.id}`, { search: archivo, limit: 20 });
  const objeto = existentes?.find((item) => item.name === archivo);
  const tamano = Number(objeto?.metadata?.size ?? 0);
  if (errorListado || !objeto || String(objeto.metadata?.mimetype ?? '') !== mime
    || tamano < 1 || tamano > LIMITE_ARCHIVO_ORDEN) {
    return { exito: false, error: 'Archivo no disponible o inválido' };
  }
  const { data, error } = await admin.from('archivos_orden').insert({
    orden_id: validado.data.ordenId,
    ruta: validado.data.ruta,
    nombre: nombreDocumentoSeguro(validado.data.nombre),
    mime,
    tamano,
    creado_por: usuario.id,
  }).select('id, orden_id, nombre, mime, tamano, creado_en').single();
  if (error || !data) return { exito: false, error: 'No se pudo vincular el archivo a la orden' };
  await registrarLog(usuario, 'asociar_archivo_orden', 'ordenes', data.id, {
    ordenId: data.orden_id,
    nombre: data.nombre,
  });
  return {
    exito: true,
    datos: {
      id: data.id,
      ordenId: data.orden_id,
      nombre: data.nombre,
      mime: data.mime,
      tamano: data.tamano,
      creadoEn: data.creado_en,
    },
  };
}

/** Lista los archivos asociados a una orden heredada autorizada. */
export async function obtenerArchivosOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ArchivoOrdenResumen[]>> {
  const validado = esquemaListar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Orden inválida' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso para consultar archivos heredados' };
  const admin = crearClienteSupabaseAdmin();
  const archivos: ArchivoOrdenResumen[] = [];
  const TAMANO_PAGINA = 500;
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await admin.from('archivos_orden')
      .select('id, orden_id, nombre, mime, tamano, creado_en')
      .eq('orden_id', validado.data.ordenId)
      .order('creado_en', { ascending: false }).order('id', { ascending: false })
      .range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) return { exito: false, error: 'No se pudo consultar los archivos de la orden' };
    archivos.push(...(data ?? []).map((fila) => ({
      id: fila.id,
      ordenId: fila.orden_id,
      nombre: fila.nombre,
      mime: fila.mime,
      tamano: fila.tamano,
      creadoEn: fila.creado_en,
    })));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return { exito: true, datos: archivos };
}

/** Firma durante un minuto una ruta hallada en la tabla, nunca la recibida del cliente. */
export async function obtenerUrlArchivoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const validado = esquemaAbrir.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso para abrir archivos heredados' };
  const admin = crearClienteSupabaseAdmin();
  const { data: archivo, error } = await admin.from('archivos_orden')
    .select('ruta').eq('id', validado.data.archivoId)
    .eq('orden_id', validado.data.ordenId).maybeSingle();
  if (error || !archivo) return { exito: false, error: 'Archivo no disponible en esta orden' };
  const { data, error: errorFirma } = await admin.storage.from(BUCKET_ARCHIVOS_ORDEN)
    .createSignedUrl(archivo.ruta, 60);
  if (errorFirma || !data?.signedUrl) return { exito: false, error: 'No se pudo abrir el archivo' };
  return { exito: true, datos: { url: data.signedUrl } };
}

/** Descarta una carga inconclusa propia, nunca un archivo ya asociado. */
export async function descartarSubidaArchivoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const validado = esquemaDescartar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso para adjuntar al trabajo heredado' };
  const partes = validado.data.ruta.split('/');
  if (partes.length !== 3 || partes[1] !== usuario.id || !z.uuid().safeParse(partes[0]).success
    || !/^[0-9a-f-]{36}\.[a-z]+$/.test(partes[2])) {
    return { exito: false, error: 'Ruta ajena o inválida' };
  }
  const admin = crearClienteSupabaseAdmin();
  const { data: vinculado } = await admin.from('archivos_orden')
    .select('id').eq('ruta', validado.data.ruta).maybeSingle();
  if (vinculado) return { exito: false, error: 'El archivo ya pertenece a la orden' };
  const { error } = await admin.storage.from(BUCKET_ARCHIVOS_ORDEN).remove([validado.data.ruta]);
  return error ? { exito: false, error: 'No se pudo descartar la carga' } : { exito: true, datos: null };
}
