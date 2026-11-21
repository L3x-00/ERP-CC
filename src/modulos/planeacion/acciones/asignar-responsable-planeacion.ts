'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/**
 * PLAN-1: fija el responsable de la partida desde Planeación. `operadorId` null
 * significa «quien sea reclame» y deja la columna sin asignar.
 */
export async function asignarResponsablePlaneacionAccion(entrada: {
  partidaId: string;
  operadorId: string | null;
}): Promise<RespuestaAccion<{ partidaId: string; operadorId: string | null }>> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para asignar responsables desde Planeación' };
  }

  const { error } = await crearClienteSupabaseAdmin()
    .rpc('asignar_operador_a_partida_op', {
      p_partida_id: entrada.partidaId,
      p_operador_id: entrada.operadorId,
    });
  if (error) {
    return { exito: false, error: `No se pudo asignar el responsable: ${error.message}` };
  }

  await registrarLog(usuario, 'asignar_responsable_planeacion', 'planeacion', entrada.partidaId, {
    operadorId: entrada.operadorId,
  }, correlationId);
  return {
    exito: true,
    datos: { partidaId: entrada.partidaId, operadorId: entrada.operadorId },
  };
}
