'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  mensajeErrorSesion,
  registrarRetrabajoServicio,
} from '@/modulos/produccion/servicios/indice';
import type { RetrabajoRegistrado } from '@/modulos/produccion/tipos/indice';
import { esquemaRegistrarRetrabajo } from '@/modulos/produccion/validaciones/indice';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

/**
 * C13.2: el operador declara el retrabajo al cerrar su sesión. El trabajo extra
 * consume material propio y queda en un registro aparte; no altera el avance.
 * La RPC valida que el actor sea el operador de la sesión o producción.
 */
export async function registrarRetrabajoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RetrabajoRegistrado>> {
  const resultado = esquemaRegistrarRetrabajo.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'registrar_retrabajo',
    resultado.data.sesionId,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const retrabajo = await registrarRetrabajoServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
    });
    await registrarLog(actor, 'registrar_retrabajo', 'produccion', retrabajo.id, {
      sesionId: resultado.data.sesionId,
      materialId: retrabajo.materialId,
      cantidadUsada: retrabajo.cantidadUsada,
      cantidadScrap: retrabajo.cantidadScrap,
      minutos: retrabajo.minutos,
      causa: retrabajo.causa,
      resultado: retrabajo.resultado,
    }, correlationId);
    return { exito: true, datos: retrabajo };
  } catch (error) {
    console.error('[PRODUCCION] Error al registrar retrabajo:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
