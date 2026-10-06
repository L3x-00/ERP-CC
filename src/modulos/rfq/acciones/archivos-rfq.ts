'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  firmarLecturaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import {
  sanearNombreArchivo,
  validarSubidaArchivo,
  type EntidadArchivo,
} from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import {
  esquemaFirmarArchivoRfq,
  esquemaListarArchivosRfq,
  esquemaSubirArchivoRfq,
} from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

/** Archivo vigente del RFQ o de uno de sus ítems. */
export type ArchivoRfq = {
  id: string;
  entidad: 'rfq' | 'rfq_item';
  entidadId: string;
  itemCodigo: string | null;
  clase: string;
  nombreOriginal: string;
  version: number;
  creadoEn: string;
};

const ESTADOS_SIN_CARGA = ['CLOSED', 'CANCELLED'];

/**
 * Server Action: sube un archivo general (`entidad='rfq'`) o por ítem
 * (`entidad='rfq_item'`) al bucket privado y registra su metadata en el modelo
 * único `archivos` (B1.9/E3). El RFQ debe existir y no estar cerrado.
 */
export async function subirArchivoRfqAccion(
  formData: FormData,
): Promise<RespuestaAccion<{ id: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_editar'))) {
    return { exito: false, error: 'Sin permiso para adjuntar archivos del RFQ' };
  }

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) {
    return { exito: false, error: 'Archivo requerido' };
  }

  const itemIdCrudo = formData.get('itemId');
  const analisis = esquemaSubirArchivoRfq.safeParse({
    rfqId: formData.get('rfqId'),
    clase: formData.get('clase'),
    ...(typeof itemIdCrudo === 'string' && itemIdCrudo !== '' ? { itemId: itemIdCrudo } : {}),
  });
  if (!analisis.success) {
    return { exito: false, error: 'Datos de archivo inválidos' };
  }
  const { rfqId, itemId, clase } = analisis.data;

  const admin = crearClienteSupabaseAdmin();
  const { data: rfq } = await admin
    .from('pipeline')
    .select('id, estado_rfq')
    .eq('id', rfqId)
    .maybeSingle();
  if (!rfq) {
    return { exito: false, error: 'El RFQ no existe' };
  }
  if (ESTADOS_SIN_CARGA.includes(rfq.estado_rfq)) {
    return { exito: false, error: 'El RFQ está cerrado; no admite archivos nuevos' };
  }

  let entidad: EntidadArchivo = 'rfq';
  let entidadId = rfqId;
  if (itemId) {
    const { data: item } = await admin
      .from('rfq_items')
      .select('id, rfq_id, estado')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.rfq_id !== rfqId) {
      return { exito: false, error: 'El ítem no pertenece a este RFQ' };
    }
    if (item.estado !== 'activo') {
      return { exito: false, error: 'No se adjuntan archivos a un ítem cancelado' };
    }
    entidad = 'rfq_item';
    entidadId = itemId;
  }

  const validacion = validarSubidaArchivo(entidad, {
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!validacion.ok) {
    return { exito: false, error: validacion.error };
  }

  const mime = archivo.type || 'application/octet-stream';
  const ruta = construirRutaArchivo(entidad, entidadId, archivo.name);
  const { error: errorSubida } = await admin.storage
    .from(BUCKET_ADJUNTOS)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  let id: string;
  try {
    const registrado = await registrarArchivo(admin, {
      entidad,
      entidadId,
      clase,
      nombreOriginal: archivo.name,
      nombreErp: sanearNombreArchivo(archivo.name),
      bucket: BUCKET_ADJUNTOS,
      rutaStorage: ruta,
      mime,
      tamanoBytes: archivo.size,
      subidoPor: usuario.id,
    });
    id = registrado.id;
  } catch {
    await descartarSubidaArchivo(admin, BUCKET_ADJUNTOS, ruta);
    return { exito: false, error: 'No se pudo registrar el archivo' };
  }

  const correlationId = nuevoCorrelationId();
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

/**
 * Server Action: lista los archivos vigentes del RFQ y de sus ítems, con el
 * código ITxx del ítem cuando aplica.
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

  const columnas = 'id, entidad, entidad_id, clase, nombre_original, version, creado_en';
  const { data: generales, error: errorGenerales } = await admin
    .from('archivos')
    .select(columnas)
    .eq('entidad', 'rfq')
    .eq('entidad_id', rfqId)
    .eq('vigente', true);
  if (errorGenerales) {
    return { exito: false, error: 'No se pudieron listar los archivos' };
  }

  let deItems: typeof generales = [];
  if (idsItems.length > 0) {
    const { data, error } = await admin
      .from('archivos')
      .select(columnas)
      .eq('entidad', 'rfq_item')
      .in('entidad_id', idsItems)
      .eq('vigente', true);
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
      version: fila.version,
      creadoEn: fila.creado_en,
    }))
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));

  return { exito: true, datos: archivos };
}

/** Server Action: firma una URL de lectura corta (≤300 s) del archivo. */
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

  try {
    const url = await firmarLecturaArchivo(crearClienteSupabaseAdmin(), resultado.data.archivoId);
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: mensajeErrorRfq('archivo_no_encontrado') };
  }
}
