'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerTotalesCorridasOrdenServicio } from '@/modulos/produccion/servicios/totales-corrida-servicio';
import type { TotalesCorridasOrden } from '@/modulos/produccion/tipos/totales-corrida';

import { obtenerActorProduccion } from './utilidades-acciones';

const esquema = z.object({ ordenId: z.uuid('Orden inválida') }).strict();

/**
 * C4: lectura agregada por lote. Tiempo y material son visibles para quien
 * opera; los importes solo para perfiles que ya pueden ver rentabilidad.
 */
export async function obtenerTotalesCorridasOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<TotalesCorridasOrden>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  const [puedeVerFinanzas, puedeGestionar, puedeOperar] = await Promise.all([
    can(actor, 'ver_finanzas'),
    can(actor, 'gestionar_produccion'),
    can(actor, 'produccion_operar'),
  ]);
  if (!puedeVerFinanzas && !puedeGestionar && !puedeOperar) {
    return { exito: false, error: 'Sin permiso para consultar las corridas' };
  }

  try {
    const datos = await obtenerTotalesCorridasOrdenServicio(crearClienteSupabaseAdmin(), {
      ordenId: analisis.data.ordenId,
      incluirCostos: puedeVerFinanzas || puedeGestionar,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar totales de corrida:', error);
    return { exito: false, error: 'No se pudieron cargar los totales de las corridas' };
  }
}
