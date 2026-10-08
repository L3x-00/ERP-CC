'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { registrarVersionRfq } from '../servicios/registrar-version-rfq';
import { valorJsonAItemRfq, type RfqItem } from '../tipos/indice';
import { esquemaCancelarItemRfq } from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

/**
 * Server Action: cancelación lógica de un ítem RFQ (el folio ITxx no se
 * reutiliza). La RPC bloquea el RFQ, rechaza ítems con documentos vigentes y
 * conserva la traza del motivo en las notas.
 */
export async function cancelarItemRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RfqItem>> {
  const resultado = esquemaCancelarItemRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_item_editar'))) {
    return { exito: false, error: 'Sin permiso para editar ítems del RFQ' };
  }

  const { itemId, motivo } = resultado.data;
  const correlationId = nuevoCorrelationId();

  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('cancelar_item_rfq', {
    p_item_id: itemId,
    p_motivo: motivo ?? '',
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  if (error || data === null) {
    console.error('[RFQ] Error al cancelar ítem:', error?.message);
    await registrarLog(usuario, 'cancelar_item_rfq_rechazado', 'pipeline', itemId, {
      codigo: (error?.message ?? 'sin_respuesta').slice(0, 120),
    });
    return { exito: false, error: mensajeErrorRfq(error?.message ?? '', error?.details) };
  }

  const item = valorJsonAItemRfq(data);
  if (!item) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  await registrarVersionRfq(admin, {
    rfqId: item.rfqId,
    causa: 'ITEM',
    actorId: usuario.id,
    correlationId,
  });
  await registrarLog(
    usuario,
    'cancelar_item_rfq',
    'pipeline',
    item.rfqId,
    { codigo: item.codigo, ...(motivo ? { motivo } : {}) },
    correlationId,
  );

  return { exito: true, datos: item };
}
