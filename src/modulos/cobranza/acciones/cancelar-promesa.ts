'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeErrorCobranza } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaCancelarPromesa } from '@/modulos/cobranza/validaciones/promesas';

/** SII-B8 F3: cancela una promesa vigente/vencida con motivo. */
export async function cancelarPromesaPagoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ promesaId: string }>> {
  const analisis = esquemaCancelarPromesa.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para cancelar promesas' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('cancelar_promesa_pago', {
    p_promesa_id: datos.promesaId,
    p_motivo: datos.motivo,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: mensajeErrorCobranza(error ?? new Error('sin_respuesta')) };
  }

  await registrarLog(
    usuario,
    'cancelar_promesa_pago',
    'cobranza',
    datos.promesaId,
    { motivo: datos.motivo },
    correlationId,
  );

  return { exito: true, datos: { promesaId: fila.id } };
}
