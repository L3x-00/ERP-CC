'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearCorridaServicio } from '@/modulos/produccion/servicios/corridas-servicio';
import type { Corrida } from '@/modulos/produccion/tipos/corridas';
import { esquemaCrearCorrida } from '@/modulos/produccion/validaciones/corridas';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';

import { obtenerActorProduccion } from './utilidades-acciones';

/**
 * SII-B6.1: crea una corrida con ítems compatibles (misma orden, proceso y
 * grupo de equipo). Requiere `gestionar_produccion`; la RPC revalida el actor.
 */
export async function crearCorridaAccion(entrada: unknown): Promise<RespuestaAccion<Corrida>> {
  const resultado = esquemaCrearCorrida.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para crear corridas' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const corrida = await crearCorridaServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
    });
    await registrarLog(actor, 'crear_corrida', 'produccion', corrida.id, {
      ordenId: corrida.ordenId,
      codigo: corrida.codigo,
      procesoId: corrida.procesoId,
      items: corrida.items.length,
    }, correlationId);
    return { exito: true, datos: corrida };
  } catch (error) {
    console.error('[PRODUCCION] Error al crear corrida:', error);
    await registrarLog(actor, 'crear_corrida_rechazado', 'produccion', resultado.data.ordenId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
