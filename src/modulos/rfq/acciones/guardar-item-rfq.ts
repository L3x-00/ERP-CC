'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { valorJsonAItemRfq, type RfqItem } from '../tipos/indice';
import { esquemaGuardarItemRfq, type DatosItemRfqInput } from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

function datosParaRpc(datos: DatosItemRfqInput): Record<string, unknown> {
  const carga: Record<string, unknown> = {
    descripcion: datos.descripcion,
    cantidad: datos.cantidad,
    material_id: datos.materialId ?? null,
    espesor_id: datos.espesorId ?? null,
    acabado: datos.acabado ?? null,
    notas: datos.notas ?? null,
  };
  if (datos.procesoIds !== undefined) {
    carga.proceso_ids = datos.procesoIds;
  }
  return carga;
}

/**
 * Server Action: alta o edición de un ítem ITxx. Valida sesión, permiso
 * `rfq_item_editar`, y delega la numeración/CAS/reglas de material a la RPC.
 * La edición exige el token `actualizadoEn` del ítem (compare-and-set).
 */
export async function guardarItemRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RfqItem>> {
  const resultado = esquemaGuardarItemRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_item_editar'))) {
    return { exito: false, error: 'Sin permiso para editar ítems del RFQ' };
  }

  const { rfqId, itemId, actualizadoEn, datos } = resultado.data;
  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const carga = datosParaRpc(datos);

  const respuesta = itemId
    ? await admin.rpc('actualizar_item_rfq', {
        p_item_id: itemId,
        p_datos: { ...carga, actualizado_en: actualizadoEn } as Json,
        p_actor_id: usuario.id,
        p_correlation_id: correlationId,
      })
    : await admin.rpc('crear_item_rfq', {
        p_rfq_id: rfqId!,
        p_datos: carga as Json,
        p_actor_id: usuario.id,
        p_correlation_id: correlationId,
      });

  if (respuesta.error || respuesta.data === null) {
    console.error('[RFQ] Error al guardar ítem:', respuesta.error?.message);
    await registrarLog(usuario, 'guardar_item_rfq_rechazado', 'pipeline', itemId ?? rfqId ?? '', {
      codigo: (respuesta.error?.message ?? 'sin_respuesta').slice(0, 120),
    });
    return {
      exito: false,
      error: mensajeErrorRfq(respuesta.error?.message ?? '', respuesta.error?.details),
    };
  }

  const item = valorJsonAItemRfq(respuesta.data);
  if (!item) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  await registrarLog(
    usuario,
    itemId ? 'actualizar_item_rfq' : 'crear_item_rfq',
    'pipeline',
    item.rfqId,
    { codigo: item.codigo },
    correlationId,
  );

  return { exito: true, datos: item };
}
