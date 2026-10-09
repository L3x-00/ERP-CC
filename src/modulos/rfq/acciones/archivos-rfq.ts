'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { firmarLecturaArchivo, registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaDescartarSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { sanearNombreArchivo, type EntidadArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

import {
  esquemaConfirmarArchivoRfq,
  esquemaFirmarArchivoRfq,
  esquemaListarArchivosRfq,
  esquemaPrepararArchivoRfq,
} from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

/**
 * Archivo del RFQ o de uno de sus ítems, vigente o histórico. El linaje de
 * versiones se identifica por `entidad + entidadId + temaCodigo + nombreErp`
 * (DC-04): una versión nueva es otra fila que apunta a la anterior con
 * `reemplazaA`, nunca una sobrescritura del blob.
 */
export type ArchivoRfq = {
  id: string;
  entidad: 'rfq' | 'rfq_item';
  entidadId: string;
  itemCodigo: string | null;
  clase: string;
  nombreOriginal: string;
  nombreErp: string | null;
  temaCodigo: string | null;
  version: number;
  vigente: boolean;
  reemplazaA: string | null;
  creadoEn: string;
};

const ESTADOS_SIN_CARGA = ['CLOSED', 'CANCELLED'];

type DestinoArchivoRfq = { entidad: EntidadArchivo; entidadId: string };

/** Usuario con permiso para adjuntar archivos del RFQ, o el error público. */
async function usuarioEditorRfq(): Promise<{ usuario: UsuarioAutenticado } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  if (!(await can(usuario, 'rfq_editar'))) {
    return { error: 'Sin permiso para adjuntar archivos del RFQ' };
  }
  return { usuario };
}

/**
 * Vínculo del archivo: general del RFQ (`rfq`) o de un ítem activo
 * (`rfq_item`). El RFQ debe existir y no estar cerrado ni cancelado.
 */
async function resolverDestinoRfq(
  admin: SupabaseClient<Database>,
  rfqId: string,
  itemId?: string,
): Promise<DestinoArchivoRfq | { error: string }> {
  const { data: rfq } = await admin
    .from('pipeline')
    .select('id, estado_rfq')
    .eq('id', rfqId)
    .maybeSingle();
  if (!rfq) return { error: 'El RFQ no existe' };
  if (ESTADOS_SIN_CARGA.includes(rfq.estado_rfq)) {
    return { error: 'El RFQ está cerrado; no admite archivos nuevos' };
  }
  if (!itemId) return { entidad: 'rfq', entidadId: rfqId };

  const { data: item } = await admin
    .from('rfq_items')
    .select('id, rfq_id, estado')
    .eq('id', itemId)
    .maybeSingle();
  if (!item || item.rfq_id !== rfqId) return { error: 'El ítem no pertenece a este RFQ' };
  if (item.estado !== 'activo') return { error: 'No se adjuntan archivos a un ítem cancelado' };
  return { entidad: 'rfq_item', entidadId: itemId };
}

/**
 * Server Action: emite la URL firmada para subir un archivo general o por ítem
 * directo a Storage (H-B1-29: el binario no pasa por la Server Action, cuyo
 * cuerpo está limitado a 1 MiB). Solo recibe metadatos.
 */
export async function prepararSubidaArchivoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPrepararArchivoRfq.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const editor = await usuarioEditorRfq();
  if ('error' in editor) return { exito: false, error: editor.error };

  const { rfqId, itemId, nombre, tamano, mime } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const destino = await resolverDestinoRfq(admin, rfqId, itemId);
  if ('error' in destino) return { exito: false, error: destino.error };

  const preparada = await prepararSubidaDirecta(admin, {
    bucket: BUCKET_ADJUNTOS,
    ...destino,
    usuarioId: editor.usuario.id,
    solicitud: { nombre, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * Server Action: revalida el objeto ya subido (ruta del usuario y del registro,
 * extensión, tamaño real) y lo registra en el modelo único `archivos`
 * (B1.9/E3). Si algo falla, la carga pendiente propia se descarta.
 */
export async function confirmarArchivoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmarArchivoRfq.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const editor = await usuarioEditorRfq();
  if ('error' in editor) return { exito: false, error: editor.error };
  const { usuario } = editor;

  const { rfqId, itemId, clase, nombre, ruta } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const destino = await resolverDestinoRfq(admin, rfqId, itemId);
  if ('error' in destino) return { exito: false, error: destino.error };

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET_ADJUNTOS, ...destino, usuarioId: usuario.id, ruta, nombre },
    (objeto) =>
      registrarArchivo(admin, {
        ...destino,
        clase,
        nombreOriginal: nombre,
        nombreErp: sanearNombreArchivo(nombre),
        bucket: BUCKET_ADJUNTOS,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: usuario.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  const { id } = confirmada.datos;
  await registrarLog(
    usuario,
    'subir_archivo_rfq',
    'pipeline',
    rfqId,
    { archivoId: id, clase, ...(itemId ? { itemId } : {}) },
    correlationId,
  );
  return { exito: true, datos: { id } };
}

/** Server Action: descarta una subida directa inconclusa del propio usuario. */
export async function descartarSubidaArchivoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const editor = await usuarioEditorRfq();
  if ('error' in editor) return { exito: false, error: editor.error };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET_ADJUNTOS,
    ruta: analisis.data.ruta,
    usuarioId: editor.usuario.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}

/**
 * Server Action: lista los archivos del RFQ y de sus ítems —incluidas las
 * versiones no vigentes (CLI-06)—, con el código ITxx del ítem cuando aplica.
 * La interfaz decide qué mostrar por defecto; aquí no se oculta historial.
 */
export async function listarArchivosRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ArchivoRfq[]>> {
  const resultado = esquemaListarArchivosRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { rfqId } = resultado.data;

  const { data: items, error: errorItems } = await admin
    .from('rfq_items')
    .select('id, codigo')
    .eq('rfq_id', rfqId);
  if (errorItems) {
    return { exito: false, error: 'No se pudieron listar los archivos' };
  }
  const codigoPorItem = new Map((items ?? []).map((item) => [item.id, item.codigo]));
  const idsItems = [...codigoPorItem.keys()];

  const columnas =
    'id, entidad, entidad_id, clase, nombre_original, nombre_erp, tema_codigo, version, vigente, reemplaza_a, creado_en';
  const { data: generales, error: errorGenerales } = await admin
    .from('archivos')
    .select(columnas)
    .eq('entidad', 'rfq')
    .eq('entidad_id', rfqId);
  if (errorGenerales) {
    return { exito: false, error: 'No se pudieron listar los archivos' };
  }

  let deItems: typeof generales = [];
  if (idsItems.length > 0) {
    const { data, error } = await admin
      .from('archivos')
      .select(columnas)
      .eq('entidad', 'rfq_item')
      .in('entidad_id', idsItems);
    if (error) {
      return { exito: false, error: 'No se pudieron listar los archivos' };
    }
    deItems = data;
  }

  const archivos = [...(generales ?? []), ...(deItems ?? [])]
    .map((fila) => ({
      id: fila.id,
      entidad: (fila.entidad === 'rfq_item' ? 'rfq_item' : 'rfq') as 'rfq' | 'rfq_item',
      entidadId: fila.entidad_id,
      itemCodigo: codigoPorItem.get(fila.entidad_id) ?? null,
      clase: fila.clase,
      nombreOriginal: fila.nombre_original,
      nombreErp: fila.nombre_erp,
      temaCodigo: fila.tema_codigo,
      version: fila.version,
      vigente: fila.vigente,
      reemplazaA: fila.reemplaza_a,
      creadoEn: fila.creado_en,
    }))
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));

  return { exito: true, datos: archivos };
}

/**
 * Entrada de firma con el RFQ de contexto. `rfq_vista` autoriza "ver RFQ", no
 * "leer cualquier blob del sistema": la acción firma con el cliente admin, así
 * que el archivo debe comprobarse contra este RFQ concreto o sus ítems.
 */
/** `true` si el archivo es del RFQ indicado o de uno de sus ítems. */
async function archivoEsDelRfq(
  admin: SupabaseClient<Database>,
  rfqId: string,
  archivoId: string,
): Promise<boolean> {
  const { data: archivo } = await admin
    .from('archivos')
    .select('entidad, entidad_id')
    .eq('id', archivoId)
    .maybeSingle();
  if (!archivo) return false;
  if (archivo.entidad === 'rfq') return archivo.entidad_id === rfqId;
  if (archivo.entidad !== 'rfq_item') return false;

  const { data: items } = await admin.from('rfq_items').select('id').eq('rfq_id', rfqId);
  return (items ?? []).some((item) => item.id === archivo.entidad_id);
}

/**
 * Server Action: firma una URL de lectura corta (≤300 s) del archivo, vigente
 * o histórico, siempre que pertenezca al RFQ recibido o a uno de sus ítems.
 */
export async function firmarArchivoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const resultado = esquemaFirmarArchivoRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const { rfqId, archivoId } = resultado.data;
  const admin = crearClienteSupabaseAdmin();
  if (!(await archivoEsDelRfq(admin, rfqId, archivoId))) {
    return { exito: false, error: mensajeErrorRfq('archivo_no_encontrado') };
  }

  try {
    const url = await firmarLecturaArchivo(admin, archivoId);
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: mensajeErrorRfq('archivo_no_encontrado') };
  }
}
