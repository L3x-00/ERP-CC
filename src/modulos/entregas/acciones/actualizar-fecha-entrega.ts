'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorEntrega } from '@/modulos/entregas/servicios/errores-entrega';
import { esquemaActualizarFechaEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type ResultadoFechaEntrega = {
  id: string;
  fechaEntrega: string;
  actualizadoEn: string;
};

/**
 * SII-B7 (§7.1): corrige la fecha de entrega de una nota con CAS
 * (`actualizadoEn`) y permiso `entrega_generar`.
 */
export async function actualizarFechaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoFechaEntrega>> {
  const analisis = esquemaActualizarFechaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'entrega_generar'))) {
    return { exito: false, error: 'Sin permiso para editar entregas' };
  }

  const correlationId = nuevoCorrelationId();
  const { data, error } = await crearClienteSupabaseAdmin().rpc('actualizar_fecha_entrega', {
    p_nota_id: analisis.data.entregaId,
    p_fecha_entrega: analisis.data.fechaEntrega,
    p_actualizado_en_esperado: analisis.data.actualizadoEn,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    console.error('[ENTREGAS] Fecha de entrega rechazada:', error?.message);
    await registrarLog(
      usuario,
      'actualizar_fecha_entrega_rechazada',
      'entregas',
      analisis.data.entregaId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: traducirErrorEntrega(error?.message ?? '') };
  }

  await registrarLog(
    usuario,
    'actualizar_fecha_entrega',
    'entregas',
    fila.id,
    { fechaEntrega: fila.fecha_entrega },
    correlationId,
  );

  return {
    exito: true,
    datos: { id: fila.id, fechaEntrega: fila.fecha_entrega, actualizadoEn: fila.actualizado_en },
  };
}
