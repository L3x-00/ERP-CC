'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaFirmarArchivoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

export type ResultadoFirmarArchivo = { url: string };

/** Entidad/ID a los que cuelga el archivo en el modelo único `archivos`. */
type OrigenArchivo = { entidad: string; entidadId: string };

/** Propuesta abierta, ya comprobada como visible por la RLS del usuario. */
type PropuestaAutorizada = { id: string; rfqId: string };

/**
 * ¿La revisión existe y pertenece a la propuesta abierta? Se consulta con el
 * cliente RLS, así que una revisión ajena no visible también responde `false`.
 */
async function revisionEsDeLaPropuesta(
  servidor: SupabaseClient<Database>,
  propuesta: PropuestaAutorizada,
  revisionId: string,
): Promise<boolean> {
  const { data } = await servidor
    .from('propuesta_revisiones')
    .select('id')
    .eq('id', revisionId)
    .eq('propuesta_id', propuesta.id)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Pertenencia del archivo al árbol documental de la propuesta abierta: la
 * propuesta, sus revisiones, los ítems de esas revisiones, el RFQ de origen o
 * los ítems de ese RFQ. Cualquier otra entidad (otra propuesta, una orden, un
 * gasto…) se rechaza aunque la RLS plana de `archivos` la deje leer.
 */
async function archivoPerteneceALaPropuesta(
  servidor: SupabaseClient<Database>,
  propuesta: PropuestaAutorizada,
  origen: OrigenArchivo,
): Promise<boolean> {
  switch (origen.entidad) {
    case 'propuesta':
      return origen.entidadId === propuesta.id;
    case 'propuesta_revision':
      return revisionEsDeLaPropuesta(servidor, propuesta, origen.entidadId);
    case 'propuesta_item': {
      const { data: item } = await servidor
        .from('propuesta_items')
        .select('revision_id')
        .eq('id', origen.entidadId)
        .maybeSingle();
      if (!item) return false;
      return revisionEsDeLaPropuesta(servidor, propuesta, item.revision_id);
    }
    case 'rfq':
      return origen.entidadId === propuesta.rfqId;
    case 'rfq_item': {
      const { data: itemRfq } = await servidor
        .from('rfq_items')
        .select('id')
        .eq('id', origen.entidadId)
        .eq('rfq_id', propuesta.rfqId)
        .maybeSingle();
      return Boolean(itemRfq);
    }
    default:
      return false;
  }
}

/**
 * SII-B4.8: firma una URL corta (120 s) para leer un archivo ligado a la
 * propuesta abierta. Dos comprobaciones con el cliente RLS del usuario antes de
 * usar `service_role`: que pueda leer esa propuesta concreta y que el archivo
 * cuelgue de su árbol documental. La vigencia no importa — una versión
 * histórica del linaje se abre igual (CLI-06).
 */
export async function firmarArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoFirmarArchivo>> {
  const analisis = esquemaFirmarArchivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { propuestaId, archivoId } = analisis.data;

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();

    const { data: filaPropuesta, error: errorPropuesta } = await servidor
      .from('propuestas')
      .select('id, rfq_id')
      .eq('id', propuestaId)
      .maybeSingle();
    if (errorPropuesta || !filaPropuesta) {
      return { exito: false, error: 'Propuesta no encontrada' };
    }
    const propuesta: PropuestaAutorizada = {
      id: filaPropuesta.id,
      rfqId: filaPropuesta.rfq_id,
    };

    const { data: archivo, error: errorArchivo } = await servidor
      .from('archivos')
      .select('id, entidad, entidad_id')
      .eq('id', archivoId)
      .maybeSingle();
    if (errorArchivo || !archivo) {
      return { exito: false, error: 'Archivo no encontrado' };
    }

    const pertenece = await archivoPerteneceALaPropuesta(servidor, propuesta, {
      entidad: archivo.entidad,
      entidadId: archivo.entidad_id,
    });
    if (!pertenece) {
      return { exito: false, error: 'El archivo no pertenece a esta propuesta' };
    }

    const url = await firmarLecturaArchivo(crearClienteSupabaseAdmin(), archivoId, 120);
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: 'No se pudo firmar el archivo' };
  }
}
