import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  listarAdjuntosOportunidad,
  type ArchivoAdjunto,
} from '@/modulos/pipeline/servicios/listar-adjuntos';

/**
 * Documentos de una orden para el piso (OBS-06/ORD-09): los planos viven en el
 * bucket privado bajo el prefijo de la oportunidad de origen (`cotizacion_id`).
 * El operador de taller no tiene RLS de Pipeline, así que la lectura/escritura
 * pasa por Server Actions con permiso de Producción y cliente service_role; la
 * firma de la URL es de vida corta y la ruta se valida contra el prefijo.
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
  /** Oportunidad de origen; sin ella la orden no tiene carpeta de documentos. */
  cotizacionId: string | null;
  cotizacionFolio: string | null;
}

export async function obtenerOrdenDocumental(
  admin: SupabaseClient<Database>,
  ordenId: string,
): Promise<OrdenDocumental | null> {
  const { data, error } = await admin
    .from('ordenes_produccion')
    .select('id, folio, cotizacion_id, pipeline(folio_cnc)')
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    folio: data.folio,
    cotizacionId: data.cotizacion_id,
    cotizacionFolio: data.pipeline?.folio_cnc ?? null,
  };
}

/** Lista los documentos de la carpeta de la oportunidad de la orden. */
export async function listarDocumentosOrden(
  admin: SupabaseClient<Database>,
  orden: OrdenDocumental,
): Promise<ArchivoAdjunto[]> {
  if (!orden.cotizacionId) return [];
  return listarAdjuntosOportunidad(admin, orden.cotizacionId);
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
  return ruta.startsWith(`${cotizacionId}/`) && ruta.length > cotizacionId.length + 1;
}

/** Sanea el nombre de archivo para que no escape del prefijo ni sea ambiguo. */
export function nombreDocumentoSeguro(nombre: string): string {
  const limpio = nombre.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '_').trim();
  const conservado = limpio || 'archivo';
  return conservado.length > 180 ? conservado.slice(-180) : conservado;
}
