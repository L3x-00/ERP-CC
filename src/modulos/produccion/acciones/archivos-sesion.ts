'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { BUCKET_ARCHIVOS_SESION, LIMITE_ARCHIVO_SESION, MIME_POR_EXTENSION, type ArchivoSesionResumen, type ClaseArchivoProduccion } from '@/modulos/produccion/archivos-sesion-config';
import { nombreDocumentoSeguro } from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

const nombreArchivo = z.string().trim().min(1).max(250);
const sesionId = z.uuid();
const clase = z.enum(['sesion', 'salida_final']).default('sesion');
const esquemaPreparar = z.object({
  sesionId, clase, nombre: nombreArchivo, tamano: z.number().int().min(1).max(LIMITE_ARCHIVO_SESION),
  mime: z.string().max(100),
}).strict();
const esquemaConfirmar = z.object({ sesionId, clase, ruta: z.string().min(1).max(250), nombre: nombreArchivo }).strict();
const esquemaOrden = z.object({ ordenId: z.uuid() }).strict();
const esquemaAbrir = z.object({ ordenId: z.uuid(), archivoId: z.uuid() }).strict();
const esquemaDescartar = z.object({ ruta: z.string().min(1).max(250) }).strict();

function extension(nombre: string): string {
  return nombre.split('.').pop()?.toLowerCase() ?? '';
}

function claseDesdeFila(valor: string): ClaseArchivoProduccion {
  return valor === 'salida_final' ? 'salida_final' : 'sesion';
}

async function usuarioAutorizado() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'gestionar_produccion'))) return null;
  return usuario;
}

async function sesionAdmiteClase(
  admin: SupabaseClient<Database>, id: string, tipo: ClaseArchivoProduccion,
): Promise<boolean> {
  const { data: sesion, error } = await admin.from('sesiones_trabajo')
    .select('id, orden_id, estado_sesion').eq('id', id).maybeSingle();
  if (error || !sesion) return false;
  if (tipo === 'sesion') return true;
  if (sesion.estado_sesion !== 'finalizada') return false;
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion')
    .select('estado').eq('id', sesion.orden_id).maybeSingle();
  return !errorOrden && orden?.estado === 'completada';
}

/** Emite token para una única ruta aleatoria, nunca recibe el binario por Server Action. */
export async function prepararSubidaArchivoSesionAccion(entrada: unknown): Promise<
  RespuestaAccion<{ ruta: string; token: string; mime: string }>
> {
  const validado = esquemaPreparar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido o mayor a 20 MiB' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso de Producción' };
  const ext = extension(validado.data.nombre);
  const mimeEsperado = MIME_POR_EXTENSION[ext];
  if (!mimeEsperado || (validado.data.mime && validado.data.mime !== mimeEsperado
    && mimeEsperado !== 'application/octet-stream')) {
    return { exito: false, error: 'Tipo de archivo no permitido' };
  }
  const admin = crearClienteSupabaseAdmin();
  if (!(await sesionAdmiteClase(admin, validado.data.sesionId, validado.data.clase))) {
    return { exito: false, error: 'La sesión no admite este tipo de archivo' };
  }
  const ruta = `${validado.data.sesionId}/${usuario.id}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET_ARCHIVOS_SESION).createSignedUploadUrl(ruta);
  if (error || !data?.token) return { exito: false, error: 'No se pudo preparar la subida' };
  return { exito: true, datos: { ruta, token: data.token, mime: mimeEsperado } };
}

/** Recomprueba el objeto privado antes de vincularlo a una sesión persistida. */
export async function confirmarArchivoSesionAccion(entrada: unknown): Promise<RespuestaAccion<ArchivoSesionResumen>> {
  const validado = esquemaConfirmar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso de Producción' };
  const prefijo = `${validado.data.sesionId}/${usuario.id}/`;
  const ruta = validado.data.ruta;
  const archivo = ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : '';
  const ext = extension(archivo);
  const mime = MIME_POR_EXTENSION[ext];
  if (!mime || !new RegExp(`^[0-9a-f-]{36}\\.${ext}$`).test(archivo)
    || extension(validado.data.nombre) !== ext) {
    return { exito: false, error: 'La ruta no pertenece a esta sesión y usuario' };
  }
  const admin = crearClienteSupabaseAdmin();
  if (!(await sesionAdmiteClase(admin, validado.data.sesionId, validado.data.clase))) {
    return { exito: false, error: 'La sesión no admite este tipo de archivo' };
  }
  const { data: existentes, error: errorListado } = await admin.storage.from(BUCKET_ARCHIVOS_SESION)
    .list(`${validado.data.sesionId}/${usuario.id}`, { search: archivo, limit: 20 });
  const objeto = existentes?.find((item) => item.name === archivo);
  const tamano = Number(objeto?.metadata?.size ?? 0);
  if (errorListado || !objeto || String(objeto.metadata?.mimetype ?? '') !== mime
    || tamano < 1 || tamano > LIMITE_ARCHIVO_SESION) {
    return { exito: false, error: 'Archivo no disponible o inválido' };
  }
  const { data, error } = await admin.from('archivos_sesion_produccion').insert({
    sesion_id: validado.data.sesionId, clase: validado.data.clase,
    ruta, nombre: nombreDocumentoSeguro(validado.data.nombre),
    mime, tamano, creado_por: usuario.id,
  }).select('id, sesion_id, clase, nombre, mime, tamano, creado_en').single();
  if (error || !data) return { exito: false, error: 'No se pudo vincular el archivo a la sesión' };
  await registrarLog(usuario, 'asociar_archivo_sesion', 'produccion', data.id, {
    sesionId: data.sesion_id, clase: data.clase,
  });
  return { exito: true, datos: {
    id: data.id, sesionId: data.sesion_id,
    clase: claseDesdeFila(data.clase),
    nombre: data.nombre, mime: data.mime,
    tamano: data.tamano, creadoEn: data.creado_en,
  } };
}

/** Lista todos los archivos asociados a sesiones de la orden autorizada. */
export async function obtenerArchivosSesionOrdenAccion(entrada: unknown): Promise<RespuestaAccion<ArchivoSesionResumen[]>> {
  const validado = esquemaOrden.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Orden inválida' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso de Producción' };
  const admin = crearClienteSupabaseAdmin();
  const archivos: ArchivoSesionResumen[] = [];
  const TAMANO_PAGINA = 500;
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await admin.from('archivos_sesion_produccion')
      .select('id, sesion_id, clase, nombre, mime, tamano, creado_en, sesiones_trabajo!inner(orden_id)')
      .eq('sesiones_trabajo.orden_id', validado.data.ordenId)
      .order('creado_en', { ascending: false }).order('id', { ascending: false })
      .range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) return { exito: false, error: 'No se pudo consultar el historial de archivos' };
    archivos.push(...(data ?? []).map((fila) => ({
      id: fila.id, sesionId: fila.sesion_id,
      clase: claseDesdeFila(fila.clase), nombre: fila.nombre,
      mime: fila.mime, tamano: fila.tamano, creadoEn: fila.creado_en,
    })));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return { exito: true, datos: archivos };
}

/** Firma durante un minuto una ruta hallada en la tabla, nunca la recibida del cliente. */
export async function obtenerUrlArchivoSesionAccion(entrada: unknown): Promise<RespuestaAccion<{ url: string }>> {
  const validado = esquemaAbrir.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Archivo inválido' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso de Producción' };
  const admin = crearClienteSupabaseAdmin();
  const { data: archivo, error } = await admin.from('archivos_sesion_produccion')
    .select('ruta, sesiones_trabajo!inner(orden_id)').eq('id', validado.data.archivoId)
    .eq('sesiones_trabajo.orden_id', validado.data.ordenId).maybeSingle();
  if (error || !archivo) return { exito: false, error: 'Archivo no disponible en esta orden' };
  const { data, error: errorFirma } = await admin.storage.from(BUCKET_ARCHIVOS_SESION)
    .createSignedUrl(archivo.ruta, 60);
  if (errorFirma || !data?.signedUrl) return { exito: false, error: 'No se pudo abrir el archivo' };
  return { exito: true, datos: { url: data.signedUrl } };
}

/** Descarta una carga inconclusa propia, pero nunca un archivo ya asociado. */
export async function descartarSubidaArchivoSesionAccion(entrada: unknown): Promise<RespuestaAccion<null>> {
  const validado = esquemaDescartar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await usuarioAutorizado();
  if (!usuario) return { exito: false, error: 'Sin permiso de Producción' };
  const partes = validado.data.ruta.split('/');
  if (partes.length !== 3 || partes[1] !== usuario.id || !z.uuid().safeParse(partes[0]).success
    || !/^[0-9a-f-]{36}\.[a-z]+$/.test(partes[2])) {
    return { exito: false, error: 'Ruta ajena o inválida' };
  }
  const admin = crearClienteSupabaseAdmin();
  const { data: vinculado } = await admin.from('archivos_sesion_produccion')
    .select('id').eq('ruta', validado.data.ruta).maybeSingle();
  if (vinculado) return { exito: false, error: 'El archivo ya pertenece al historial' };
  const { error } = await admin.storage.from(BUCKET_ARCHIVOS_SESION).remove([validado.data.ruta]);
  return error ? { exito: false, error: 'No se pudo descartar la carga' } : { exito: true, datos: null };
}
