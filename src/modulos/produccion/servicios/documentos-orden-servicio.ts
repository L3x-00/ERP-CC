import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  listarAdjuntosOportunidad,
  type ArchivoAdjunto,
} from '@/modulos/pipeline/servicios/listar-adjuntos';
import {
  archivosReferenciados,
  esSnapshotOrdenSii,
} from '@/modulos/ordenes/tipos/orden-sii';

/**
 * Documentos de una orden para el piso (OBS-06/ORD-09): el alcance aceptado se
 * resuelve por los IDs congelados del snapshot y los adjuntos posteriores viven
 * bajo la propia Orden. El operador de taller no tiene RLS comercial, así que
 * las Server Actions validan permiso de Producción y pertenencia antes de usar
 * service_role para emitir una URL firmada de vida corta.
 */

/** Extensiones admitidas para documentación de piso (planos, PDF, imágenes). */
export const EXTENSIONES_DOCUMENTO_ORDEN = [
  'pdf', 'dxf', 'dwg', 'step', 'stp', 'igs', 'iges', 'eps', 'ai',
  'png', 'jpg', 'jpeg', 'webp',
] as const;

/** Tamaño máximo por documento de orden: 20 MB (mismo límite que Pipeline). */
export const TAMANO_MAXIMO_DOCUMENTO_ORDEN = 20 * 1024 * 1024;

export interface OrdenDocumental {
  id: string;
  folio: string;
  /** Oportunidad de origen; solo se usa para compatibilidad con órdenes legadas. */
  cotizacionId: string | null;
  cotizacionFolio: string | null;
  propuestaRevisionId: string | null;
  snapshotJson: unknown;
}

export interface DocumentoOrden {
  id: string;
  ruta: string | null;
  nombre: string;
  tamano: number | null;
  tipo: string | null;
  creadoEn: string | null;
  version: number | null;
  vigente: boolean | null;
  origen: string;
  itemCodigo: string | null;
  congelado: boolean;
  disponible: boolean;
  linaje: string;
}

type FilaArchivoDocumento = {
  id: string;
  entidad: string;
  entidad_id: string;
  nombre_original: string;
  ruta_storage: string;
  bucket: string;
  mime: string;
  tamano_bytes: number;
  version: number;
  vigente: boolean;
  nombre_erp?: string | null;
  tema_codigo?: string | null;
  reemplaza_a?: string | null;
  creado_en: string;
};

type VinculoItemPropuesta = {
  id: string;
  rfq_item_id: string | null;
  codigo: string;
};

function linajeFila(fila: FilaArchivoDocumento, origen = fila.entidad): string {
  return [
    origen,
    fila.entidad_id,
    fila.tema_codigo ?? '',
    fila.nombre_erp ?? `#${fila.id}`,
  ].join('|');
}

function documentoDesdeFila(
  fila: FilaArchivoDocumento,
  entrada: { congelado: boolean; itemCodigo?: string | null; origen?: string },
): DocumentoOrden {
  const origen = entrada.origen ?? fila.entidad;
  return {
    id: fila.id,
    ruta: fila.ruta_storage,
    nombre: fila.nombre_original,
    tamano: Number(fila.tamano_bytes),
    tipo: fila.mime,
    creadoEn: fila.creado_en,
    version: fila.version,
    vigente: fila.vigente,
    origen,
    itemCodigo: entrada.itemCodigo ?? null,
    congelado: entrada.congelado,
    disponible: true,
    linaje: linajeFila(fila, origen),
  };
}

function unirDocumentos(...grupos: readonly DocumentoOrden[][]): DocumentoOrden[] {
  const unicos = new Map<string, DocumentoOrden>();
  for (const grupo of grupos) {
    for (const documento of grupo) {
      if (!unicos.has(documento.id)) unicos.set(documento.id, documento);
    }
  }
  return [...unicos.values()];
}

/**
 * Materializa la vista documental de una Orden desde los IDs congelados en su
 * snapshot. No filtra por `vigente`: la versión exacta aceptada debe seguir
 * disponible aunque luego exista una versión más nueva en el RFQ.
 */
export function construirDocumentosCongelados(
  snapshot: unknown,
  filas: readonly FilaArchivoDocumento[],
  vinculosItems: readonly VinculoItemPropuesta[],
): DocumentoOrden[] {
  if (!esSnapshotOrdenSii(snapshot)) return [];
  const ids = new Set(archivosReferenciados(snapshot));
  if (ids.size === 0) return [];

  const metadataPorId = new Map<
    string,
    { nombre: string | null; itemCodigo: string | null; origen: string }
  >();
  for (const archivo of snapshot.archivos) {
    if (!archivo.archivo_id) continue;
    metadataPorId.set(archivo.archivo_id, {
      nombre: archivo.nombre_original ?? null,
      itemCodigo: null,
      origen: 'snapshot',
    });
  }
  for (const item of snapshot.items) {
    const codigo = item.codigo ?? item.codigo_item ?? null;
    for (const archivo of item.archivos ?? []) {
      if (!archivo.archivo_id) continue;
      metadataPorId.set(archivo.archivo_id, {
        nombre: archivo.nombre_original ?? null,
        itemCodigo: codigo,
        origen: 'propuesta_item',
      });
    }
  }

  const codigoPorItemPropuesta = new Map(vinculosItems.map((item) => [item.id, item.codigo]));
  const codigoPorItemRfq = new Map(
    vinculosItems.flatMap((item) => item.rfq_item_id ? [[item.rfq_item_id, item.codigo] as const] : []),
  );

  const filaPorId = new Map(filas.filter((fila) => ids.has(fila.id)).map((fila) => [fila.id, fila]));
  return [...ids]
    .map((id): DocumentoOrden => {
      const fila = filaPorId.get(id);
      const metadata = metadataPorId.get(id);
      if (!fila) {
        return {
          id,
          ruta: null,
          nombre: metadata?.nombre ?? `Documento ${id.slice(0, 8)}`,
          tamano: null,
          tipo: null,
          creadoEn: null,
          version: null,
          vigente: null,
          origen: metadata?.origen ?? 'snapshot',
          itemCodigo: metadata?.itemCodigo ?? null,
          congelado: true,
          disponible: false,
          linaje: `snapshot|${id}`,
        };
      }
      const itemCodigo = fila.entidad === 'rfq_item'
        ? codigoPorItemRfq.get(fila.entidad_id) ?? null
        : fila.entidad === 'propuesta_item'
          ? codigoPorItemPropuesta.get(fila.entidad_id) ?? null
          : metadata?.itemCodigo ?? null;
      return documentoDesdeFila(fila, { congelado: true, itemCodigo });
    })
    .sort((a, b) => {
      if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
      return (a.creadoEn ?? '') < (b.creadoEn ?? '') ? 1 : -1;
    });
}

export async function obtenerOrdenDocumental(
  admin: SupabaseClient<Database>,
  ordenId: string,
): Promise<OrdenDocumental | null> {
  const { data, error } = await admin
    .from('ordenes_produccion')
    .select('id, folio, cotizacion_id, propuesta_revision_id, snapshot_json, pipeline!ordenes_produccion_cotizacion_id_fkey(folio_cnc)')
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    folio: data.folio,
    cotizacionId: data.cotizacion_id,
    cotizacionFolio: data.pipeline?.folio_cnc ?? null,
    propuestaRevisionId: data.propuesta_revision_id,
    snapshotJson: data.snapshot_json,
  };
}

/** Lista el snapshot documental congelado y los archivos propios posteriores de la Orden. */
export async function listarDocumentosOrden(
  admin: SupabaseClient<Database>,
  orden: OrdenDocumental,
): Promise<DocumentoOrden[]> {
  const snapshotValido = esSnapshotOrdenSii(orden.snapshotJson) ? orden.snapshotJson : null;
  const idsCongelados = snapshotValido ? archivosReferenciados(snapshotValido) : [];

  const columnasArchivo =
    'id, entidad, entidad_id, nombre_original, nombre_erp, tema_codigo, reemplaza_a, ruta_storage, bucket, mime, tamano_bytes, version, vigente, creado_en';
  const [respuestaCongelados, respuestaPropios, respuestaItems, respuestaLogsLegacy] = await Promise.all([
    idsCongelados.length > 0
      ? admin
        .from('archivos')
        .select(columnasArchivo)
        .in('id', idsCongelados)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('archivos')
      .select(columnasArchivo)
      .eq('entidad', 'orden')
      .eq('entidad_id', orden.id),
    orden.propuestaRevisionId
      ? admin
        .from('propuesta_items')
        .select('id, rfq_item_id, codigo')
        .eq('revision_id', orden.propuestaRevisionId)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('logs')
      .select('detalles')
      .eq('accion', 'subir_documento_orden')
      .eq('modulo', 'produccion')
      .eq('recurso_id', orden.id),
  ]);

  if (
    respuestaCongelados.error
    || respuestaPropios.error
    || respuestaItems.error
    || respuestaLogsLegacy.error
  ) {
    throw new Error('No se pudieron consultar los documentos congelados de la orden');
  }

  const rutasLegacy = (respuestaLogsLegacy.data ?? []).flatMap((fila) => {
    const detalles = fila.detalles;
    if (typeof detalles !== 'object' || detalles === null || Array.isArray(detalles)) return [];
    const ruta = 'ruta' in detalles ? detalles.ruta : null;
    return typeof ruta === 'string' && ruta.length > 0 ? [ruta] : [];
  });
  const respuestaArchivosLegacy = rutasLegacy.length > 0
    ? await admin
      .from('archivos')
      .select(columnasArchivo)
      .eq('entidad', 'rfq')
      .in('ruta_storage', rutasLegacy)
    : { data: [], error: null };
  if (respuestaArchivosLegacy.error) {
    throw new Error('No se pudieron consultar los documentos históricos de la orden');
  }

  const congelados = construirDocumentosCongelados(
    orden.snapshotJson,
    (respuestaCongelados.data ?? []) as FilaArchivoDocumento[],
    (respuestaItems.data ?? []) as VinculoItemPropuesta[],
  );
  const propios = ((respuestaPropios.data ?? []) as FilaArchivoDocumento[])
    .map((fila) => documentoDesdeFila(fila, { congelado: false, origen: 'orden' }));
  const propiosLegacy = ((respuestaArchivosLegacy.data ?? []) as FilaArchivoDocumento[])
    .map((fila) => documentoDesdeFila(fila, { congelado: false, origen: 'orden_legacy' }));

  // Un snapshot válido, incluso vacío o con una referencia dañada, nunca cae
  // a la carpeta viva del RFQ: eso incorporaría cambios posteriores a la venta.
  if (snapshotValido) return unirDocumentos(propios, propiosLegacy, congelados);
  if (!orden.cotizacionId) return unirDocumentos(propios, propiosLegacy);

  // Compatibilidad para órdenes anteriores al snapshot SII: conserva la
  // lectura por carpeta, pero las órdenes nuevas nunca dependen del RFQ vivo.
  const legacy: ArchivoAdjunto[] = await listarAdjuntosOportunidad(admin, orden.cotizacionId);
  const carpetaLegacy: DocumentoOrden[] = legacy.map((archivo) => ({
      ...archivo,
      version: null,
      vigente: null,
      origen: 'rfq_legacy',
      itemCodigo: null,
      congelado: false,
      disponible: true,
      linaje: `rfq_legacy|${archivo.id}`,
    }));
  return unirDocumentos(propios, propiosLegacy, carpetaLegacy);
}

/**
 * La ruta pedida debe pertenecer a la carpeta de la oportunidad de la orden.
 * Función pura y estricta: sin cotización, sin prefijo o con `..` se rechaza.
 */
export function validarRutaDocumento(
  ruta: string,
  cotizacionId: string | null,
): boolean {
  if (!cotizacionId || ruta.length === 0 || ruta.length > 500) return false;
  if (ruta.includes('..') || ruta.includes('\\')) return false;
  const prefijos = [`${cotizacionId}/`, `rfq/${cotizacionId}/`];
  return prefijos.some((prefijo) => ruta.startsWith(prefijo) && ruta.length > prefijo.length);
}

/** Sanea el nombre de archivo para que no escape del prefijo ni sea ambiguo. */
export function nombreDocumentoSeguro(nombre: string): string {
  const limpio = nombre.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '_').trim();
  const conservado = limpio || 'archivo';
  return conservado.length > 180 ? conservado.slice(-180) : conservado;
}
