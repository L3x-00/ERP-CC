'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  obtenerItemsCorridaServicio,
  obtenerTiemposIntegradosOrdenServicio,
} from '@/modulos/produccion/servicios/indice';
import type { ItemCorrida, TiempoItemIntegrado } from '@/modulos/produccion/tipos/indice';

import { obtenerActorProduccion } from './utilidades-acciones';

const esquema = z.object({ corridaId: z.uuid() }).strict();
const esquemaOrden = z.object({ ordenId: z.uuid() }).strict();

/** C13.4: ítems de la corrida para la captura integrada. */
export async function obtenerItemsCorridaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ItemCorrida[]>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  try {
    const datos = await obtenerItemsCorridaServicio(crearClienteSupabaseAdmin(), {
      corridaId: analisis.data.corridaId,
      actorId: actor.id,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar ítems de la corrida:', error);
    return { exito: false, error: 'No se pudieron cargar los ítems de la corrida' };
  }
}

/** C13.4: sesiones integradas y sus tiempos por ítem. */
export async function obtenerTiemposIntegradosAccion(
  entrada: unknown,
): Promise<RespuestaAccion<TiempoItemIntegrado[]>> {
  const analisis = esquemaOrden.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  try {
    const datos = await obtenerTiemposIntegradosOrdenServicio(crearClienteSupabaseAdmin(), {
      ordenId: analisis.data.ordenId,
      actorId: actor.id,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar tiempos integrados:', error);
    return { exito: false, error: 'No se pudieron cargar los tiempos por ítem' };
  }
}
