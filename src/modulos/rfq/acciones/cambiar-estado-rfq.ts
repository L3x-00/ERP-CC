'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { normalizarEstadoRfq, type EstadoRfq } from '../tipos/indice';
import { permisoDeAccionRfq } from '../utilidades/estados';
import { esquemaCambiarEstadoRfq } from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

/**
 * Server Action: único camino de cambio de estado del RFQ. Valida sesión,
 * permiso por acción con `can()` y delega en la RPC que revalida transición,
 * CAS y (en `marcar_listo`) la validación LISTO completa. Registra el evento
 * en `logs` con el mismo `correlationId` que los `rfq_eventos`.
 */
export async function cambiarEstadoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ estadoRfq: EstadoRfq }>> {
  const resultado = esquemaCambiarEstadoRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const { rfqId, accion, motivo, actualizadoEn } = resultado.data;

  if (!(await can(usuario, permisoDeAccionRfq(accion)))) {
    return { exito: false, error: 'Sin permiso para esta acción' };
  }

  const correlationId = nuevoCorrelationId();
  const args: Record<string, unknown> = { actualizado_en: actualizadoEn };
  if (motivo) args.motivo = motivo;

  const { data, error } = await crearClienteSupabaseAdmin().rpc('cambiar_estado_rfq', {
    p_rfq_id: rfqId,
    p_accion: accion,
    p_args: args as Json,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  if (error || typeof data !== 'string') {
    console.error('[RFQ] Error al cambiar estado:', error?.message);
    await registrarLog(usuario, 'cambiar_estado_rfq_rechazado', 'pipeline', rfqId, {
      accion,
      codigo: (error?.message ?? 'sin_respuesta').slice(0, 120),
    });
    return { exito: false, error: mensajeErrorRfq(error?.message ?? '', error?.details) };
  }

  await registrarLog(
    usuario,
    'cambiar_estado_rfq',
    'pipeline',
    rfqId,
    { accion, estado_nuevo: data, ...(motivo ? { motivo } : {}) },
    correlationId,
  );

  return { exito: true, datos: { estadoRfq: normalizarEstadoRfq(data) } };
}
