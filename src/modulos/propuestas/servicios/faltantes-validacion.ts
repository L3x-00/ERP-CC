import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  obtenerArchivosDePropuesta,
  obtenerIdsItemsRfq,
  obtenerPropuestaPorId,
} from '@/modulos/propuestas/servicios/obtener-propuesta';
import { calcularFaltantesValidacion } from '@/modulos/propuestas/utilidades/validacion-propuesta';

/**
 * Lo que falta de CONTENIDO para validar una revisión (ítem, ruteo costeado por
 * proceso y archivo), calculado con la misma función que usa la ficha. Las
 * confirmaciones «Requiere revisión» las sigue validando la RPC. Devuelve null
 * si no se pudo evaluar: quien llama debe bloquear en vez de dejar pasar.
 */
export async function obtenerFaltantesContenidoRevision(
  cliente: SupabaseClient<Database>,
  revisionId: string,
): Promise<string[] | null> {
  try {
    const { data: fila } = await cliente
      .from('propuesta_revisiones')
      .select('propuesta_id')
      .eq('id', revisionId)
      .maybeSingle();
    if (!fila) return null;

    const datos = await obtenerPropuestaPorId(cliente, fila.propuesta_id);
    const revision = datos?.revisiones.find((candidata) => candidata.id === revisionId);
    if (!datos || !revision) return null;

    const rfqItemIds = await obtenerIdsItemsRfq(cliente, datos.propuesta.rfqId);
    const archivos = await obtenerArchivosDePropuesta(cliente, {
      revisionIds: datos.revisiones.map((candidata) => candidata.id),
      itemIds: datos.items.map((item) => item.id),
      rfqId: datos.propuesta.rfqId,
      rfqItemIds,
    });

    return calcularFaltantesValidacion({
      revision,
      revisiones: datos.revisiones,
      items: datos.items,
      ruteo: datos.ruteo,
      archivos,
    }).contenido;
  } catch (error) {
    console.error(
      '[PROPUESTAS] No se pudo comprobar el contenido para validar:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Mensaje al usuario cuando la revisión no está completa; null si ya puede validarse. */
export async function mensajeBloqueoValidacion(
  cliente: SupabaseClient<Database>,
  revisionId: string,
): Promise<string | null> {
  const faltantes = await obtenerFaltantesContenidoRevision(cliente, revisionId);
  if (faltantes === null) {
    return 'No se pudo comprobar que la propuesta esté completa. Inténtalo de nuevo.';
  }
  if (faltantes.length === 0) return null;
  return `La propuesta está incompleta. Falta: ${faltantes.join('; ')}.`;
}
