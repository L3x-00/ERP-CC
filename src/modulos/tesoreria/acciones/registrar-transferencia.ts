'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorTesoreria } from '@/modulos/tesoreria/servicios/errores-tesoreria';
import { esquemaTransferencia } from '@/modulos/tesoreria/validaciones/esquemas-tesoreria';

export type ResultadoTransferencia = { salidaId: string; entradaId: string; monto: number };

/** SII-B8 F5: transferencia interna entre cuentas (par enlazado, misma moneda). */
export async function registrarTransferenciaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoTransferencia>> {
  const analisis = esquemaTransferencia.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para operar tesorería' };
  }

  const correlationId = nuevoCorrelationId();
  const { data, error } = await crearClienteSupabaseAdmin().rpc('registrar_transferencia', {
    p_cuenta_origen_id: datos.cuentaOrigenId,
    p_cuenta_destino_id: datos.cuentaDestinoId,
    p_monto: datos.monto,
    p_referencia: datos.referencia ?? null,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: traducirErrorTesoreria(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(usuario, 'registrar_transferencia', 'tesoreria', fila.salida_id,
    { entradaId: fila.entrada_id, monto: fila.monto, moneda: fila.moneda }, correlationId);

  return {
    exito: true,
    datos: { salidaId: fila.salida_id, entradaId: fila.entrada_id, monto: Number(fila.monto) },
  };
}
