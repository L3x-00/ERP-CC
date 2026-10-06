'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorTesoreria } from '@/modulos/tesoreria/servicios/errores-tesoreria';
import { esquemaSaldoInicial } from '@/modulos/tesoreria/validaciones/esquemas-tesoreria';

/** SII-B8 F5: registra/actualiza el saldo inicial de una cuenta. */
export async function registrarSaldoInicialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ cuentaId: string; monto: number }>> {
  const analisis = esquemaSaldoInicial.safeParse(entrada);
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
  const { data, error } = await crearClienteSupabaseAdmin().rpc('registrar_saldo_inicial', {
    p_cuenta_id: datos.cuentaId,
    p_monto: datos.monto,
    p_moneda: datos.moneda,
    p_tipo_cambio: datos.tipoCambio,
    p_fecha: datos.fecha,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: traducirErrorTesoreria(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(usuario, 'registrar_saldo_inicial', 'tesoreria', datos.cuentaId,
    { monto: datos.monto, moneda: datos.moneda }, correlationId);

  return { exito: true, datos: { cuentaId: fila.cuenta_id, monto: Number(fila.monto) } };
}
