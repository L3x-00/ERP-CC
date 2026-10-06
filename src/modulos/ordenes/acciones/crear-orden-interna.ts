'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  codigoErrorOrdenSii,
  crearOrdenInternaServicio,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiCreada } from '@/modulos/ordenes/tipos/orden-sii';
import { esquemaCrearOrdenInterna } from '@/modulos/ordenes/validaciones/orden-sii';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  sin_permiso_orden_interna: 'Solo Management/Admin pueden autorizar órdenes internas.',
  cliente_no_activo: 'El cliente seleccionado no está activo.',
  autorizacion_requerida: 'La autorización es obligatoria para una orden interna.',
  motivo_autorizacion_requerido: 'Indica el motivo de la autorización (3 a 300 caracteres).',
  autorizador_invalido: 'El autorizante debe ser un gerente o administrador activo.',
  fecha_compromiso_requerida: 'Indica la fecha compromiso.',
  prioridad_invalida: 'La prioridad no es válida.',
  items_requeridos: 'La orden interna requiere al menos un ítem.',
  item_invalido: 'Revisa descripción, cantidades y procesos de los ítems.',
};

export async function crearOrdenInternaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenSiiCreada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCrearOrdenInterna.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_crear_interna'))) {
    return { exito: false, error: 'Solo Management/Admin pueden autorizar órdenes internas' };
  }

  try {
    const orden = await crearOrdenInternaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(usuario, 'crear_orden_interna', 'ordenes', orden.id, {
      folioSii: orden.folioSii,
      motivo: analisis.data.motivoAutorizacion,
      items: analisis.data.items.length,
    }, correlationId);
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.error('[ORDENES] Error al crear orden interna:', error);
    await registrarLog(usuario, 'crear_orden_interna_rechazada', 'ordenes', analisis.data.clienteId, {
      codigo,
    }, correlationId);
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo crear la orden interna' };
  }
}
