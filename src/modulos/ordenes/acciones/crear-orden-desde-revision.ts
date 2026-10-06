'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  codigoErrorOrdenSii,
  crearOrdenDesdeRevisionServicio,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiCreada } from '@/modulos/ordenes/tipos/orden-sii';
import { esquemaCrearOrdenDesdeRevision } from '@/modulos/ordenes/validaciones/orden-sii';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  revision_no_aceptada: 'La orden solo nace de la revisión aceptada vigente.',
  revision_inexistente: 'La revisión ya no existe.',
  cliente_no_activo: 'El cliente de la propuesta no está activo.',
  credito_limite_excedido: 'El cliente excede su límite de crédito; requiere autorización de un administrador.',
  tipo_cambio_usd_requerido: 'Configura el tipo de cambio USD antes de confirmar una venta en dólares.',
  propuesta_sin_items_fabricables: 'La revisión no tiene ítems fabricables.',
  sin_permiso_orden: 'No tienes permiso para crear órdenes.',
  cliente_no_corresponde_orden: 'El cliente no corresponde a la orden existente.',
};

export async function crearOrdenDesdeRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenSiiCreada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCrearOrdenDesdeRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_liberar'))) {
    return { exito: false, error: 'Sin permiso para crear órdenes' };
  }

  try {
    const orden = await crearOrdenDesdeRevisionServicio(crearClienteSupabaseAdmin(), {
      revisionId: analisis.data.revisionId,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(
      usuario,
      orden.yaExistia ? 'crear_orden_ya_existia' : 'crear_orden_desde_revision',
      'ordenes',
      orden.id,
      { folio: orden.folio, folioSii: orden.folioSii, revisionId: analisis.data.revisionId, yaExistia: orden.yaExistia },
      correlationId,
    );
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.error('[ORDENES] Error al crear orden desde revisión:', error);
    await registrarLog(usuario, 'crear_orden_desde_revision_rechazada', 'ordenes', analisis.data.revisionId, {
      codigo,
    }, correlationId);
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo crear la orden' };
  }
}
