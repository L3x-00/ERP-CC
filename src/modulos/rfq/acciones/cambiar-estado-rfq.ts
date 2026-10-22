'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { normalizarEstadoRfq, type EstadoRfq } from '../tipos/indice';
import { permisoDeAccionRfq } from '../utilidades/estados';
import { esAccionTerminalRfq, esquemaCambiarEstadoRfq } from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

/**
 * Server Action: único camino de cambio de estado del RFQ. Valida sesión,
 * permiso por acción con `can()` y delega en la RPC que revalida transición,
 * CAS, la próxima acción de las transiciones no terminales (C2.2) y, en
 * `marcar_listo`, la validación LISTO completa. Registra el evento
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

  const {
    rfqId,
    accion,
    motivo,
    proximaAccion,
    mantenerProximaAccion,
    resultadoProximaAccion,
    actualizadoEn,
  } = resultado.data;

  if (!(await can(usuario, permisoDeAccionRfq(accion)))) {
    return { exito: false, error: 'Sin permiso para esta acción' };
  }

  const admin = crearClienteSupabaseAdmin();
  const correlationId = nuevoCorrelationId();
  const args: Record<string, unknown> = { actualizado_en: actualizadoEn };
  if (motivo) args.motivo = motivo;

  // Obs. cliente 2026-10-21: la acción vigente solo se sustituye con su resultado;
  // si sigue teniendo sentido se conserva sin volver a capturarla. La fila se lee
  // en el servidor: el navegador no dicta qué acción estaba vigente.
  let vigente: { codigo: string; fecha: string | null } | null = null;
  let proximaParaRpc: Record<string, unknown> | null = proximaAccion
    ? {
        codigo: proximaAccion.codigo,
        texto: proximaAccion.texto ?? null,
        fecha: proximaAccion.fecha,
        responsable_id: proximaAccion.responsableId,
      }
    : null;

  if (!esAccionTerminalRfq(accion)) {
    const { data: fila } = await admin
      .from('pipeline')
      .select(
        'proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion, responsable_proxima_accion_id, actualizado_en',
      )
      .eq('id', rfqId)
      .maybeSingle();
    if (!fila) {
      return { exito: false, error: 'El RFQ no existe' };
    }
    if (fila.actualizado_en !== actualizadoEn) {
      return { exito: false, error: 'El RFQ cambió; recarga antes de reintentar' };
    }
    const fechaVigente = fila.fecha_proxima_accion?.slice(0, 10) ?? null;
    vigente = fila.proxima_accion_codigo
      ? { codigo: fila.proxima_accion_codigo, fecha: fechaVigente }
      : null;

    if (mantenerProximaAccion) {
      if (!vigente || !fechaVigente || !fila.responsable_proxima_accion_id) {
        return { exito: false, error: 'No hay una acción de seguimiento pendiente; indica la próxima acción' };
      }
      if (fechaVigente < new Date().toISOString().slice(0, 10)) {
        return {
          exito: false,
          error: 'La acción de seguimiento ya venció; indica cómo terminó y define la siguiente',
        };
      }
      proximaParaRpc = {
        codigo: vigente.codigo,
        texto: fila.proxima_accion_texto,
        fecha: fechaVigente,
        responsable_id: fila.responsable_proxima_accion_id,
      };
    } else if (vigente && !resultadoProximaAccion) {
      return { exito: false, error: 'Indica cómo terminó la acción de seguimiento actual' };
    }
  }

  // C2.2: la próxima acción se guarda en la misma operación que el estado.
  if (proximaParaRpc) args.proxima_accion = proximaParaRpc;

  const { data, error } = await admin.rpc('cambiar_estado_rfq', {
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

  // El resultado queda en Actividad con una acción propia por resultado: el
  // contexto de la bitácora solo lo ve el admin y el resultado debe leerse siempre.
  if (vigente && resultadoProximaAccion && proximaAccion) {
    await registrarLog(
      usuario,
      `seguimiento_${resultadoProximaAccion}`,
      'pipeline',
      rfqId,
      {
        accionAnterior: vigente.codigo,
        ...(vigente.fecha ? { fechaAnterior: vigente.fecha } : {}),
        accionNueva: proximaAccion.codigo,
        fechaNueva: proximaAccion.fecha,
      },
      correlationId,
    );
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
