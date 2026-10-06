'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorTesoreria } from '@/modulos/tesoreria/servicios/errores-tesoreria';
import { esquemaConciliacion } from '@/modulos/tesoreria/validaciones/esquemas-tesoreria';

/** SII-B8 F5: marca un movimiento como conciliado (auditado). */
export async function conciliarMovimientoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ entidad: string; entidadId: string }>> {
  const analisis = esquemaConciliacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para conciliar' };
  }

  const correlationId = nuevoCorrelationId();
  const { data, error } = await crearClienteSupabaseAdmin().rpc('conciliar_movimiento', {
    p_cuenta_id: datos.cuentaId,
    p_entidad: datos.entidad,
    p_entidad_id: datos.entidadId,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: traducirErrorTesoreria(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(usuario, 'conciliar_movimiento', 'tesoreria', datos.entidadId,
    { entidad: datos.entidad, cuentaId: datos.cuentaId }, correlationId);

  return { exito: true, datos: { entidad: datos.entidad, entidadId: datos.entidadId } };
}
