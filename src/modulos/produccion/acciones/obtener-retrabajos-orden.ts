'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerRetrabajosOrdenServicio } from '@/modulos/produccion/servicios/indice';
import type { RetrabajoDetalle } from '@/modulos/produccion/tipos/indice';

import { obtenerActorProduccion } from './utilidades-acciones';

const esquema = z.object({ ordenId: z.uuid() }).strict();

/** C13.2: retrabajos de la orden para el panel de Producción (solo lectura). */
export async function obtenerRetrabajosOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RetrabajoDetalle[]>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  const autorizado = (await can(actor, 'gestionar_produccion'))
    || (await can(actor, 'ver_finanzas'));
  if (!autorizado) return { exito: false, error: 'Sin permiso para ver retrabajos' };

  try {
    const datos = await obtenerRetrabajosOrdenServicio(crearClienteSupabaseAdmin(), {
      ordenId: analisis.data.ordenId,
      actorId: actor.id,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar retrabajos:', error);
    return { exito: false, error: 'No se pudieron cargar los retrabajos' };
  }
}
