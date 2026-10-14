'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { esquemaEditarRuteoItem } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerBooleano,
  leerNumero,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoEditarRuteoItem = {
  itemId: string;
  filas: number;
  requiereRevisionRuteo: boolean;
  /**
   * Token CAS vigente de la revisión tras guardar (la RPC lo avanza). Permite
   * guardar el ruteo de varios ítems seguidos sin recargar la ficha; ausente si
   * no se pudo leer.
   */
  actualizadoEn?: string;
};

/** Lee el `actualizado_en` de la revisión del ítem; nunca rompe un guardado ya hecho. */
async function leerTokenRevision(itemId: string): Promise<string | undefined> {
  try {
    const admin = crearClienteSupabaseAdmin();
    const { data: item } = await admin
      .from('propuesta_items')
      .select('revision_id')
      .eq('id', itemId)
      .maybeSingle();
    if (!item) return undefined;
    const { data: revision } = await admin
      .from('propuesta_revisiones')
      .select('actualizado_en')
      .eq('id', item.revision_id)
      .maybeSingle();
    return revision?.actualizado_en ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * SII-B4.5/4.9: reemplaza el ruteo estimado de un ítem DRAFT. Guardar el ruteo
 * confirma las filas y limpia `requiere_revision` del ítem.
 */
export async function editarRuteoItemAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEditarRuteoItem>> {
  const analisis = esquemaEditarRuteoItem.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const filas = datos.filas.map((fila) => ({
    proceso_id: fila.procesoId,
    grupo_equipo_id: fila.grupoEquipoId ?? null,
    grupo_planeado_id: fila.grupoPlaneadoId ?? null,
    recurso_id: fila.recursoId ?? null,
    setup_horas: fila.setupHoras,
    run_horas: fila.runHoras,
  }));

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_editar_ruteo',
      rpc: 'editar_ruteo_item',
      args: {
        p_item_id: datos.itemId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn, filas }),
      },
      accion: 'editar_ruteo_item',
      detalles: { itemId: datos.itemId, filas: filas.length },
    },
    datos.itemId,
  );
  if (!respuesta.exito) return respuesta;

  const actualizadoEn = await leerTokenRevision(datos.itemId);
  return {
    exito: true,
    datos: {
      itemId: datos.itemId,
      filas: leerNumero(respuesta.datos, 'filas') ?? 0,
      requiereRevisionRuteo: leerBooleano(respuesta.datos, 'requiereRevisionRuteo') ?? false,
      ...(actualizadoEn !== undefined ? { actualizadoEn } : {}),
    },
  };
}
