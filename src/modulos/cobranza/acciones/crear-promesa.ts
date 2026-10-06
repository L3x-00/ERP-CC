'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeErrorCobranza } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaCrearPromesa } from '@/modulos/cobranza/validaciones/promesas';

export type ResultadoPromesa = {
  promesaId: string;
  fechaPrometida: string;
  monto: number;
  estado: string;
};

/** SII-B8 F3: registra la promesa de pago de una cuenta. */
export async function crearPromesaPagoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoPromesa>> {
  const analisis = esquemaCrearPromesa.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para registrar promesas' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('crear_promesa_pago', {
    p_cuenta_id: datos.cuentaId,
    p_fecha_prometida: datos.fechaPrometida,
    p_monto: datos.monto,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    await registrarLog(
      usuario,
      'crear_promesa_pago_rechazado',
      'cobranza',
      datos.cuentaId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: mensajeErrorCobranza(error ?? new Error('sin_respuesta')) };
  }

  await registrarLog(
    usuario,
    'crear_promesa_pago',
    'cobranza',
    fila.id,
    { cuentaId: datos.cuentaId, fecha: datos.fechaPrometida, monto: datos.monto },
    correlationId,
  );

  return {
    exito: true,
    datos: {
      promesaId: fila.id,
      fechaPrometida: fila.fecha_prometida,
      monto: Number(fila.monto),
      estado: fila.estado,
    },
  };
}
