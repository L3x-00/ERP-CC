'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  ajustarOrdenPostAceptacionServicio,
  codigoErrorOrdenSii,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiEstadoActualizado } from '@/modulos/ordenes/tipos/orden-sii';
import { esquemaAjustarOrdenPostAceptacion } from '@/modulos/ordenes/validaciones/orden-sii';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  sin_permiso_orden: 'No tienes permiso para editar la orden.',
  orden_inexistente: 'La orden ya no existe.',
  orden_desactualizada: 'La orden cambió; recarga antes de ajustar.',
  orden_en_produccion: 'La orden ya entró a producción; no admite ajustes de alcance.',
  motivo_requerido: 'Indica el motivo del ajuste (3 a 500 caracteres).',
  cambios_requeridos: 'Indica al menos un cambio.',
  campo_invalido: 'Hay un campo no permitido en el ajuste.',
  fecha_compromiso_requerida: 'La fecha compromiso no es válida.',
  prioridad_invalida: 'La prioridad no es válida.',
  notas_invalidas: 'Las notas exceden la longitud permitida.',
  partidas_invalidas: 'La lista de partidas no es válida.',
  partida_invalida: 'Revisa las partidas ajustadas (cantidad y pertenencia a la orden).',
};

export async function ajustarOrdenPostAceptacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenSiiEstadoActualizado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaAjustarOrdenPostAceptacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_editar'))) {
    return { exito: false, error: 'Sin permiso para editar la orden' };
  }

  try {
    const orden = await ajustarOrdenPostAceptacionServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(usuario, 'ajustar_orden_post_aceptacion', 'ordenes', orden.id, {
      motivo: analisis.data.motivo,
      cambios: analisis.data.cambios,
    }, correlationId);
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.error('[ORDENES] Error al ajustar orden post-aceptación:', error);
    await registrarLog(usuario, 'ajustar_orden_post_aceptacion_rechazada', 'ordenes', analisis.data.ordenId, {
      codigo,
    }, correlationId);
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo ajustar la orden' };
  }
}
